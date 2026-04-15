/**
 * ConsumableSystem — ラン中の消耗品スロット（キー1-3で発動）
 */

import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';

// 消耗品特性効果の倍率 cap (暴走防止)
const MULT_UPPER_CAP = 2.0;   // +2.0 = 3× 倍率まで
const MULT_LOWER_CAP = -0.9;  // -0.9 = 10% まで短縮可能

/**
 * アイテムの traits を集計して消耗品効果倍率を返す。
 * 同キーの trait が複数あれば足し合わせ、最後に cap する。
 */
function collectConsumableMods(item) {
  const mods = {
    consumableDamageMult: 0,
    consumableHealMult: 0,
    consumableBuffMult: 0,
    consumableDurationMult: 0,
    consumableCooldownMult: 0,
  };
  const regenAfter = { amount: 0, duration: 0 };
  if (!item || !Array.isArray(item.traits)) return { mods, regenAfter };
  for (const traitName of item.traits) {
    const def = TraitDefs[traitName];
    if (!def || !def.effects) continue;
    for (const key of Object.keys(mods)) {
      if (typeof def.effects[key] === 'number') mods[key] += def.effects[key];
    }
    if (def.effects.consumableRegenAfter) {
      regenAfter.amount += def.effects.consumableRegenAfter.amount || 0;
      // duration は最大値 (同時に複数 regen を積むと煩雑)
      regenAfter.duration = Math.max(regenAfter.duration, def.effects.consumableRegenAfter.duration || 0);
    }
  }
  // cap
  for (const key of Object.keys(mods)) {
    if (mods[key] > MULT_UPPER_CAP) mods[key] = MULT_UPPER_CAP;
    if (mods[key] < MULT_LOWER_CAP) mods[key] = MULT_LOWER_CAP;
  }
  return { mods, regenAfter };
}

// 品質倍率: Q1 → 1.0, Q10 → 1.45, Q50 → 3.45
function qualityMultiplier(quality) {
  return 1 + Math.max(0, (quality || 1) - 1) * 0.05;
}

