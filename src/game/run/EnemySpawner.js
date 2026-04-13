/**
 * EnemySpawner — ウェーブベースの敵生成
 */

import { Enemy } from './EnemyAI.js';
import { ObjectPool } from './ObjectPool.js';
import { EnemyDefs, AreaEnemyConfig } from '../data/enemies.js';
import { GameConfig } from '../data/config.js';

export class EnemySpawner {
  constructor(areaId) {
    this.areaConfig = AreaEnemyConfig[areaId];
    this.pool = new ObjectPool(() => new Enemy(), 100);
    this.spawnTimer = 0;
    this.elapsed = 0;
  }

  /** 現在のウェーブ設定を取得 */
  _getCurrentWave() {
    const waves = this.areaConfig.waves;
    let current = waves[0];
    for (const wave of waves) {
      if (this.elapsed >= wave.startTime) current = wave;
    }
    return current;
  }

  /** 重み付きランダムで敵タイプを選択 */
  _pickEnemyType(wave) {
    const totalWeight = wave.enemies.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of wave.enemies) {
      roll -= entry.weight;
      if (roll <= 0) return EnemyDefs[entry.id];
    }
    return EnemyDefs[wave.enemies[0].id];
  }

  update(dt, playerX, playerY, cameraWidth, cameraHeight) {
    this.elapsed += dt;

    // スポーンレート（時間とともに増加）
    const t = Math.min(this.elapsed / GameConfig.run.duration, 1);
    const rate = GameConfig.run.spawnRateStart + (GameConfig.run.spawnRateEnd - GameConfig.run.spawnRateStart) * t;

    this.spawnTimer += dt;
    const interval = 1 / rate;

    while (this.spawnTimer >= interval && this.pool.activeCount < GameConfig.run.maxEnemies) {
      this.spawnTimer -= interval;
      this._spawn(playerX, playerY, cameraWidth, cameraHeight);
    }

    // 全敵を更新
    for (const enemy of this.pool.activeList) {
      enemy.update(dt, playerX, playerY);
    }
  }

  _spawn(playerX, playerY, camW, camH) {
    const wave = this._getCurrentWave();
    const def = this._pickEnemyType(wave);
    const enemy = this.pool.get();

    // カメラ外にスポーン（画面端から少し離れた位置）
    const margin = 80;
    const side = Math.floor(Math.random() * 4);
    let sx, sy;

    switch (side) {
      case 0: // 上
        sx = playerX + (Math.random() - 0.5) * (camW + margin * 2);
        sy = playerY - camH / 2 - margin;
        break;
      case 1: // 下
        sx = playerX + (Math.random() - 0.5) * (camW + margin * 2);
        sy = playerY + camH / 2 + margin;
        break;
      case 2: // 左
        sx = playerX - camW / 2 - margin;
        sy = playerY + (Math.random() - 0.5) * (camH + margin * 2);
        break;
      case 3: // 右
        sx = playerX + camW / 2 + margin;
        sy = playerY + (Math.random() - 0.5) * (camH + margin * 2);
        break;
    }

    enemy.init(def, sx, sy);
  }

  get enemies() { return this.pool.activeList; }

  releaseEnemy(enemy) {
    this.pool.release(enemy);
  }

  destroy() {
    this.pool.releaseAll();
  }
}
