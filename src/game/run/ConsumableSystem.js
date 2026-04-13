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

    this._activeBuffs = []; // { stat, amount, remaining }

    this._onKeyDown = (e) => {
      if (e.code === 'Digit1') this._use(0);
      else if (e.code === 'Digit2') this._use(1);
      else if (e.code === 'Digit3') this._use(2);
    };
    window.addEventListener('keydown', this._onKeyDown);

    // 初期状態をHUDに通知
    if (this.slots.length > 0) {
      eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo() });
    }
  }

  update(dt) {
    // クールダウン更新
    for (const slot of this.slots) {
      if (slot.cooldown > 0) slot.cooldown -= dt;
    }

    // バフタイマー更新
    for (let i = this._activeBuffs.length - 1; i >= 0; i--) {
      this._activeBuffs[i].remaining -= dt;
      if (this._activeBuffs[i].remaining <= 0) {
        // バフ終了 — ステータスを戻す
        const buff = this._activeBuffs[i];
        if (buff.stat === 'atk') this.player.passives.damageMultiplier -= buff.value;
        else if (buff.stat === 'def') this.player.passives.damageReduction -= buff.value;
        else if (buff.stat === 'spd') this.player.passives.moveSpeedMultiplier -= buff.value;
        this._activeBuffs.splice(i, 1);
      }
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
    }

    eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo() });
  }

  getSlotInfo() {
    return this.slots.map(s => ({
      name: s.item.name,
      usesRemaining: s.usesRemaining,
      cooldown: s.cooldown,
      cooldownMax: s.cooldownMax,
      effectType: s.effect?.type || 'unknown',
    }));
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
