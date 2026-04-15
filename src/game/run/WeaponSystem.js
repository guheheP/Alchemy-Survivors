/**
 * WeaponSystem — マルチ武器管理
 * 4枠の武器を装備順に解放。各武器は独立したクールダウンで同時攻撃。
 */

import { ItemBlueprints } from '../data/items.js';
import { StrategyMap } from './weapons/index.js';
import { eventBus } from '../core/EventBus.js';

export class WeaponSystem {
  /**
   * @param {object} player - PlayerController
   * @param {object[]} weaponSlots - 装備した武器アイテム配列 (最大4)
   */
  constructor(player, weaponSlots) {
    this.player = player;
    this.strategies = []; // all strategies (locked + unlocked)
    this.unlockedCount = 0;

    // 全スロットのストラテジーを生成
    for (const weapon of weaponSlots) {
      if (!weapon) continue;
      const bp = ItemBlueprints[weapon.blueprintId];
      if (!bp) continue; // 無効な blueprintId（セーブデータ破損等）はスキップ
      const equipType = bp.equipType || 'sword';
      const StrategyClass = StrategyMap[equipType] || StrategyMap.sword;
      this.strategies.push(new StrategyClass(player, weapon));
    }

    // getSlotInfo の戻り値を使い回す（毎フレーム呼ばれるためアロケーション削減）
    this._slotInfoCache = this.strategies.map(() => ({
      name: '', equipType: '', unlocked: false,
      skillCooldownPct: 0, skillReady: false, skillTier: 0,
    }));

    // 初期は1番目のみ解放
    if (this.strategies.length > 0) {
      this.unlockedCount = 1;
    }
  }

  /** 次の武器を解放 */
  unlockNext() {
    if (this.unlockedCount < this.strategies.length) {
      this.unlockedCount++;
      const unlocked = this.strategies[this.unlockedCount - 1];
      eventBus.emit('weapon:unlocked', {
        index: this.unlockedCount - 1,
        name: unlocked.weaponName,
        equipType: unlocked.equipType,
      });
      return true;
    }
    return false;
  }

  /** 解放可能な武器が残っているか */
  get hasLockedWeapons() {
    return this.unlockedCount < this.strategies.length;
  }

  /** 解放済み武器のリスト */
  get activeStrategies() {
    return this.strategies.slice(0, this.unlockedCount);
  }

  update(dt, enemies, collisionSystem) {
    for (let i = 0; i < this.unlockedCount; i++) {
      this.strategies[i].update(dt, enemies, collisionSystem);
    }
  }

  render(ctx, camera, alpha) {
    for (let i = 0; i < this.unlockedCount; i++) {
      this.strategies[i].render(ctx, camera, alpha);
    }
  }

  /** HUD用の武器スロット情報（キャッシュを書き換えて返す — 毎フレーム呼ばれる） */
  getSlotInfo() {
    for (let i = 0; i < this.strategies.length; i++) {
      const s = this.strategies[i];
      const info = this._slotInfoCache[i];
      const unlocked = i < this.unlockedCount;
      info.name = s.weaponName;
      info.equipType = s.equipType;
      info.unlocked = unlocked;
      info.skillCooldownPct = unlocked ? Math.max(0, s.skillCooldown / s.skillCooldownMax) : 1;
      info.skillReady = unlocked && s.skillCooldown <= 0;
      info.skillTier = s.skillTier;
    }
    return this._slotInfoCache;
  }

  /** 全武器のエフェクト（後方互換用） */
  get slashEffects() {
    const all = [];
    for (let i = 0; i < this.unlockedCount; i++) {
      all.push(...this.strategies[i].effects);
    }
    return all;
  }

  /** リソース解放（ストラテジーのイベント/タイマーリーク対策） */
  destroy() {
    for (const s of this.strategies) {
      if (typeof s.destroy === 'function') s.destroy();
    }
    this.strategies.length = 0;
    this.unlockedCount = 0;
  }
}
