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
import { ParticleSystem } from './render/ParticleSystem.js';
import { SpriteCache } from './render/SpriteCache.js';
import { BackgroundRenderer } from './render/BackgroundRenderer.js';
import { EnemyDefs, AreaEnemyConfig } from '../data/enemies.js';

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

    // --- グラフィック強化システム ---
    const isMobile = ('ontouchstart' in globalThis || navigator.maxTouchPoints > 0);
    this.particles = new ParticleSystem(isMobile ? 250 : 500);
    this.spriteCache = new SpriteCache();
    this.background = new BackgroundRenderer(areaId, this.particles);
    this._playerTrailTimer = 0;
    this._preloadAssets();
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
      eventBus.on('enemy:damaged', ({ damage, x, y }) => {
        if (damage > this.highestDamage) this.highestDamage = damage;
        // 被弾粒子
        if (x != null && y != null) {
          this.particles.emitBurst(x, y, 4, {
            speed: 60, life: 0.25, size: 2, color: '#fff', shape: 'circle',
          });
        }
      }),
      eventBus.on('enemy:killed', ({ enemy }) => {
        // 撃破時の爆散粒子
        this.particles.emitBurst(enemy.x, enemy.y, enemy.isBoss ? 24 : 10, {
          speed: enemy.isBoss ? 180 : 120,
          life: enemy.isBoss ? 0.7 : 0.4,
          size: enemy.isBoss ? 4 : 3,
          color: enemy.color || '#f88',
          shape: 'square',
          gravity: 40,
        });
      }),
      eventBus.on('material:collected', ({ x, y }) => {
        if (x != null && y != null) this.particles.emitSpark(x, y, '#ff8');
      }),
      eventBus.on('exp:collected', () => {
        this.particles.emitSpark(this.player.x, this.player.y, '#fc4');
      }),
      eventBus.on('player:damaged', () => {
        this.particles.emitBurst(this.player.x, this.player.y, 10, {
          speed: 90, life: 0.4, size: 3, color: '#f44', shape: 'circle', gravity: 60,
        });
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
            enemy.applyDebuff(amount || 0, duration || 5);
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

  /** エリアで使用する敵/ボス/ドロップアセットを事前ロード（非同期・非ブロッキング） */
  _preloadAssets() {
    // ボス preset
    const presetPaths = new Set();
    if (this.area.boss?.preset) presetPaths.add(this.area.boss.preset);
    // 該当エリアの敵 preset（wave定義から引用）
    const waves = AreaEnemyConfig[this.areaId]?.waves || [];
    for (const w of waves) {
      for (const e of (w.enemies || [])) {
        const def = EnemyDefs[e.id];
        if (def?.preset) presetPaths.add(def.preset);
      }
    }
    this.spriteCache.preloadPresets([...presetPaths], { voxelSize: 3 });

    // ドロップテーブルのアイテム画像
    const imagePaths = new Set();
    for (const d of (this.area.dropTable || [])) {
      const bp = ItemBlueprints[d.blueprintId];
      if (bp?.image) imagePaths.add(bp.image);
    }
    this.spriteCache.preloadImages([...imagePaths]);
  }

  start() {
    this.gameLoop.start();
    // 背景のアンビエント粒子を初期配置
    this.background.seedAmbientParticles(this.camera);
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

    // パーティクル更新
    this.particles.update(dt, this.camera);
    this.background.update(dt, this.camera);

    // プレイヤー残像（低頻度）
    this._playerTrailTimer += dt;
    if (this._playerTrailTimer > 0.08) {
      this._playerTrailTimer = 0;
      this.particles.emitTrail(this.player.x, this.player.y, '#4af');
    }

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
      {
        background: this.background,
        particles: this.particles,
        spriteCache: this.spriteCache,
        itemBlueprints: ItemBlueprints,
        elapsed: this.elapsed,
      },
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
    this.particles.clear();
    this.canvas.destroy();
  }
}
