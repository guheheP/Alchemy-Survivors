/**
 * EnemyAI — 敵の追尾ロジック + 挙動パターン
 *
 * behavior 種別:
 *  - 'chase'        (default) 通常追尾
 *  - 'glass_cannon' 高速・低HP（init時に補正）
 *  - 'tank'         低速・高HP・大型（init時に補正）
 *  - 'erratic'      速度が時間でサイン波変動
 *  - 'armored'      最初のN発ダメージ無効（armorHits）
 *  - 'dasher'       停止→予備動作→突進 の繰り返し
 */

import { Entity } from './Entity.js';
import { eventBus } from '../core/EventBus.js';

export class Enemy extends Entity {
  constructor() {
    super();
    this.type = 'enemy';
    this.hp = 0;
    this.maxHp = 0;
    this.speed = 0;
    this.damage = 0;
    this.expValue = 0;
    this.color = '#f00';
    this.enemyId = '';
    this.enemyDef = null;
    this.hitFlashTimer = 0;
    this.critFlashTimer = 0;
    // デバフ管理
    this._debuffTimer = 0;
    this._baseSpeed = 0;
    // 状態異常（フラット構造でGC回避）
    this._burnTimer = 0;
    this._burnDps = 0;
    this._burnAccum = 0;
    this._poisonTimer = 0;
    this._poisonDps = 0;
    this._poisonAccum = 0;
    this._freezeTimer = 0;
    this._shockTimer = 0;
    this._vulnerableTimer = 0;
    this._vulnerableMult = 0;
    // 挙動パターン
    this.behavior = 'chase';
    this.armorHits = 0;
    this._behaviorTimer = 0;
    this._dashState = 'idle'; // 'idle' | 'telegraph' | 'dashing'
    this._dashDir = { x: 0, y: 0 };
    this._dashStateTimer = 0;
    // ノックバック管理: 回数に応じてKB距離が減衰 (max(0, 1 - n/7))
    // 7回目以降は完全無効。盾スタックの永久ロック対策とゲーム性のバランス。
    this._knockbackCount = 0;
  }

  reset() {
    super.reset();
    this.hp = 0;
    this.maxHp = 0;
    this.speed = 0;
    this.damage = 0;
    this.expValue = 0;
    this.color = '#f00';
    this.enemyId = '';
    this.enemyDef = null;
    this.hitFlashTimer = 0;
    this.critFlashTimer = 0;
    this._debuffTimer = 0;
    this._baseSpeed = 0;
    this._burnTimer = 0;
    this._burnDps = 0;
    this._burnAccum = 0;
    this._poisonTimer = 0;
    this._poisonDps = 0;
    this._poisonAccum = 0;
    this._freezeTimer = 0;
    this._shockTimer = 0;
    this._vulnerableTimer = 0;
    this._vulnerableMult = 0;
    this.behavior = 'chase';
    this.armorHits = 0;
    this._behaviorTimer = 0;
    this._dashState = 'idle';
    this._dashDir = { x: 0, y: 0 };
    this._dashStateTimer = 0;
    this._knockbackCount = 0;
  }

  /**
   * ノックバックを試みる。KB回数に応じて距離が減衰し、7回目以降は完全無効。
   * 減衰式: strength × max(0, 1 - count/7)
   * @param {number} dx - 押し出し方向 x
   * @param {number} dy - 押し出し方向 y
   * @param {number} dist - sqrt(dx^2 + dy^2)
   * @param {number} strength - 押し出し距離 (px)
   */
  tryKnockback(dx, dy, dist, strength) {
    if (!dist || dist <= 0 || !strength) return false;
    const decay = Math.max(0, 1 - this._knockbackCount / 7);
    if (decay <= 0) return false;
    this.x += (dx / dist) * strength * decay;
    this.y += (dy / dist) * strength * decay;
    this._knockbackCount++;
    return true;
  }

  /** 敵データから初期化 */
  init(def, x, y) {
    // 型ガード: BossEntity が誤って通常敵プールに入り再利用されるのを早期検出
    if (this.isBoss) {
      throw new Error('Enemy.init called on BossEntity instance — boss should never be in EnemySpawner pool');
    }
    this.active = true;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.speed = def.speed;
    this.damage = def.damage;
    this.expValue = def.expValue;
    this.radius = def.radius;
    this.color = def.color;
    this.enemyId = def.id;
    this.enemyDef = def;
    this.behavior = def.behavior || 'chase';
    this.armorHits = def.armorHits || 0;
    this._behaviorTimer = Math.random() * Math.PI * 2; // erratic位相をバラす
    this._dashState = 'idle';
    this._dashStateTimer = 0.5 + Math.random() * 1.0;

    // behavior 別の初期ステータス補正
    this._applyBehaviorStats();
    this._baseSpeed = this.speed;
  }

