/**
 * DropSystem — 経験値ジェム・素材ドロップ管理
 */

import { Entity } from './Entity.js';
import { ObjectPool } from './ObjectPool.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';

class Drop extends Entity {
  constructor() {
    super();
    this.type = 'drop';
    this.dropType = 'exp'; // 'exp' | 'material'
    this.value = 0;
    this.blueprintId = null;
    this.quality = 0;
    this.radius = 4;
    this.color = '#ff0';
  }

  reset() {
    super.reset();
    this.dropType = 'exp';
    this.value = 0;
    this.blueprintId = null;
    this.quality = 0;
    this.color = '#ff0';
  }
}

export class DropSystem {
  constructor(areaDropTable) {
    this.pool = new ObjectPool(() => new Drop(), 300);
    this.dropTable = areaDropTable;
    this.totalWeight = areaDropTable.reduce((sum, d) => sum + d.weight, 0);
    this.collectedMaterials = []; // ラン中に集めた素材リスト
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

    // 素材ドロップ判定
    const chance = GameConfig.run.dropChance + dropRateBonus;
    if (Math.random() < chance) {
      const matDrop = this.pool.get();
      const mat = this._pickMaterial();
      matDrop.x = x + (Math.random() - 0.5) * 15;
      matDrop.y = y + (Math.random() - 0.5) * 15;
      matDrop.prevX = matDrop.x;
      matDrop.prevY = matDrop.y;
      matDrop.dropType = 'material';
      matDrop.blueprintId = mat.blueprintId;
      matDrop.quality = Math.floor(Math.random() * 30) + 10;
      matDrop.color = '#0cf';
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

  /** プレイヤーとの接触判定・マグネット吸引 */
  update(dt, playerX, playerY, magnetRange) {
    for (const drop of this.pool.activeList) {
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
          eventBus.emit('exp:collected', { value: drop.value });
        } else if (drop.dropType === 'material') {
          this.collectedMaterials.push({
            blueprintId: drop.blueprintId,
            quality: drop.quality,
          });
          eventBus.emit('material:collected', { blueprintId: drop.blueprintId });
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
