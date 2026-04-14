/**
 * DropSystem — 経験値ジェム・素材ドロップ管理
 */

import { Entity } from './Entity.js';
import { ObjectPool } from './ObjectPool.js';
import { GameConfig } from '../data/config.js';
import { Progression } from '../data/progression.js';
import { eventBus } from '../core/EventBus.js';

class Drop extends Entity {
  constructor() {
    super();
    this.type = 'drop';
    this.dropType = 'exp'; // 'exp' | 'material'
    this.value = 0;
    this.blueprintId = null;
    this.quality = 0;
    this.traits = [];
    this.radius = 4;
    this.color = '#ff0';
  }

  reset() {
    super.reset();
    this.dropType = 'exp';
    this.value = 0;
    this.blueprintId = null;
    this.quality = 0;
    this.traits = [];
    this.color = '#ff0';
  }
}

export class DropSystem {
  /**
   * @param {object[]} areaDropTable - ドロップテーブル
   * @param {string[]} traitPool - エリアの特性プール
   * @param {number} qualityMin - エリアの最低品質
   * @param {number} qualityMax - エリアの最高品質
   */
  constructor(areaDropTable, traitPool = [], qualityMin = 10, qualityMax = 40, dropRateMultiplier = 1) {
    this.pool = new ObjectPool(() => new Drop(), 300);
    this.dropTable = areaDropTable;
    this.totalWeight = areaDropTable.reduce((sum, d) => sum + d.weight, 0);
    this.traitPool = traitPool;
    this.qualityMin = qualityMin;
    this.qualityMax = qualityMax;
    this.dropRateMultiplier = dropRateMultiplier;
    this.collectedMaterials = []; // ラン中に集めた素材リスト
  }

  /** 時間経過による品質ボーナス（ラン経過分を外部から設定） */
  setElapsedTime(elapsed) {
    this._elapsed = elapsed || 0;
  }

  /** 敵撃破時にドロップ生成 */
  spawnDrops(x, y, expValue, dropRateBonus = 0) {
    // 経験値ジェム
    const expDrop = this.pool.get();
    expDrop.x = x + (Math.random() - 0.5) * 10;
    expDrop.y = y + (Math.random() - 0.5) * 10;
    expDrop.prevX = expDrop.x;
    expDrop.prevY = expDrop.y;
    expDrop.dropType = 'exp';
    expDrop.value = expValue;
    expDrop.color = '#ff0';
    expDrop.radius = 4;

    // 素材ドロップ判定 — dropRateBonus は基本ドロップ率への乗算倍率（+30%=1.3倍）
    const chance = GameConfig.run.dropChance * (1 + dropRateBonus) * this.dropRateMultiplier;
    if (Math.random() < chance) {
      const matDrop = this.pool.get();
      const mat = this._pickMaterial();
      matDrop.x = x + (Math.random() - 0.5) * 15;
      matDrop.y = y + (Math.random() - 0.5) * 15;
      matDrop.prevX = matDrop.x;
      matDrop.prevY = matDrop.y;
      matDrop.dropType = 'material';
      matDrop.blueprintId = mat.blueprintId;
      // 基本品質 + 時間経過ボーナス（1分毎 +4、20分で+80）
      const elapsed = this._elapsed || 0;
      const timeBonus = Math.floor((elapsed / 60) * 4);
      const baseQ = Math.floor(Math.random() * (this.qualityMax - this.qualityMin + 1)) + this.qualityMin;
      const cap = Progression.getQualityCap ? Progression.getQualityCap() : 999;
      matDrop.quality = Math.min(cap, baseQ + timeBonus);
      matDrop.traits = this._rollTraits();
      matDrop.color = matDrop.traits.length > 0 ? '#0ff' : '#0cf';
      matDrop.radius = 5;
    }
  }

  _pickMaterial() {
    let roll = Math.random() * this.totalWeight;
    for (const entry of this.dropTable) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return this.dropTable[0];
  }

  /** エリアのtraitPoolからランダムに特性を付与（25%の確率で1つ） */
  _rollTraits() {
    if (this.traitPool.length === 0) return [];
    const traits = [];
    if (Math.random() < GameConfig.run.traitChance) {
      const idx = Math.floor(Math.random() * this.traitPool.length);
      traits.push(this.traitPool[idx]);
    }
    return traits;
  }

  /** プレイヤーとの接触判定・マグネット吸引
   * 逆順ループ: release が swap-pop で activeList を改変するため。
   */
  update(dt, playerX, playerY, magnetRange) {
    const list = this.pool.activeList;
    for (let i = list.length - 1; i >= 0; i--) {
      const drop = list[i];
      drop.savePrev();

      const dx = playerX - drop.x;
      const dy = playerY - drop.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // マグネット吸引
      if (dist < magnetRange && dist > 1) {
        const pullSpeed = 300;
        drop.x += (dx / dist) * pullSpeed * dt;
        drop.y += (dy / dist) * pullSpeed * dt;
      }

      // 収集判定
      if (dist < 20) {
        if (drop.dropType === 'exp') {
          eventBus.emit('exp:collected', { value: drop.value, x: drop.x, y: drop.y });
        } else if (drop.dropType === 'material') {
          this.collectedMaterials.push({
            blueprintId: drop.blueprintId,
            quality: drop.quality,
            traits: [...drop.traits],
          });
          eventBus.emit('material:collected', { blueprintId: drop.blueprintId, x: drop.x, y: drop.y });
        }
        this.pool.release(drop);
      }
    }
  }

  get drops() { return this.pool.activeList; }

  destroy() {
    this.pool.releaseAll();
  }
}
