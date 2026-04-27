/**
 * PetEntity — 召喚されたペットの実体
 * プレイヤーに追従し、behavior に応じた行動を取る。
 */

import { Entity } from './Entity.js';
import { PetDefs, getPetLevelStats, getPetBehaviorParams } from '../data/pets.js';
import { eventBus } from '../core/EventBus.js';

const FOLLOW_DISTANCE = 32;       // プレイヤーからの追従距離
const FOLLOW_SOFTNESS = 6.0;       // 値が大きいほど機敏に追従

export class PetEntity extends Entity {
  /**
   * @param {string} petId
   * @param {number} level
   */
  constructor(petId, level = 1) {
    super();
    this.type = 'pet';
    this.petId = petId;
    this.def = PetDefs[petId];
    this.level = Math.max(1, level);
    this.radius = 8;
    this.active = true;

    const stats = getPetLevelStats(petId, this.level) || { hp: 50, atk: 0, speed: 1 };
    this.maxHp = stats.hp;
    this.hp = this.maxHp;
    this.atk = stats.atk;
    this.speedMult = stats.speed;

    /** behavior パラメータ（Lv 補正済み） */
    this.params = getPetBehaviorParams(petId, this.level);

    /** 行動タイマー（cooldown 系で利用） */
    this._actionTimer = 0;

    /** 移動補間用 */
    this._followAngle = 0; // プレイヤーの後方斜め
    this._anchorOffsetX = -FOLLOW_DISTANCE * 0.7;
    this._anchorOffsetY = -FOLLOW_DISTANCE * 0.4;

    /** behavior 別の状態 */
    this.state = {
      revivedThisRun: false,        // revive: ラン中の発動済みフラグ
      remainingCharges: this.params.charges || 0,
      gainedXp: 0,                  // ラン中に貯めた exp（終了時に永続化）
      lastAttackTargetId: null,     // autoAttack: 直前ターゲット
    };

    /** 直近の攻撃エフェクト用に保持 */
    this.facing = 1;  // 1: 右向き、-1: 左向き
  }

  /** ペット側の被ダメ。HPはあるが死亡時もペットは消えず、復帰タイマーで戻す軽い設計 */
  takeDamage(damage) {
    if (this.hp <= 0) return false;
    this.hp -= damage;
    if (this.hp < 0) this.hp = 0;
    return this.hp <= 0;
  }

