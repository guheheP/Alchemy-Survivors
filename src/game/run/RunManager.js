/**
 * RunManager — ラン全体のライフサイクル管理
 * Phase 2: マルチ武器対応
 */

import { GameLoop } from '../core/GameLoop.js';
import { isMobileDevice } from '../core/isMobileDevice.js';
import { requestWakeLock, releaseWakeLock } from '../core/pwaRuntime.js';
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
import { GameFeelSettings } from '../core/GameFeelSettings.js';
import { ItemBlueprints } from '../data/items.js';
import { DifficultyModifiers } from '../data/hardmode.js';
import { BossSystem } from './BossSystem.js';
import { ComboSystem } from './ComboSystem.js';
import { ConsumableSystem } from './ConsumableSystem.js';
import { DamageNumberSystem } from './DamageNumberSystem.js';
import { ParticleSystem } from './render/ParticleSystem.js';
import { SpriteCache } from './render/SpriteCache.js';
import { BackgroundRenderer } from './render/BackgroundRenderer.js';
import { EnemyDefs, AreaEnemyConfig } from '../data/enemies.js';

// プレイヤー用キャラクタースプライトシート（4列×3行 = 向き×歩行フレーム, 16×17px/セル）
const PLAYER_SPRITE_PATH = '/art/Character/F_12.png';
const PLAYER_SPRITE_FRAME_W = 16;
const PLAYER_SPRITE_FRAME_H = 17;

