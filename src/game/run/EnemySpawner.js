/**
 * EnemySpawner — ウェーブベースの敵生成
 */

import { Enemy } from './EnemyAI.js';
import { ObjectPool } from './ObjectPool.js';
import { EnemyDefs, AreaEnemyConfig } from '../data/enemies.js';
import { AreaDefs } from '../data/areas.js';
import { GameConfig } from '../data/config.js';

/** エリア difficulty → HP/damage 倍率（ステージ2以降で難化） */
const AREA_DIFF_TABLE = {
  0: { hp: 1.0,  dmg: 1.00 },
  1: { hp: 1.25, dmg: 1.10 },
  2: { hp: 1.55, dmg: 1.25 },
  3: { hp: 1.90, dmg: 1.40 },
  4: { hp: 2.30, dmg: 1.55 },
};

export class EnemySpawner {
  constructor(areaId, modifiers = null) {
    this.areaId = areaId;
    this.areaConfig = AreaEnemyConfig[areaId];
    const area = AreaDefs[areaId];
    this.areaDifficulty = area ? (area.difficulty || 0) : 0;
    this.areaMult = AREA_DIFF_TABLE[this.areaDifficulty] || AREA_DIFF_TABLE[0];
    this.pool = new ObjectPool(() => new Enemy(), 100);
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.modifiers = modifiers; // ハードモード修飾子
    // update 中の反復用スナップショットバッファ（GC削減のため再利用）
    // enemy.update 中の DoT/属性コンボで他の敵が連鎖 release されても安全に走査するために使う
    this._iterBuffer = [];
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

    // 遠方敵は AI/物理を走らせずリサイクル（update 前に判定することで画面外敵のCPUを節約）
    const despawnDist = Math.max(cameraWidth, cameraHeight) * 1.5;
    const despawnDistSq = despawnDist * despawnDist;
    // 反復中に pool が変異（DoT連鎖死亡による swap-pop 等）してもインデックスが崩れないよう、
    // 開始時点のアクティブ一覧をスナップショットして走査する。
    const activeList = this.pool.activeList;
    const snapshot = this._iterBuffer;
    snapshot.length = 0;
    for (let k = 0; k < activeList.length; k++) snapshot.push(activeList[k]);

    for (let i = 0; i < snapshot.length; i++) {
      const enemy = snapshot[i];
      // 別の敵の update で連鎖 release された場合はスキップ（プール返却済み）
      if (!enemy.active) continue;
      const edx = enemy.x - playerX;
      const edy = enemy.y - playerY;
      if (edx * edx + edy * edy > despawnDistSq) {
        this.pool.release(enemy);
        continue;
      }
      enemy.update(dt, playerX, playerY);
    }
    snapshot.length = 0; // 参照を解放（GC ヒント）
  }

  _spawn(playerX, playerY, camW, camH) {
    const wave = this._getCurrentWave();
    const def = this._pickEnemyType(wave);
    if (!def) return; // 無効な敵ID（データ不整合）でプールから取得する前に中止
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

    // エリア難易度倍率（ステージ2以降で漸増）
    const areaHp = this.areaMult.hp;
    const areaDmg = this.areaMult.dmg;
    // 時間進行による体力上昇（1分毎 +60%、5分で +300% = 4倍）
    const timeHp = 1 + (this.elapsed / 60) * 0.60;

    enemy.maxHp = Math.max(1, Math.floor(enemy.maxHp * areaHp * timeHp));
    enemy.hp = enemy.maxHp;
    enemy.damage = Math.max(1, Math.floor(enemy.damage * areaDmg));

    // ハードモード修飾子の適用（上記に乗算）
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
