/**
 * RunManager — ラン全体のライフサイクル管理
 * Phase 2: マルチ武器対応
 */

import { GameLoop } from '../core/GameLoop.js';
import { PlayerController } from './PlayerController.js';
import { EnemySpawner } from './EnemySpawner.js';
import { WeaponSystem } from './WeaponSystem.js';
import { CollisionSystem } from './CollisionSystem.js';
import { DropSystem } from './DropSystem.js';
import { LevelUpSystem } from './LevelUpSystem.js';
import { Camera } from './Camera.js';
import { RunCanvas } from './RunCanvas.js';
import { GameConfig } from '../data/config.js';
import { AreaDefs } from '../data/areas.js';
import { eventBus } from '../core/EventBus.js';

export class RunManager {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {object[]} weaponSlots - 最大4武器
   * @param {string} areaId
   */
  constructor(canvasEl, weaponSlots, areaId) {
    this.areaId = areaId;
    this.area = AreaDefs[areaId];
    this.state = 'running';
    this.elapsed = 0;
    this.killCount = 0;

    // サブシステム初期化
    this.canvas = new RunCanvas(canvasEl);
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.player = new PlayerController();
    this.spawner = new EnemySpawner(areaId);
    this.weapon = new WeaponSystem(this.player, weaponSlots);
    this.collision = new CollisionSystem(64);
    this.drops = new DropSystem(this.area.dropTable);
    this.levelUp = new LevelUpSystem(this.player, this.weapon);

    // ゲームループ
    this.gameLoop = new GameLoop(
      (dt) => this._update(dt),
      (alpha) => this._render(alpha),
    );

    // イベント購読
    this._unsubs = [
      eventBus.on('enemy:killed', ({ enemy }) => this._onEnemyKilled(enemy)),
      eventBus.on('levelup:show', () => this._onLevelUpShow()),
      eventBus.on('levelup:selected', () => this._onLevelUpSelected()),
      eventBus.on('player:died', () => this._onPlayerDied()),
    ];

    // カメラ初期位置
    this.camera.x = this.player.x - this.camera.width / 2;
    this.camera.y = this.player.y - this.camera.height / 2;
  }

  start() {
    this.gameLoop.start();
  }

  _update(dt) {
    if (this.state !== 'running') return;

    this.elapsed += dt;

    if (this.elapsed >= GameConfig.run.duration) {
      this._endRun('timeout');
      return;
    }

    this.player.update(dt);
    this.spawner.update(dt, this.player.x, this.player.y, this.camera.width, this.camera.height);
    this.weapon.update(dt, this.spawner.enemies, this.collision);

    // 衝突判定（敵→プレイヤー）
    this.collision.clear();
    for (const enemy of this.spawner.enemies) {
      if (enemy.active) this.collision.insert(enemy);
    }
    const nearby = this.collision.query(this.player.x, this.player.y, this.player.radius + 20);
    for (const enemy of nearby) {
      if (CollisionSystem.circleOverlap(this.player, enemy)) {
        this.player.takeDamage(enemy.damage);
      }
    }

    this.drops.update(dt, this.player.x, this.player.y, this.player.magnetRange);
    this.camera.follow(this.player.x, this.player.y, dt);

    eventBus.emit('run:tick', {
      elapsed: this.elapsed,
      remaining: GameConfig.run.duration - this.elapsed,
      killCount: this.killCount,
      hp: this.player.hp,
      maxHp: this.player.effectiveMaxHp,
    });
  }

  _render(alpha) {
    this.canvas.render(
      alpha,
      this.camera,
      this.player,
      this.spawner.enemies,
      this.drops.drops,
      this.weapon,
    );
  }

  _onEnemyKilled(enemy) {
    this.killCount++;
    this.drops.spawnDrops(
      enemy.x, enemy.y,
      enemy.expValue,
      this.player.passives.dropRateBonus,
    );
    this.spawner.releaseEnemy(enemy);
  }

  _onLevelUpShow() {
    this.state = 'paused';
    this.gameLoop.pause();
  }

  _onLevelUpSelected() {
    this.state = 'running';
    this.gameLoop.resume();
  }

  _onPlayerDied() {
    this._endRun('death');
  }

  _endRun(reason) {
    this.state = 'ended';
    this.gameLoop.stop();

    eventBus.emit('run:complete', {
      reason,
      elapsed: this.elapsed,
      killCount: this.killCount,
      level: this.player.level,
      materials: this.drops.collectedMaterials,
      areaId: this.areaId,
    });
  }

  destroy() {
    this.gameLoop.stop();
    for (const unsub of this._unsubs) unsub();
    this.player.destroy();
    this.spawner.destroy();
    this.drops.destroy();
    this.levelUp.destroy();
    this.canvas.destroy();
  }
}