  _applyBehaviorStats() {
    switch (this.behavior) {
      case 'glass_cannon':
        this.speed *= 1.5;
        this.maxHp = Math.max(1, Math.floor(this.maxHp * 0.6));
        this.hp = this.maxHp;
        break;
      case 'tank':
        this.speed *= 0.55;
        this.maxHp = Math.floor(this.maxHp * 2.0);
        this.hp = this.maxHp;
        this.radius = Math.floor(this.radius * 1.3);
        this.damage = Math.floor(this.damage * 1.3);
        break;
      case 'armored':
        // armorHits は def から渡される。HPは据え置き、見た目用に若干大きく
        this.radius = Math.floor(this.radius * 1.1);
        break;
      case 'dasher':
        this.speed *= 0.3; // 通常時は遅い
        break;
      // 'erratic' は update で動的に速度変動
      default:
        break;
    }
  }

  /** デバフを適用（速度変更 + 持続時間） */
  applyDebuff(speedModifier, duration) {
    // erratic 等で speed が動的に変動する敵でも、_baseSpeed は init 時に確定しているので
    // そこを基準にしてデバフ効果を反映する（旧実装ではデバフ重ね掛け時に _baseSpeed が更新されず
    // 終了時に不正な値に復元されるバグがあった）
    this.speed = Math.max(1, this._baseSpeed + speedModifier);
    this._debuffTimer = duration;
  }

  /** プレイヤーに向かって移動（挙動別） */
  update(dt, playerX, playerY) {
    this.savePrev();

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }
    if (this.critFlashTimer > 0) {
      this.critFlashTimer -= dt;
    }

    // デバフ解除
    if (this._debuffTimer > 0) {
      this._debuffTimer -= dt;
      if (this._debuffTimer <= 0) {
        this.speed = this._baseSpeed;
      }
    }

    // ノックバックは1回限り (bool 管理。reset() / プール再利用時にクリア)

    // 状態異常ティック
    this.updateStatusEffects(dt);

    // 感電スタン中は移動不能
    if (this.isStunned) return;

    this._behaviorTimer += dt;

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distSq = dx * dx + dy * dy;
    // dist は dasher 以外は使わない。必要になってから計算。