export class RunManager {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {object[]} weaponSlots - 最大4武器
   * @param {string} areaId
   * @param {object|null} equippedArmor - 装備中の防具
   * @param {object|null} equippedAccessory - 装備中のアクセサリ
   */
  constructor(canvasEl, weaponSlots, areaId, equippedArmor = null, equippedAccessory = null, consumables = [], difficulty = 'normal') {
    this.areaId = areaId;
    this.area = AreaDefs[areaId];
    this.difficulty = difficulty;
    // 旧API互換: hardMode boolean を参照する箇所のために hard 以上を真として残す
    this.hardMode = difficulty !== 'normal';
    this.state = 'running';
    this.elapsed = 0;
    this.killCount = 0;
    this.goldEarned = 0;

    const modifiers = DifficultyModifiers[difficulty] || null;

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
    // 難易度別の特性プール選択（未定義なら通常 traitPool にフォールバック）
    const traitPool = (difficulty === 'nightmare' && this.area.nightmareTraitPool)
      ? this.area.nightmareTraitPool
      : (difficulty === 'challenge' && this.area.challengeTraitPool)
        ? this.area.challengeTraitPool
        : (this.area.traitPool || []);
    this.drops = new DropSystem(this.area.dropTable, traitPool, qMin, qMax, modifiers ? modifiers.dropRateMultiplier : 1);
    this.levelUp = new LevelUpSystem(this.player, this.weapon);
    this.bossSystem = new BossSystem(areaId, modifiers, difficulty);
    this.comboSystem = new ComboSystem({
      getAllEnemies: () => this._allEnemies,
      getPlayer: () => this.player,
    });
    this.consumables = consumables.length > 0 ? new ConsumableSystem(this.player, consumables) : null;
    this.damageNumbers = new DamageNumberSystem();
    this.materialCount = 0;
    this.highestDamage = 0;

    // --- グラフィック強化システム ---
    const isMobile = isMobileDevice();
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

    // ヒットストップ: 指定秒数だけ update を凍結して「手応え」を強化
    this._hitStopRemaining = 0;
    // 衝撃波エフェクト（ボス撃破・大技用）。 { x, y, color, maxRadius, t, duration }
    this._shockwaves = [];

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
        const r2 = radius * radius;
        const hit = (enemy) => {
          if (!enemy.active) return;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < r2) {
            if (enemy.takeDamage(damage)) eventBus.emit('enemy:killed', { enemy, x: enemy.x, y: enemy.y, isBoss: enemy.isBoss, color: enemy.color });
          }
        };
        // takeDamage の連鎖で pool が変異するため、スナップショットを取ってから走査する
        const enemies = this.spawner.enemies.slice();
        for (const enemy of enemies) hit(enemy);
        const bosses = this.bossSystem.getActiveBosses();
        for (const boss of bosses) hit(boss);
      }),
      eventBus.on('player:damaged', ({ damage, sourceX, sourceY }) => {
        eventBus.emit('damageNumber:playerHit', { x: this.player.x, y: this.player.y, damage });
        // 被弾方向に軽いシェイク（ダメージ量でスケール）
        const power = Math.min(6, 1.5 + damage / 40);
        if (typeof sourceX === 'number' && typeof sourceY === 'number') {
          this.camera.shakeDir(this.player.x - sourceX, this.player.y - sourceY, power, 0.18, 0.5);
        } else {
          this.camera.shake(power, 0.18);
        }
      }),
      eventBus.on('material:collected', () => {
        this.materialCount++;
      }),
      eventBus.on('enemy:damaged', ({ damage, x, y, isCrit }) => {
        if (damage > this.highestDamage) this.highestDamage = damage;
        // 被弾粒子
        if (x != null && y != null) {
          if (isCrit) {
            // 会心: より強いスパーク + 軽いシェイク + 微ヒットストップ
            this.particles.emitBurst(x, y, 10, {
              speed: 160, life: 0.32, size: 3, color: '#ffdc6a', shape: 'spark',
            });
            this.camera.shake(2, 0.1);
            this.hitStop(0.02);
          } else {
            this.particles.emitBurst(x, y, 4, {
              speed: 60, life: 0.25, size: 2, color: '#fff', shape: 'circle',
            });
          }
        }
      }),
      // armored: ダメージ無効時の装甲パリィ演出
      eventBus.on('enemy:blocked', ({ x, y }) => {
        if (x != null && y != null) {
          this.particles.emitBurst(x, y, 8, {
            speed: 100, life: 0.3, size: 2, color: '#8cf', shape: 'spark',
          });
        }
      }),
      eventBus.on('enemy:killed', ({ enemy, x, y, isBoss, color }) => {
        // イベントに含まれる座標を優先（enemyは直後にプール返却でリセットされる）
        const ex = x != null ? x : enemy.x;
        const ey = y != null ? y : enemy.y;
        const boss = isBoss != null ? isBoss : enemy.isBoss;
        const col = color || enemy.color || '#f88';
        this.particles.emitBurst(ex, ey, boss ? 24 : 10, {
          speed: boss ? 180 : 120,
          life: boss ? 0.7 : 0.4,
          size: boss ? 4 : 3,
          color: col,
          shape: 'square',
          gravity: 40,
        });
        // ボス撃破: 衝撃波リング + 全画面フラッシュ + 強シェイク + 長めのヒットストップ
        if (boss) {
          // 衝撃波（白い二重リング）
          eventBus.emit('fx:shockwave', { x: ex, y: ey, color: '#fff', maxRadius: 180, duration: 0.6 });
          eventBus.emit('fx:shockwave', { x: ex, y: ey, color: col, maxRadius: 120, duration: 0.45 });
          // 全画面フラッシュ
          eventBus.emit('ui:flash', { duration: 0.15, color: 'rgba(255,255,255,0.5)' });
          this.camera.shake(12, 0.5);
          this.hitStop(0.2);
        }
      }),
      // スキルからのパーティクル発生
      eventBus.on('particles:burst', ({ x, y, count, config }) => {
        this.particles.emitBurst(x, y, count, config || {});
      }),
      // スキルからのカメラシェイク
      eventBus.on('camera:shake', ({ power, duration }) => {
        this.camera.shake(power || 5, duration || 0.2);
      }),
      // 衝撃波 (ボス撃破などの大技演出)
      eventBus.on('fx:shockwave', ({ x, y, color, maxRadius, duration }) => {
        this._shockwaves.push({
          x, y,
          color: color || '#fff',
          maxRadius: maxRadius || 150,
          t: 0,
          duration: duration || 0.5,
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
        const r2 = radius * radius;
        const apply = (enemy) => {
          if (!enemy.active) return;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < r2) enemy.applyDebuff(amount || 0, duration || 5);
        };
        // applyDebuff だけでは pool は変異しないが、今後の拡張 (状態異常付与→combo→死亡) に備えて snapshot
        const enemies = this.spawner.enemies.slice();
        for (const enemy of enemies) apply(enemy);
        const bosses = this.bossSystem.getActiveBosses();
        for (const boss of bosses) apply(boss);
      }),
      eventBus.on('consumable:status', ({ x, y, radius, type, params }) => {
        const r2 = radius * radius;
        const apply = (enemy) => {
          if (!enemy.active) return;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < r2) enemy.applyStatusEffect(type, params || {});
        };
        // applyStatusEffect → combo 判定で敵が死亡する可能性があるので snapshot
        const enemies = this.spawner.enemies.slice();
        for (const enemy of enemies) apply(enemy);
        const bosses = this.bossSystem.getActiveBosses();
        for (const boss of bosses) apply(boss);
      }),
      // 毒の感染拡散
      eventBus.on('statusEffect:spread', ({ x, y, radius, source, type, params }) => {
        const r2 = radius * radius;
        const applySpread = (enemy) => {
          if (!enemy.active || enemy === source) return;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < r2) enemy.applyStatusEffect(type, params);
        };
        // applyStatusEffect → _checkCombo → combo:triggered → ComboSystem が takeDamage を走らせて
        // 敵が死ぬと spawner の pool が swap-pop で変異するため、開始時スナップショットで走査する
        const enemies = this.spawner.enemies.slice();
        for (const enemy of enemies) applySpread(enemy);
        const bosses = this.bossSystem.getActiveBosses();
        for (const boss of bosses) applySpread(boss);
      }),
      // 風属性の状態異常拡散
      eventBus.on('statusEffect:windSpread', ({ x, y, radius, source, effects }) => {
        const r2 = radius * radius;
        const applyWind = (enemy) => {
          if (!enemy.active || enemy === source) return;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy < r2) {
            for (const { type, params } of effects) {
              enemy.applyStatusEffect(type, params);
            }
          }
        };
        const enemies = this.spawner.enemies.slice();
        for (const enemy of enemies) applyWind(enemy);
        const bosses = this.bossSystem.getActiveBosses();
        for (const boss of bosses) applyWind(boss);
      }),
      eventBus.on('shield:retaliate', ({ x, y, range, knockback, damage }) => {
        // takeDamage で敵が死ぬと pool が変異するので、スナップショットで走査する
        const allEnemies = [...this.spawner.enemies, ...this.bossSystem.getActiveBosses()];
        for (const enemy of allEnemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - x;
          const dy = enemy.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < range + enemy.radius) {
            if (enemy.takeDamage(damage)) {
              eventBus.emit('enemy:killed', { enemy, x: enemy.x, y: enemy.y, isBoss: enemy.isBoss, color: enemy.color });
            } else if (dist > 0.1) {
              enemy.tryKnockback?.(dx, dy, dist, knockback);
            }
          }
        }
      }),
    ];

    // カメラ初期位置
    this.camera.x = this.player.x - this.camera.width / 2;
    this.camera.y = this.player.y - this.camera.height / 2;

    // ESC で一時停止メニュー
    // capture 相で登録して、他コンポーネント (モーダル等) より先に確実に拾う。
    // code / key どちらでもヒットさせる (IME や一部ブラウザで片方しか来ないケースの保険)。
    this._levelUpActive = false;
    this._onKeyDown = (e) => {
      if (e.code === 'Escape' || e.key === 'Escape') {
        if (this._levelUpActive || this.state === 'ended') return;
        e.preventDefault();
        this.togglePause();
      }
    };
    window.addEventListener('keydown', this._onKeyDown, { capture: true });

    // モバイルの画面内ポーズボタンからの要求を受ける
    this._unsubPauseToggle = eventBus.on('pauseMenu:requestToggle', () => {
      if (this._levelUpActive || this.state === 'ended') return;
      this.togglePause();
    });
  }

  /**
   * 指定時間だけゲーム進行を凍結する（ヒットストップ）。
   * 設定でOFFの場合は何もしない。複数回呼ばれた場合はより長い方を採用。
   */
  hitStop(seconds) {
    if (!GameFeelSettings.hitStopEnabled) return;
    if (seconds > this._hitStopRemaining) this._hitStopRemaining = seconds;
  }

  togglePause() {
    if (this.state === 'paused' && this._pausedByMenu) {
      this.state = 'running';
      this.gameLoop.resume();
      this._pausedByMenu = false;
      eventBus.emit('pauseMenu:hide');
    } else if (this.state === 'running') {
      this.state = 'paused';
      this.gameLoop.pause();
      this._pausedByMenu = true;
      eventBus.emit('pauseMenu:show');
    }
  }

  retreat() {
    // 撤退: ラン強制終了。獲得済み素材・ゴールドはリザルトに含まれる
    this._pausedByMenu = false;
    eventBus.emit('pauseMenu:hide');
    if (this.state === 'paused') this.gameLoop.resume();
    this._endRun('retreat');
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

    // ドロップテーブルのアイテム画像 + プレイヤースプライト
    const imagePaths = new Set();
    imagePaths.add(PLAYER_SPRITE_PATH);
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
    // スマホのスリープ抑止 (失敗しても体験に影響させない)
    requestWakeLock().catch(() => {});
    // visibility 復帰時に wakeLock を再取得 (タブ非アクティブ中に自動解放されるため)
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.state === 'running') {
        requestWakeLock().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _update(dt) {
    if (this.state !== 'running') return;

    // 衝撃波アニメ進行（ヒットストップ中も継続）
    for (const sw of this._shockwaves) sw.t += dt;

    // ヒットストップ: 残り時間分だけゲーム時間を凍結（パーティクルやカメラは動かす）
    if (this._hitStopRemaining > 0) {
      this._hitStopRemaining -= dt;
      // カメラ追従とパーティクルだけ動かす（視覚的に死亡演出は続いていると見せる）
      this.camera.follow(this.player.x, this.player.y, dt);
      this.particles.update(dt, this.camera);
      return;
    }

    this.elapsed += dt;

    // ボス撃破演出のディレイ（ゲーム時間ベース、ポーズに追従）
    // 演出中はプレイヤーを無敵にしてクリア取り消しを防止
    if (this._clearPending != null) {
      this._clearPending -= dt;
      this.player.invincibleTimer = Math.max(this.player.invincibleTimer, 0.1);
      if (this._clearPending <= 0) {
        this._clearPending = null;
        this._endRun('clear');
        return;
      }
    }

    // duration 到達でも自動終了しない（ボスを倒すまで戦闘継続）
    this.player.update(dt);
    // ラン経過時間をドロップシステムに伝達（品質時間ボーナス用）
    this.drops.setElapsedTime(this.elapsed);
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
      // ボススキルのダメージ判定 — circle/rect/配列に対応
      const hitArea = boss.getSkillHitArea();
      if (hitArea) {
        const shapes = Array.isArray(hitArea) ? hitArea : [hitArea];
        const pr = this.player.radius;
        for (const shape of shapes) {
          let hit = false;
          if (shape.type === 'rect') {
            // 回転矩形: 前方[0..range] × 側方[±width/2]
            const cos = Math.cos(shape.angle);
            const sin = Math.sin(shape.angle);
            const px = this.player.x - shape.x;
            const py = this.player.y - shape.y;
            const forward = px * cos + py * sin;
            const lateral = Math.abs(-px * sin + py * cos);
            hit = forward >= -pr && forward <= shape.range + pr && lateral <= shape.width / 2 + pr;
          } else {
            // 既定 circle
            const dx = this.player.x - shape.x;
            const dy = this.player.y - shape.y;
            const r = shape.radius + pr;
            hit = dx * dx + dy * dy < r * r;
          }
          if (hit) {
            this.player.takeDamage(boss.getSkillDamage());
            break; // 同一スキルで複数ヒット防止
          }
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

    this.camera.follow(this.player.x, this.player.y, dt);

    // 生存ボーナス
    const bonusCount = Math.floor(this.elapsed / GameConfig.gold.survivalInterval);
    if (!this._lastSurvivalBonusCount) this._lastSurvivalBonusCount = 0;
    if (bonusCount > this._lastSurvivalBonusCount) {
      this.goldEarned += GameConfig.gold.survivalBonus;
      this._lastSurvivalBonusCount = bonusCount;
    }

    // tick データ再利用（GC削減）
    const td = this._tickData;
    td.elapsed = this.elapsed;
    td.remaining = Math.max(0, GameConfig.run.duration - this.elapsed);
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
        playerSpritePath: PLAYER_SPRITE_PATH,
        playerSpriteFrameW: PLAYER_SPRITE_FRAME_W,
        playerSpriteFrameH: PLAYER_SPRITE_FRAME_H,
      },
    );
    this._renderShockwaves();
  }

  /** 衝撃波リングの更新+描画（ボス撃破などの大技演出） */
  _renderShockwaves() {
    if (this._shockwaves.length === 0) return;
    const ctx = this.canvas.ctx;
    const cam = this.camera;
    ctx.save();
    ctx.translate(cam.shakeX, cam.shakeY);
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      const pct = sw.t / sw.duration;
      if (pct >= 1) {
        const last = this._shockwaves.length - 1;
        if (i !== last) this._shockwaves[i] = this._shockwaves[last];
        this._shockwaves.pop();
        continue;
      }
      const r = sw.maxRadius * pct;
      const alpha = 1 - pct;
      const sx = sw.x - cam.x;
      const sy = sw.y - cam.y;
      if (sx + r < -20 || sx - r > cam.width + 20 || sy + r < -20 || sy - r > cam.height + 20) continue;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 4 * (1 - pct * 0.5);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _onEnemyKilled(enemy) {
    this.killCount++;
    const mods = DifficultyModifiers[this.difficulty];
    const goldMult = mods ? mods.goldMultiplier : 1;
    this.goldEarned += Math.floor(GameConfig.gold.perKill * goldMult);
    if (enemy.isBoss) {
      this.goldEarned += Math.floor(GameConfig.gold.bossBonus * goldMult);
    }
    // ボス撃破チェック — 死神(reaperEntity)は不正クリア扱いにしないため除外
    if (enemy.isBoss && this.bossSystem && enemy === this.bossSystem.bossEntity) {
      this.bossSystem.onBossKilled();
    }
    this.drops.spawnDrops(
      enemy.x, enemy.y,
      enemy.expValue,
      this.player.passives.dropRateBonus,
    );
    // ボスは EnemySpawner のプールに属さないのでリリースしてはいけない
    // （プール再利用で BossEntity が通常敵として蘇り _prepareSkill でクラッシュする）
    if (enemy.isBoss) {
      enemy.active = false;
    } else {
      this.spawner.releaseEnemy(enemy);
    }
  }

  _onLevelUpShow() {
    this._levelUpActive = true;
    this.state = 'paused';
    this.gameLoop.pause();
  }

  _onLevelUpSelected() {
    this._levelUpActive = false;
    this.state = 'running';
    this.gameLoop.resume();
  }

  _onPlayerDied() {
    this._endRun('death');
  }

  _onBossDefeated() {
    // エリアボス撃破 = ステージクリア。ゲーム時間で1.5秒のディレイを入れて演出を見せる
    if (this.state === 'ended') return;
    this._clearPending = 1.5;
  }

  _endRun(reason) {
    if (this.state === 'ended') return; // 再入防止（ボス撃破+プレイヤー死亡の同フレーム対策）
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
      difficulty: this.difficulty,
    });
  }

  destroy() {
    this.gameLoop.stop();
    releaseWakeLock();
    if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown, { capture: true });
    if (this._unsubPauseToggle) this._unsubPauseToggle();
    for (const unsub of this._unsubs) unsub();
    this.player.destroy();
    this.spawner.destroy();
    this.drops.destroy();
    this.levelUp.destroy();
    this.bossSystem.destroy();
    if (this.comboSystem) this.comboSystem.destroy();
    if (this.weapon && typeof this.weapon.destroy === 'function') this.weapon.destroy();
    if (this.consumables) this.consumables.destroy();
    this.damageNumbers.destroy();
    this.particles.clear();
    this.canvas.destroy();
  }
}
