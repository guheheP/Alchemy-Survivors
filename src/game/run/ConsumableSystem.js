/**
 * ConsumableSystem — ラン中の消耗品スロット（キー1-3で発動）
 */

import { ItemBlueprints } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';

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
    slot.cooldown = slot.cooldownMax;

    const fx = slot.effect;
    switch (fx.type) {
      case 'heal':
        this.player.hp = Math.min(this.player.effectiveMaxHp, this.player.hp + fx.value);
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'heal', value: fx.value });
        break;

      case 'buff':
        if (fx.stat && fx.amount && fx.duration) {
          const value = fx.stat === 'atk' ? fx.amount * 0.01 : fx.stat === 'spd' ? fx.amount * 0.01 : fx.amount * 0.1;
          if (fx.stat === 'atk') this.player.passives.damageMultiplier += value;
          else if (fx.stat === 'def') this.player.passives.damageReduction += value;
          else if (fx.stat === 'spd') this.player.passives.moveSpeedMultiplier += value;
          this._activeBuffs.push({ stat: fx.stat, value, remaining: fx.duration });
        }
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'buff', stat: fx.stat });
        break;

      case 'damage': {
        // プレイヤー周囲にAoEダメージ
        eventBus.emit('consumable:aoe', { x: this.player.x, y: this.player.y, radius: 100, damage: fx.value });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'damage', value: fx.value });
        break;
      }

      case 'debuff':
        // 周囲の敵減速（EventBus経由でRunManagerが処理）
        eventBus.emit('consumable:debuff', { x: this.player.x, y: this.player.y, radius: 120, stat: fx.stat, amount: fx.amount, duration: fx.duration });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'debuff' });
        break;

      case 'stun':
        eventBus.emit('consumable:debuff', { x: this.player.x, y: this.player.y, radius: 100, stat: 'spd', amount: -999, duration: fx.duration });
        eventBus.emit('consumable:used', { slot: slotIndex, type: 'stun' });
        break;

      case 'healfull':
        // 全回復
        this.player.hp = this.player.effectiveMaxHp;
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