    switch (this.behavior) {
      case 'erratic': {
        // 速度を 0.3〜1.8 倍で振動させる
        const factor = 1.05 + Math.sin(this._behaviorTimer * 3.5) * 0.75;
        const s = Math.max(5, this._baseSpeed * factor);
        if (distSq > 1) {
          const dist = Math.sqrt(distSq);
          this.x += (dx / dist) * s * dt;
          this.y += (dy / dist) * s * dt;
        }
        break;
      }
      case 'dasher': {
        const dist = Math.sqrt(distSq);
        this._updateDasher(dt, dx, dy, dist);
        break;
      }
      default: {
        if (distSq > 1) {
          const dist = Math.sqrt(distSq);
          this.x += (dx / dist) * this.speed * dt;
          this.y += (dy / dist) * this.speed * dt;
        }
        break;
      }
    }
  }

  _updateDasher(dt, dx, dy, dist) {
    this._dashStateTimer -= dt;
    if (this._dashState === 'idle') {
      // ゆっくり近づきつつタイマー経過で予備動作へ
      if (dist > 1) {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
      if (this._dashStateTimer <= 0) {
        this._dashState = 'telegraph';
        this._dashStateTimer = 0.5; // 0.5秒の予備動作
        if (dist > 0.1) {
          this._dashDir = { x: dx / dist, y: dy / dist };
        }
      }
    } else if (this._dashState === 'telegraph') {
      // 停止＆フラッシュ
      this.hitFlashTimer = 0.1;
      if (this._dashStateTimer <= 0) {
        this._dashState = 'dashing';
        this._dashStateTimer = 0.35; // 0.35秒突進
      }
    } else if (this._dashState === 'dashing') {
      const dashSpeed = this._baseSpeed * 4.5; // 通常の4.5倍で突進
      this.x += this._dashDir.x * dashSpeed * dt;
      this.y += this._dashDir.y * dashSpeed * dt;
      if (this._dashStateTimer <= 0) {
        this._dashState = 'idle';
        this._dashStateTimer = 1.5 + Math.random() * 0.8;
      }
    }
  }

  /** dasherが予備動作中かを外部から確認（描画でマーカー用） */
  get isTelegraphing() { return this.behavior === 'dasher' && this._dashState === 'telegraph'; }
  get isDashing() { return this.behavior === 'dasher' && this._dashState === 'dashing'; }

  takeDamage(amount, isCrit = false, dotColor = null) {
    // armored: 最初のN発を無効化
    if (this.armorHits > 0) {
      this.armorHits--;
      this.hitFlashTimer = 0.1;
      eventBus.emit('enemy:blocked', { x: this.x, y: this.y, remaining: this.armorHits });
      return false;
    }
    // 脆弱（水属性）: 被ダメージを増幅
    amount = amount * this._incomingDamageMult();
    this.hp -= amount;
    this.hitFlashTimer = 0.1;
    if (isCrit) this.critFlashTimer = 0.18;
    eventBus.emit('enemy:damaged', { x: this.x, y: this.y, damage: amount, isCrit, dotColor });
    return this.hp <= 0;
  }

  /** 被ダメージ乗算係数（脆弱状態時に1+_vulnerableMult、なければ1.0） */
  _incomingDamageMult() {
    return this._vulnerableTimer > 0 ? (1 + this._vulnerableMult) : 1;
  }

  /**
   * 状態異常を適用（refresh-if-stronger方式）
   * @param {'burn'|'poison'|'freeze'|'shock'|'vulnerable'} type
   * @param {{ duration: number, dps?: number, speedMod?: number, damageMultiplier?: number }} params
   */
  applyStatusEffect(type, params) {
    switch (type) {
      case 'burn':
        if (params.duration > this._burnTimer) this._burnTimer = params.duration;
        if (params.dps > this._burnDps) this._burnDps = params.dps;
        break;
      case 'poison':
        if (params.duration > this._poisonTimer) this._poisonTimer = params.duration;
        if (params.dps > this._poisonDps) this._poisonDps = params.dps;
        break;
      case 'freeze':
        this._freezeTimer = Math.max(this._freezeTimer, params.duration);
        this.applyDebuff(params.speedMod || -40, params.duration);
        break;
      case 'shock':
        this._shockTimer = Math.max(this._shockTimer, params.duration);
        break;
      case 'vulnerable':
        if (params.duration > this._vulnerableTimer) this._vulnerableTimer = params.duration;
        if ((params.damageMultiplier || 0) > this._vulnerableMult) {
          this._vulnerableMult = params.damageMultiplier;
        }
        break;
    }
  }

  /** 状態異常のティック処理 */
  updateStatusEffects(dt) {
    // 燃焼 DoT (1ティック最低2ダメ保証)
    if (this._burnTimer > 0) {
      this._burnTimer -= dt;
      this._burnAccum += dt;
      if (this._burnAccum >= 0.5) {
        this._burnAccum -= 0.5;
        const raw = this._burnDps * 0.5 * this._incomingDamageMult();
        const dmg = raw > 0 ? Math.max(2, raw) : 0;
        if (dmg > 0 && this.active) {
          this.hp -= dmg;
          eventBus.emit('enemy:damaged', { x: this.x, y: this.y, damage: dmg, isCrit: false, dotColor: '#f62' });
          if (this.hp <= 0) {
            eventBus.emit('enemy:killed', { enemy: this, x: this.x, y: this.y, isBoss: this.isBoss, color: this.color });
          }
        }
      }
      if (this._burnTimer <= 0) { this._burnDps = 0; this._burnAccum = 0; }
    }

    // 毒 DoT + 感染拡散 (1ティック最低2ダメ保証)
    if (this._poisonTimer > 0) {
      this._poisonTimer -= dt;
      this._poisonAccum += dt;
      if (this._poisonAccum >= 0.5) {
        this._poisonAccum -= 0.5;
        const raw = this._poisonDps * 0.5 * this._incomingDamageMult();
        const dmg = raw > 0 ? Math.max(2, raw) : 0;
        if (dmg > 0 && this.active) {
          this.hp -= dmg;
          eventBus.emit('enemy:damaged', { x: this.x, y: this.y, damage: dmg, isCrit: false, dotColor: '#6a4' });
          if (this.hp <= 0) {
            eventBus.emit('enemy:killed', { enemy: this, x: this.x, y: this.y, isBoss: this.isBoss, color: this.color });
          }
        }
        // 毒の感染拡散（半径60px、半減のDPS/持続時間）
        if (this.active && this._poisonTimer > 0) {
          eventBus.emit('statusEffect:spread', {
            x: this.x, y: this.y, radius: 60, source: this,
            type: 'poison', params: { duration: Math.min(this._poisonTimer, 2), dps: this._poisonDps * 0.5 },
          });
        }
      }
      if (this._poisonTimer <= 0) { this._poisonDps = 0; this._poisonAccum = 0; }
    }

    // 凍結（視覚タイマーのみ、スロー自体は applyDebuff が管理）
    if (this._freezeTimer > 0) {
      this._freezeTimer -= dt;
    }

    // 感電スタン
    if (this._shockTimer > 0) {
      this._shockTimer -= dt;
    }

    // 脆弱（被ダメージ増加）
    if (this._vulnerableTimer > 0) {
      this._vulnerableTimer -= dt;
      if (this._vulnerableTimer <= 0) this._vulnerableMult = 0;
    }
  }

  /** 感電中は移動不能 */
  get isStunned() {
    return this._shockTimer > 0;
  }
}