export class ConsumableSystem {
  /**
   * @param {object} player - PlayerController
   * @param {object[]} consumableItems - 持ち込み消耗品アイテム配列（最大3）
   */
  constructor(player, consumableItems) {
    this.player = player;
    this.slots = consumableItems.slice(0, 3).map(item => {
      const bp = ItemBlueprints[item.blueprintId];
      return {
        item,
        bp,
        effect: bp?.battleEffect || null,
        usesRemaining: (bp?.battleEffect?.uses) || 3,
        cooldown: 0,
        cooldownMax: 3.0,
      };
    });

    this._activeBuffs = []; // { stat, value, remaining }
    this._regenEffects = []; // { amount: hp/s, remaining: sec }
    // バフ適用前のベース値を保存（バフ終了時の再計算に使用）
    this._basePassives = {
      damageMultiplier: player.passives.damageMultiplier,
      damageReduction: player.passives.damageReduction,
      moveSpeedMultiplier: player.passives.moveSpeedMultiplier,
    };

    this._onKeyDown = (e) => {
      if (e.code === 'Digit1') this._use(0);
      else if (e.code === 'Digit2') this._use(1);
      else if (e.code === 'Digit3') this._use(2);
    };
    window.addEventListener('keydown', this._onKeyDown);

    // HUD (クリック/タップ) からの発動リクエスト
    this._unsubRequestUse = eventBus.on('consumable:requestUse', ({ slot }) => {
      if (Number.isInteger(slot)) this._use(slot);
    });

    // 初期状態をHUDに通知
    if (this.slots.length > 0) {
      eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo(), buffs: this.getActiveBuffs() });
    }
  }

  update(dt) {
    // クールダウン更新
    for (const slot of this.slots) {
      if (slot.cooldown > 0) slot.cooldown -= dt;
    }

    // Regen 効果 (特性 consumableRegenAfter) の持続適用
    if (this._regenEffects.length > 0) {
      for (let i = this._regenEffects.length - 1; i >= 0; i--) {
        const r = this._regenEffects[i];
        this.player.hp = Math.min(this.player.effectiveMaxHp, this.player.hp + r.amount * dt);
        r.remaining -= dt;
        if (r.remaining <= 0) this._regenEffects.splice(i, 1);
      }
    }

    // バフタイマー更新
    let buffChanged = false;
    for (let i = this._activeBuffs.length - 1; i >= 0; i--) {
      this._activeBuffs[i].remaining -= dt;
      if (this._activeBuffs[i].remaining <= 0) {
        this._activeBuffs.splice(i, 1);
        buffChanged = true;
      }
    }
    // バフが変化した場合、ベース値 + アクティブバフから再計算（浮動小数点ドリフト防止）
    if (buffChanged) {
      this.player.passives.damageMultiplier = this._basePassives.damageMultiplier;
      this.player.passives.damageReduction = this._basePassives.damageReduction;
      this.player.passives.moveSpeedMultiplier = this._basePassives.moveSpeedMultiplier;
      for (const buff of this._activeBuffs) {
        if (buff.stat === 'atk') this.player.passives.damageMultiplier += buff.value;
        else if (buff.stat === 'def') this.player.passives.damageReduction += buff.value;
        else if (buff.stat === 'spd') this.player.passives.moveSpeedMultiplier += buff.value;
      }
    }

    // スロット情報を毎tick通知（クールダウン進行表示のため）
    if (this.slots.length > 0) {
      eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo(), buffs: this.getActiveBuffs() });
    }
  }

  _use(slotIndex) {
    if (slotIndex >= this.slots.length) return;
    const slot = this.slots[slotIndex];
    if (!slot || slot.usesRemaining <= 0 || slot.cooldown > 0 || !slot.effect) return;

    slot.usesRemaining--;

    // 特性 + クォリティ補正を集計
    const { mods, regenAfter } = collectConsumableMods(slot.item);
    const qMult = qualityMultiplier(slot.item?.quality);
    // クールダウンは最低 10% まで短縮可、それ以上は clamp
    const cdMult = Math.max(0.1, 1 + mods.consumableCooldownMult);
    slot.cooldown = slot.cooldownMax * cdMult;

    const fx = slot.effect;
    const applyRegenAfter = () => {
      if (regenAfter.amount > 0 && regenAfter.duration > 0) {
        this._regenEffects.push({ amount: regenAfter.amount, remaining: regenAfter.duration });
      }
    };

    switch (fx.type) {
      case 'heal': {
        const healValue = Math.round(fx.value * qMult * (1 + mods.consumableHealMult));
        this.player.hp = Math.min(this.player.effectiveMaxHp, this.player.hp + healValue);
        applyRegenAfter();
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'heal', value: healValue });
        break;
      }

      case 'buff':
        if (fx.stat && fx.amount && fx.duration) {
          const boostedAmount = fx.amount * qMult * (1 + mods.consumableBuffMult);
          const boostedDuration = fx.duration * (1 + mods.consumableDurationMult);
          const value = fx.stat === 'atk' ? boostedAmount * 0.01
                      : fx.stat === 'spd' ? boostedAmount * 0.01
                      : boostedAmount * 0.1;
          if (fx.stat === 'atk') this.player.passives.damageMultiplier += value;
          else if (fx.stat === 'def') this.player.passives.damageReduction += value;
          else if (fx.stat === 'spd') this.player.passives.moveSpeedMultiplier += value;
          this._activeBuffs.push({ stat: fx.stat, value, remaining: boostedDuration });
        }
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'buff', stat: fx.stat });
        break;

      case 'damage': {
        const dmg = Math.round(fx.value * qMult * (1 + mods.consumableDamageMult));
        eventBus.emit('consumable:aoe', { x: this.player.x, y: this.player.y, radius: 100, damage: dmg });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'damage', value: dmg });
        break;
      }

      case 'debuff': {
        const boostedDuration = fx.duration * (1 + mods.consumableDurationMult);
        eventBus.emit('consumable:debuff', { x: this.player.x, y: this.player.y, radius: 120, stat: fx.stat, amount: fx.amount, duration: boostedDuration });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'debuff' });
        break;
      }

      case 'stun': {
        const boostedDuration = fx.duration * (1 + mods.consumableDurationMult);
        eventBus.emit('consumable:debuff', { x: this.player.x, y: this.player.y, radius: 100, stat: 'spd', amount: -999, duration: boostedDuration });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'stun' });
        break;
      }

      case 'healfull':
        this.player.hp = this.player.effectiveMaxHp;
        applyRegenAfter();
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'heal', value: 'MAX' });
        break;
    }

    eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo(), buffs: this.getActiveBuffs() });
  }

  getSlotInfo() {
    return this.slots.map(s => ({
      name: s.item.name,
      blueprintId: s.item.blueprintId,
      usesRemaining: s.usesRemaining,
      usesMax: s.effect?.uses || 3,
      cooldown: s.cooldown,
      cooldownMax: s.cooldownMax,
      effectType: s.effect?.type || 'unknown',
      effectStat: s.effect?.stat || null,
    }));
  }

  /** アクティブバフの残り時間情報 */
  getActiveBuffs() {
    return this._activeBuffs.map(b => ({
      stat: b.stat,
      remaining: b.remaining,
    }));
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._unsubRequestUse) this._unsubRequestUse();
  }
}
