/**
 * PlayerController — プレイヤー移動・ステータス管理
 */

import { Entity } from './Entity.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';

export class PlayerController extends Entity {
  constructor() {
    super();
    this.type = 'player';
    this.radius = GameConfig.run.playerRadius;

    // ベースステータス（固定主人公）
    this.maxHp = GameConfig.run.playerBaseHp;
    this.hp = this.maxHp;
    this.baseSpeed = GameConfig.run.playerBaseSpeed;
    this.baseDamage = GameConfig.run.playerBaseDamage;

    // 方向
    this.facingAngle = 0;

    // 無敵フレーム
    this.invincibleTimer = 0;

    // レベル
    this.level = 1;
    this.exp = 0;

    // パッシブ累計
    this.passives = {
      damageMultiplier: 0,
      rangeMultiplier: 0,
      maxHpFlat: 0,
      moveSpeedMultiplier: 0,
      magnetMultiplier: 0,
      cooldownReduction: 0,
      regenPerSec: 0,
      dropRateBonus: 0,
    };

    // 入力
    this._keys = new Set();
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  get speed() {
    return this.baseSpeed * (1 + this.passives.moveSpeedMultiplier);
  }

  get magnetRange() {
    return GameConfig.run.magnetRange * (1 + this.passives.magnetMultiplier);
  }

  get effectiveMaxHp() {
    return this.maxHp + this.passives.maxHpFlat;
  }

  update(dt) {
    this.savePrev();

    // 無敵タイマー
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
    }

    // リジェネ
    if (this.passives.regenPerSec > 0) {
      this.hp = Math.min(this.effectiveMaxHp, this.hp + this.passives.regenPerSec * dt);
    }

    // 移動入力
    let dx = 0, dy = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) dy -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) dy += 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) dx -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) dx += 1;

    // 斜め移動の正規化
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    // 移動適用
    if (dx !== 0 || dy !== 0) {
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
      this.facingAngle = Math.atan2(dy, dx);
    }
  }

  takeDamage(amount) {
    if (this.invincibleTimer > 0) return false;

    this.hp -= amount;
    this.invincibleTimer = GameConfig.run.invincibilityDuration;
    eventBus.emit('player:damaged', { hp: this.hp, maxHp: this.effectiveMaxHp, damage: amount });

    if (this.hp <= 0) {
      this.hp = 0;
      eventBus.emit('player:died');
      return true;
    }
    return false;
  }

  addPassive(passiveDef) {
    const { stat, value } = passiveDef.effect;
    this.passives[stat] = (this.passives[stat] || 0) + value;

    // maxHp増加時は現HPも回復
    if (stat === 'maxHpFlat') {
      this.hp = Math.min(this.effectiveMaxHp, this.hp + value);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
