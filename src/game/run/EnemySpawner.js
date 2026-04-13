/**
 * EnemySpawner — ウェーブベースの敵生成
 */

import { Enemy } from './EnemyAI.js';
import { ObjectPool } from './ObjectPool.js';
import { EnemyDefs, AreaEnemyConfig } from '../data/enemies.js';
import { GameConfig } from '../data/config.js';

export class EnemySpawner {
  constructor(areaId, modifiers = null) {
    this.areaConfig = AreaEnemyConfig[areaId];
    this.pool = new ObjectPool(() => new Enemy(), 100);
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.modifiers = modifiers; // ハードモード修飾子
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
    let rate = GameConfig.run.spawnRateStart + (GameConfig.run.spawnRateEnd - GameConfig.run.spawnRateStart) * t;
    if (this.modifiers) rate *= this.modifiers.spawnRateMultiplier;

    this.spawnTimer += dt;
    const interval = 1 / rate;
    const maxEnemies = this.modifiers ? this.modifiers.maxEnemies : GameConfig.run.maxEnemies;

    let spawnedThisFrame = 0;
    while (this.spawnTimer >= interval && this.pool.activeCount < maxEnemies && spawnedThisFrame < 5) {
      this.spawnTimer -= interval;
      this._spawn(playerX, playerY, cameraWidth, cameraHeight);
      spawnedThisFrame++;
    }
    // 超過分はキャップ（大量スポーン蓄積を防止、急激なリセットを回避）
    if (this.spawnTimer > interval * 3) this.spawnTimer = interval * 3;

    // 全敵を更新 + 遠方敵をリサイクル
    const despawnDist = Math.max(cameraWidth, cameraHeight) * 1.5;
    const despawnDistSq = despawnDist * despawnDist;
    for (const enemy of this.pool.activeList) {
      enemy.update(dt, playerX, playerY);
      const edx = enemy.x - playerX;
      const edy = enemy.y - playerY;
      if (edx * edx + edy * edy > despawnDistSq) {
        this.pool.release(enemy);
      }
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

    // ハードモード修飾子の適用
    if (this.modifiers) {
      enemy.maxHp = Math.floor(enemy.maxHp * this.modifiers.enemyHpMultiplier);
      enemy.hp = enemy.maxHp;
      enemy.damage = Math.floor(enemy.damage * this.modifiers.enemyDamageMultiplier);
      enemy.speed = Math.floor(enemy.speed * this.modifiers.enemySpeedMultiplier);
    }
  }

  get enemies() { return this.pool.activeList; }

  releaseEnemy(enemy) {
    this.pool.release(enemy);
  }

  destroy() {
    this.pool.releaseAll();
  }
}