  /** ラン中の経験値加算 */
  gainExp(amount) {
    if (amount <= 0) return;
    this.state.gainedXp += amount;
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number}} player
   * @param {Array} allEnemies
   * @param {object} runContext - { camera, particles, runManager? }
   */
  update(dt, player, allEnemies, runContext) {
    this.savePrev();
    this._followPlayer(dt, player);

    this._actionTimer -= dt;
    if (this._actionTimer < 0) this._actionTimer = 0;

    switch (this.def?.behavior) {
      case 'magnet':
        // パッシブ系: 効果は player.passives 側で適用済み（PetController が登録）
        break;
      case 'autoAttack':
        this._tickAutoAttack(dt, allEnemies, runContext);
        break;
      case 'revive':
        this._tickRevive(dt, player);
        break;
      case 'xpBoost':
        // パッシブ系
        break;
      case 'aoe':
        this._tickAoe(dt, allEnemies, runContext);
        break;
      case 'projectile':
        this._tickProjectile(dt, allEnemies, runContext);
        break;
    }
  }

  _followPlayer(dt, player) {
    // 目標位置: プレイヤーの後方（少しオフセット）。プレイヤーの向きに応じて反転。
    const facing = (player.facingAngle != null && Math.cos(player.facingAngle) < 0) ? -1 : 1;
    this.facing = facing;
    const targetX = player.x + this._anchorOffsetX * facing;
    const targetY = player.y + this._anchorOffsetY;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    // 距離が遠ければ素早く、近ければゆっくり
    const k = Math.min(1, FOLLOW_SOFTNESS * dt);
    this.x += dx * k;
    this.y += dy * k;
  }

  _tickAutoAttack(dt, allEnemies, runContext) {
    if (this._actionTimer > 0) return;
    const range = this.params.range || 90;
    const r2 = range * range;
    let target = null;
    let bestD2 = r2;
    for (const e of allEnemies) {
      if (!e.active) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; target = e; }
    }
    if (!target) return;

    // ダメージ = 武器DPSの damageMult 倍に近似（手元の atk + プレイヤー基本ダメージの一部）
    const player = runContext?.player;
    const baseDmg = (player?.baseDamage || 10) * (this.params.damageMult || 0.3);
    const dmg = Math.max(1, baseDmg + this.atk);
    const killed = target.takeDamage(dmg);
    if (killed) {
      eventBus.emit('enemy:killed', { enemy: target, x: target.x, y: target.y, isBoss: target.isBoss, color: target.color });
    } else {
      eventBus.emit('enemy:damaged', { damage: dmg, x: target.x, y: target.y, isCrit: false });
    }
    // ペット攻撃エフェクト
    eventBus.emit('particles:burst', {
      x: target.x, y: target.y, count: 4,
      config: { speed: 80, life: 0.25, size: 2, color: this.def.spriteColor || '#fff', shape: 'spark' },
    });
    this._actionTimer = this.params.cooldown || 1.5;
    this.state.lastAttackTargetId = target.enemyId || null;
  }

  _tickRevive(dt, player) {
    if (this.state.revivedThisRun) return;
    if (this.state.remainingCharges <= 0) return;
    if (player.hp > 0) return;
    // 瀕死: 復活発動
    this.state.revivedThisRun = true;
    this.state.remainingCharges -= 1;
    const heal = (this.params.healPercent || 0.5) * (player.effectiveMaxHp || player.maxHp);
    player.hp = Math.min(player.effectiveMaxHp || player.maxHp, heal);
    player.invincibleTimer = Math.max(player.invincibleTimer || 0, 2.0);
    eventBus.emit('toast', { message: `🔥 ${this.def.name}の力で復活！`, type: 'success' });
    eventBus.emit('fx:shockwave', { x: player.x, y: player.y, color: this.def.spriteColor, maxRadius: 220, duration: 0.7 });
    eventBus.emit('particles:burst', {
      x: player.x, y: player.y, count: 30,
      config: { speed: 200, life: 0.7, size: 4, color: this.def.spriteColor || '#ff7744', shape: 'spark', gravity: 30 },
    });
    eventBus.emit('camera:shake', { power: 8, duration: 0.4 });
  }

  _tickAoe(dt, allEnemies, runContext) {
    if (this._actionTimer > 0) return;
    const radius = this.params.radius || 70;
    const r2 = radius * radius;
    const player = runContext?.player;
    const baseDmg = (player?.baseDamage || 10) * (this.params.damageMult || 1.0);
    let hit = 0;
    for (const e of allEnemies) {
      if (!e.active) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      if (dx * dx + dy * dy < r2) {
        const killed = e.takeDamage(baseDmg + this.atk);
        if (killed) eventBus.emit('enemy:killed', { enemy: e, x: e.x, y: e.y, isBoss: e.isBoss, color: e.color });
        hit++;
      }
    }
    eventBus.emit('fx:shockwave', { x: this.x, y: this.y, color: this.def.spriteColor || '#cc4488', maxRadius: radius, duration: 0.35 });
    eventBus.emit('particles:burst', {
      x: this.x, y: this.y, count: 14,
      config: { speed: 160, life: 0.5, size: 3, color: this.def.spriteColor || '#cc4488', shape: 'spark', gravity: 20 },
    });
    if (hit > 0) eventBus.emit('camera:shake', { power: 3, duration: 0.15 });
    this._actionTimer = this.params.cooldown || 5;
  }

  _tickProjectile(dt, allEnemies, runContext) {
    if (this._actionTimer > 0) return;
    const range = this.params.range || 220;
    const r2 = range * range;
    let target = null;
    let bestScore = -Infinity;
    // ボス優先（bossBonus）
    for (const e of allEnemies) {
      if (!e.active) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const isBoss = !!e.isBoss;
      const score = (isBoss ? 1e6 : 0) + (1 / (d2 + 1));
      if (score > bestScore) { bestScore = score; target = e; }
    }
    if (!target) return;
    const player = runContext?.player;
    const baseDmg = (player?.baseDamage || 10) * (this.params.damageMult || 2.5);
    const bossMult = target.isBoss ? (1 + (this.params.bossBonus || 0)) : 1;
    const dmg = (baseDmg + this.atk) * bossMult;
    const killed = target.takeDamage(dmg);
    if (killed) {
      eventBus.emit('enemy:killed', { enemy: target, x: target.x, y: target.y, isBoss: target.isBoss, color: target.color });
    } else {
      eventBus.emit('enemy:damaged', { damage: dmg, x: target.x, y: target.y, isCrit: false });
    }
    // ブレス演出: 自分→ターゲット の細いビーム + 着弾爆発
    eventBus.emit('particles:burst', {
      x: target.x, y: target.y, count: 18,
      config: { speed: 220, life: 0.55, size: 4, color: this.def.spriteColor || '#ddaa44', shape: 'spark', gravity: 0 },
    });
    eventBus.emit('camera:shake', { power: 4, duration: 0.2 });
    this._actionTimer = this.params.cooldown || 10;
  }
}
