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
import { BossSystem } from './BossSystem.js';
import { ConsumableSystem } from './ConsumableSystem.js';
import { DamageNumberSystem } from './DamageNumberSystem.js';

export class RunManager {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {object[]} weaponSlots - 最大4武器
   * @param {string} areaId
   * @param {object|null} equippedArmor - 装備中の防具
   * @param {object|null} equippedAccessory - 装備中のアクセサリ
   */
  constructor(canvasEl, weaponSlots, areaId, equippedArmor = null, equippedAccessory = null, consumables = []) {
    this.areaId = areaId;
    this.area = AreaDefs[areaId];
    this.state = 'running';
    this.elapsed = 0;
    this.killCount = 0;
    this.goldEarned = 0;

    // サブシステム初期化
    this.canvas = new RunCanvas(canvasEl);
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.player = new PlayerController(equippedArmor, equippedAccessory);
    this.spawner = new EnemySpawner(areaId);
    this.weapon = new WeaponSystem(this.player, weaponSlots);
    this.player.applyWeaponTraits(weaponSlots);
    this.collision = new CollisionSystem(64);
    this.drops = new DropSystem(this.area.dropTable, this.area.traitPool || [], this.area.qualityMin || 10, this.area.qualityMax || 40);
    this.levelUp = new LevelUpSystem(this.player, this.weapon);
    this.bossSystem = new BossSystem(areaId);
    this.consumables = consumables.length > 0 ? new ConsumableSystem(this.player, consumables) : null;
    this.damageNumbers = new DamageNumberSystem();
    this.materialCount = 0;

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
      eventBus.on('boss:defeated', () => this._onBossDefeated()),
      eventBus.on('consumable:aoe', ({ x, y, radius, damage }) => {
        for (const enemy of this.spawner.enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(damage)) eventBus.emit('enemy:killed', { enemy });
          }
        }
      }),
      eventBus.on('player:damaged', ({ damage }) => {
        eventBus.emit('damageNumber:playerHit', { x: this.player.x, y: this.player.y, damage });
      }),
      eventBus.on('material:collected', () => {
        this.materialCount++;
      }),
      eventBus.on('consumable:used', ({ type, value }) => {
        if (type === 'heal') {
          eventBus.emit('damageNumber:heal', { x: this.player.x, y: this.player.y, value: value });
        }
      }),
      eventBus.on('consumable:debuff', ({ x, y, radius, stat, amount, duration }) => {
        for (const enemy of this.spawner.enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < radius * radius) {
            // 一時的に速度を減少
            const origSpeed = enemy.speed;
            enemy.speed = Math.max(1, enemy.speed + (amount || 0));
            setTimeout(() => { if (enemy.active) enemy.speed = origSpeed; }, (duration || 5) * 1000);
          }
        }
      }),
      eventBus.on('shield:retaliate', ({ x, y, range, knockback, damage }) => {
        const allEnemies = [...this.spawner.enemies, ...this.bossSystem.getActiveBosses()];
        for (const enemy of allEnemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < range + enemy.radius) {
            if (enemy.takeDamage(damage)) {
              eventBus.emit('enemy:killed', { enemy });
            } else if (dist > 0.1) {
              enemy.x += (dx / dist) * knockback;
              enemy.y += (dy / dist) * knockback;
            }
          }
        }
      }),
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

    // ボスシステム更新
    this.bossSystem.update(dt, this.elapsed, this.player.x, this.player.y, this.camera.width, this.camera.height);

    // ボス衝突判定
    for (const boss of this.bossSystem.getActiveBosses()) {
      if (!boss.active) continue;
      // ボスとプレイヤーの接触ダメージ
      if (CollisionSystem.circleOverlap(this.player, boss)) {
        this.player.takeDamage(boss.damage);
      }
      // ボススキルのダメージ判定
      const hitArea = boss.getSkillHitArea();
      if (hitArea) {
        const dx = this.player.x - hitArea.x;
        const dy = this.player.y - hitArea.y;
        if (dx * dx + dy * dy < hitArea.radius * hitArea.radius) {
          this.player.takeDamage(boss.getSkillDamage());
        }
      }
    }

    // 全敵リスト（通常敵 + ボス）を構築
    const allEnemies = [...this.spawner.enemies, ...this.bossSystem.getActiveBosses()];

    this.weapon.update(dt, allEnemies, this.collision);

    // 衝突判定（敵→プレイヤー）
    this.collision.clear();
    for (const enemy of allEnemies) {
      if (enemy.active) this.collision.insert(enemy);
    }
    const nearby = this.collision.query(this.player.x, this.player.y, this.player.radius + 20);
    for (const enemy of nearby) {
      if (CollisionSystem.circleOverlap(this.player, enemy)) {
        this.player.takeDamage(enemy.damage);
      }
    }

    this.drops.update(dt, this.player.x, this.player.y, this.player.magnetRange);

    // 消耗品更新
    if (this.consumables) this.consumables.update(dt);

    // ダメージ数字更新
    this.damageNumbers.update(dt);

    this.camera.follow(this.player.x, this.player.y, dt);

    // 生存ボーナス
    const bonusCount = Math.floor(this.elapsed / GameConfig.gold.survivalInterval);
    const expectedGoldFromSurvival = bonusCount * GameConfig.gold.survivalBonus;
    if (!this._lastSurvivalBonusCount) this._lastSurvivalBonusCount = 0;
    if (bonusCount > this._lastSurvivalBonusCount) {
      this.goldEarned += GameConfig.gold.survivalBonus;
      this._lastSurvivalBonusCount = bonusCount;
    }

    eventBus.emit('run:tick', {
      elapsed: this.elapsed,
      remaining: GameConfig.run.duration - this.elapsed,
      killCount: this.killCount,
      hp: this.player.hp,
      maxHp: this.player.effectiveMaxHp,
      goldEarned: this.goldEarned,
      materialCount: this.materialCount,
      weaponSlots: this.weapon.getSlotInfo(),
      player: this.player,
      bossSpawnTimes: GameConfig.run.bossSpawnTimes,
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
      this.bossSystem,
      this.damageNumbers,
    );
  }

  _onEnemyKilled(enemy) {
    this.killCount++;
    this.goldEarned += GameConfig.gold.perKill;
    if (enemy.isBoss) {
      this.goldEarned += GameConfig.gold.bossBonus;
    }
    // ボス撃破チェック
    if (enemy.isBoss && this.bossSystem) {
      this.bossSystem.onBossKilled();
    }
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

  _onBossDefeated() {
    // ボス撃破後、通常スポーン再開
  }

  _endRun(reason) {
    this.state = 'ended';
    this.gameLoop.stop();

    eventBus.emit('run:complete', {
      reason,
      elapsed: this.elapsed,
      killCount: this.killCount,
      level: this.player.level,
      goldEarned: this.goldEarned,
      materials: this.drops.collectedMaterials,
      areaId: this.areaId,
      bossDefeated: this.bossSystem?.bossDefeated || false,
    });
  }

  destroy() {
    this.gameLoop.stop();
    for (const unsub of this._unsubs) unsub();
    this.player.destroy();
    this.spawner.destroy();
    this.drops.destroy();
    this.levelUp.destroy();
    this.bossSystem.destroy();
    if (this.consumables) this.consumables.destroy();
    this.damageNumbers.destroy();
    this.canvas.destroy();
  }
}
