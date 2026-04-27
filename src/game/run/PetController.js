/**
 * PetController — ペットのラン中ライフサイクル管理
 *
 * 役割:
 *   - PetEntity の生成・更新・破棄
 *   - magnet / xpBoost 等のパッシブ効果を player.passives に適用 / 解除
 *   - 経験値の集計（ラン終了時に永続化のため runResult に含める）
 */

import { PetEntity } from './PetEntity.js';
import { PetDefs, getPetBehaviorParams } from '../data/pets.js';
import { eventBus } from '../core/EventBus.js';

export class PetController {
  /**
   * @param {PlayerController} player
   * @param {{id:string, level:number} | null} equippedPet
   */
  constructor(player, equippedPet) {
    this.player = player;
    this.pet = null;
    this._unsubs = [];
    this._appliedPassives = null; // 解除用に記録

    if (equippedPet?.id && PetDefs[equippedPet.id]) {
      this._spawn(equippedPet.id, equippedPet.level || 1);
    }
  }

  _spawn(petId, level) {
    this.pet = new PetEntity(petId, level);
    this.pet.x = this.player.x - 24;
    this.pet.y = this.player.y - 12;

    const def = PetDefs[petId];
    const params = getPetBehaviorParams(petId, level);

    // パッシブ系: player.passives に積算
    const applied = {};
    if (def.behavior === 'magnet') {
      const mult = params.magnetMultiplier || 0;
      this.player.passives.magnetMultiplier = (this.player.passives.magnetMultiplier || 0) + mult;
      applied.magnetMultiplier = mult;
    } else if (def.behavior === 'xpBoost') {
      const expM = params.expMultiplier || 0;
      const dropM = params.dropBonus || 0;
      this.player.passives.expMultiplier = (this.player.passives.expMultiplier || 0) + expM;
      this.player.passives.dropRateBonus = (this.player.passives.dropRateBonus || 0) + dropM;
      applied.expMultiplier = expM;
      applied.dropRateBonus = dropM;
    }
    this._appliedPassives = applied;

    // ペット経験値: ラン中の敵撃破 / ボス撃破に応じて加算
    this._unsubs.push(eventBus.on('enemy:killed', ({ enemy, isBoss }) => {
      if (!this.pet) return;
      const isBossKill = isBoss != null ? isBoss : enemy?.isBoss;
      const xp = isBossKill ? 25 : Math.max(1, Math.floor((enemy?.expValue || 1) * 0.4));
      this.pet.gainExp(xp);
    }));
  }

  /**
   * @param {number} dt
   * @param {Array} allEnemies
   * @param {object} runContext - { player, camera, particles }
   */
  update(dt, allEnemies, runContext) {
    if (!this.pet || !this.pet.active) return;
    this.pet.update(dt, this.player, allEnemies, runContext);
  }

  getPet() {
    return this.pet;
  }

  /** ラン終了時に呼ばれる: 獲得経験値をペットに永続化するためのデータを返す */
  collectRunResult() {
    if (!this.pet) return null;
    return {
      petId: this.pet.petId,
      gainedXp: this.pet.state.gainedXp,
      finalLevel: this.pet.level,
    };
  }

  destroy() {
    // パッシブ解除
    if (this._appliedPassives && this.player?.passives) {
      for (const [key, value] of Object.entries(this._appliedPassives)) {
        this.player.passives[key] = (this.player.passives[key] || 0) - value;
      }
    }
    this._appliedPassives = null;
    for (const u of this._unsubs) {
      try { u(); } catch (e) { /* ignore */ }
    }
    this._unsubs.length = 0;
    if (this.pet) {
      this.pet.active = false;
      this.pet = null;
    }
  }
}
