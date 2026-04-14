/**
 * PlayerController — プレイヤー移動・ステータス管理
 */

import { Entity } from './Entity.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { Progression } from '../data/progression.js';
import { MobileControls } from '../ui/MobileControls.js';

export class PlayerController extends Entity {
  constructor(equippedArmor = null, equippedAccessory = null) {
    super();
    this.type = 'player';
    this.radius = GameConfig.run.playerRadius;

    // ベースステータス（固定主人公） + 永続アップグレード
    // HP/ATK は Lv=% の乗算、DEF は Lv を防御力の数値として直接加算
    const hpBonus = 1 + Progression.getStatBonusPercent('hp');
    const atkBonus = 1 + Progression.getStatBonusPercent('atk');
    this.maxHp = GameConfig.run.playerBaseHp * hpBonus;
    this.hp = this.maxHp;
    this.baseSpeed = GameConfig.run.playerBaseSpeed;
    this.baseDamage = GameConfig.run.playerBaseDamage * atkBonus;
    // 永続DEF Lv (0〜100) を後段で passives.damageReduction に加算
    this._permanentDefValue = Progression.getStatLevel('def');

    // 方向
    this.facingAngle = 0;

    // 無敵フレーム
    this.invincibleTimer = 0;

    // ダッシュ
    this.dashTimer = 0;          // ダッシュ持続中の残り秒
    this.dashCooldownTimer = 0;  // 次回発動までのCD残り秒
    this.dashVx = 0;
    this.dashVy = 0;
    this._dashKeyHeld = false;

    // 入力関連（applyWeaponTraits 前の update 呼び出しに備えて初期化）
    this._keys = new Set();
    this._onKeyDown = null;
    this._onKeyUp = null;
    this.mobileControls = null;

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
      damageReduction: 0,
      dodge: 0,
      extraProjectile: 0,
      expMultiplier: 0,
      critChance: 0,
    };

    // 防具・アクセサリ
    this.equippedArmor = equippedArmor;
    this.equippedAccessory = equippedAccessory;

    // 防具効果適用
    if (equippedArmor) {
      const bp = ItemBlueprints[equippedArmor.blueprintId];
      if (bp) {
        this.passives.damageReduction += bp.baseValue / 12 + equippedArmor.quality / 8;
        this.maxHp += equippedArmor.quality * 0.5;
        this.hp = this.maxHp;
      }
    }

    // アクセサリ効果適用
    if (equippedAccessory) {
      const bp = ItemBlueprints[equippedAccessory.blueprintId];
      if (bp) {
        this.passives.moveSpeedMultiplier += bp.baseValue / 500 + equippedAccessory.quality / 1000;
      }
    }

    // 防具・アクセサリの特性からrun*パッシブを適用
    this._applyTraitPassives([equippedArmor, equippedAccessory]);

    // 永続DEF Lv を防御力にフラット加算（armor/特性と同じ値単位）
    this.passives.damageReduction += this._permanentDefValue;
  }

  /** 武器スロットの特性もパッシブに適用（RunManagerから呼ぶ） */
  applyWeaponTraits(weaponSlots) {
    this._applyTraitPassives(weaponSlots);
    this._bindInput();
  }

  _bindInput() {
    if (this._onKeyDown) return; // 二重登録防止
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.mobileControls = new MobileControls();
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

    // ダッシュ各種タイマー
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;

    // リジェネ
    if (this.passives.regenPerSec > 0) {
      this.hp = Math.min(this.effectiveMaxHp, this.hp + this.passives.regenPerSec * dt);
    }

    // 移動入力（キーボード）
    let dx = 0, dy = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) dy -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) dy += 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) dx -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) dx += 1;

    // モバイル仮想スティック入力を統合
    if (this.mobileControls?.active && (this.mobileControls.dx !== 0 || this.mobileControls.dy !== 0)) {
      dx += this.mobileControls.dx;
      dy += this.mobileControls.dy;
    }

    // 斜め移動の正規化
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    // ダッシュ発動判定（Space / Shift / モバイルダッシュボタン）
    const dashPressed = this._keys.has('Space') || this._keys.has('ShiftLeft') || this._keys.has('ShiftRight')
      || (this.mobileControls?.dashRequested === true);
    if (dashPressed && !this._dashKeyHeld && this.dashTimer <= 0 && this.dashCooldownTimer <= 0) {
      this._tryDash(dx, dy);
    }
    this._dashKeyHeld = dashPressed;
    if (this.mobileControls) this.mobileControls.dashRequested = false;

    // 移動適用 — ダッシュ中は dashV を優先、無敵
    if (this.dashTimer > 0) {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      this.invincibleTimer = Math.max(this.invincibleTimer, this.dashTimer);
    } else if (dx !== 0 || dy !== 0) {
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
      this.facingAngle = Math.atan2(dy, dx);
    }
  }

  /** ダッシュ発動 — 入力方向（無入力なら facingAngle）に dashSpeed×dashDuration 直進 */
  _tryDash(dx, dy) {
    let ux = dx, uy = dy;
    const len = Math.sqrt(ux * ux + uy * uy);
    if (len === 0) {
      ux = Math.cos(this.facingAngle);
      uy = Math.sin(this.facingAngle);
    } else {
      ux /= len; uy /= len;
    }
    const sp = GameConfig.run.dashSpeed;
    this.dashVx = ux * sp;
    this.dashVy = uy * sp;
    this.dashTimer = GameConfig.run.dashDuration;
    this.dashCooldownTimer = GameConfig.run.dashCooldown;
    this.facingAngle = Math.atan2(uy, ux);
    eventBus.emit('player:dashed');
  }

  takeDamage(amount) {
    if (this.invincibleTimer > 0) return false;

    // 回避判定
    if (this.passives.dodge > 0 && Math.random() < this.passives.dodge) return false;

    // ダメージ計算式: 防御力は 1/3 で減算、最低でも攻撃力の25%は通る（最大75%軽減）
    const def = this.passives.damageReduction || 0;
    const reduced = amount - def / 3;
    const minDamage = Math.max(1, Math.ceil(amount * 0.25));
    const effectiveDamage = Math.max(minDamage, Math.round(reduced));

    this.hp -= effectiveDamage;
    this.invincibleTimer = GameConfig.run.invincibilityDuration;
    eventBus.emit('player:damaged', { hp: this.hp, maxHp: this.effectiveMaxHp, damage: effectiveDamage });

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

  _applyTraitPassives(items) {
    for (const item of items) {
      if (!item || !item.traits) continue;
      for (const traitName of item.traits) {
        const def = TraitDefs[traitName];
        if (!def || !def.effects) continue;
        const fx = def.effects;
        if (fx.runDamageFlat) this.baseDamage += fx.runDamageFlat;
        if (fx.runDamageReduction) this.passives.damageReduction += fx.runDamageReduction;
        if (fx.runMaxHpFlat) { this.maxHp += fx.runMaxHpFlat; this.hp = this.maxHp; }
        if (fx.runMoveSpeed) this.passives.moveSpeedMultiplier += fx.runMoveSpeed;
        if (fx.runRegenPerSec) this.passives.regenPerSec += fx.runRegenPerSec;
        if (fx.runDodge) this.passives.dodge += fx.runDodge;
        if (fx.runDropRate) this.passives.dropRateBonus += fx.runDropRate;
        if (fx.runAttackSpeed) this.passives.cooldownReduction += fx.runAttackSpeed;
        if (fx.runExpBonus) this.passives.expMultiplier += fx.runExpBonus;
      }
    }
  }

  destroy() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    if (this.mobileControls) this.mobileControls.destroy();
  }
}
