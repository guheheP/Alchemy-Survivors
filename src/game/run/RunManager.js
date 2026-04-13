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
import { ItemBlueprints } from '../data/items.js';
import { HardModeModifiers } from '../data/hardmode.js';
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
  constructor(canvasEl, weaponSlots, areaId, equippedArmor = null, equippedAccessory = null, consumables = [], hardMode = false) {
    this.areaId = areaId;
    this.area = AreaDefs[areaId];
    this.hardMode = hardMode;
    this.state = 'running';
    this.elapsed = 0;
    this.killCount = 0;
    this.goldEarned = 0;

    const modifiers = hardMode ? HardModeModifiers : null;

    // サブシステム初期化
    this.canvas = new RunCanvas(canvasEl);
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.player = new PlayerController(equippedArmor, equippedAccessory);
    this.spawner = new EnemySpawner(areaId, modifiers);
    this.weapon = new WeaponSystem(this.player, weaponSlots);
    this.player.applyWeaponTraits(weaponSlots);
    this.collision = new CollisionSystem(64);
    const qMin = (this.area.qualityMin || 10) + (modifiers ? modifiers.qualityBonusMin : 0);
    const qMax = (this.area.qualityMax || 40) + (modifiers ? modifiers.qualityBonusMax : 0);
    this.drops = new DropSystem(this.area.dropTable, this.area.traitPool || [], qMin, qMax, modifiers ? modifiers.dropRateMultiplier : 1);
    this.levelUp = new LevelUpSystem(this.player, this.weapon);
    this.bossSystem = new BossSystem(areaId, modifiers);
    this.consumables = consumables.length > 0 ? new ConsumableSystem(this.player, consumables) : null;
    this.damageNumbers = new DamageNumberSystem();
    this.materialCount = 0;
    this.highestDamage = 0;
    // 毎フレーム再利用するオブジェクト（GC削減）
    this._tickData = {
      elapsed: 0, remaining: 0, killCount: 0, hp: 0, maxHp: 0,
      goldEarned: 0, materialCount: 0, weaponSlots: null, player: null,
      bossSpawnTimes: GameConfig.run.bossSpawnTimes,
    };
    this._allEnemies = [];
    this.weaponTypesUsed = [...new Set(
      weaponSlots.filter(Boolean).map(w => {
        const bp = ItemBlueprints[w.blueprintId];
        return bp?.equipType || 'sword';
      })
    )];

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
      eventBus.on('enemy:damaged', ({ damage }) => {
        if (damage > this.highestDamage) this.highestDamage = damage;
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

    // 全敵リスト（通常敵 + ボス）を構築 — 配列再利用でGC削減
    this._allEnemies.length = 0;
    for (const e of this.spawner.enemies) this._allEnemies.push(e);
    for (const b of this.bossSystem.getActiveBosses()) this._allEnemies.push(b);
    const allEnemies = this._allEnemies;

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

    // tick データ再利用（GC削減）
    const td = this._tickData;
    td.elapsed = this.elapsed;
    td.remaining = GameConfig.run.duration - this.elapsed;
    td.killCount = this.killCount;
    td.hp = this.player.hp;
    td.maxHp = this.player.effectiveMaxHp;
    td.goldEarned = this.goldEarned;
    td.materialCount = this.materialCount;
    td.weaponSlots = this.weapon.getSlotInfo();
    td.player = this.player;
    eventBus.emit('run:tick', td);
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
    const goldMult = this.hardMode ? HardModeModifiers.goldMultiplier : 1;
    this.goldEarned += Math.floor(GameConfig.gold.perKill * goldMult);
    if (enemy.isBoss) {
      this.goldEarned += Math.floor(GameConfig.gold.bossBonus * goldMult);
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
      highestDamage: this.highestDamage,
      weaponTypesUsed: this.weaponTypesUsed,
      hardMode: this.hardMode || false,
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
