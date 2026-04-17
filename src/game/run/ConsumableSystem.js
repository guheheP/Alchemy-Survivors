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

// 品質倍率: Q1 → 1.0, Q50 → 1.49, Q100 → 1.99, Q500 → 5.99
// 実クオリティは 0〜999 スケール (Progression.getQualityCap)。
// 0.05/step だと Q50 で 3.45× となり 回復薬(base 40) が maxHp=100 を余裕で超え
// 常時 全回復 してしまうため、他ステータス系 (quality/50〜/100) と揃えて 0.01/step に縮小。
// 注: tiers 形式の battleEffect では使用されない（tier 閾値による加算式に置換）
function qualityMultiplier(quality) {
  return 1 + Math.max(0, (quality || 1) - 1) * 0.01;
}

/**
 * 品質による段階的効果解決。
 * battleEffect.tiers = [{ minQuality, heal, regen:{hpPerSec,duration}, buffs:[...], percentHeal, damage, statusEffect:{type,dps,duration}, vulnerable:{amount,duration}, stun:{duration}, shield:{amount,duration} }, ...]
 * item.quality 以上の tier 全てを合成して返す。数値フィールドは加算、オブジェクトは内部数値加算、配列 buffs は stat キーで merge。
 */
export function resolveTieredEffects(battleEffect, quality) {
  if (!battleEffect || !Array.isArray(battleEffect.tiers)) return null;
  const q = Math.max(0, quality || 0);
  const out = {};
  const mergeObj = (destKey, srcObj) => {
    out[destKey] = out[destKey] || {};
    for (const k of Object.keys(srcObj)) {
      const v = srcObj[k];
      if (typeof v === 'number') out[destKey][k] = (out[destKey][k] || 0) + v;
      else out[destKey][k] = v; // 文字列などは上書き
    }
  };
  for (const tier of battleEffect.tiers) {
    if (q < (tier.minQuality || 0)) continue;
    for (const key of Object.keys(tier)) {
      if (key === 'minQuality') continue;
      const val = tier[key];
      if (key === 'buffs' && Array.isArray(val)) {
        out.buffs = out.buffs || {};
        for (const b of val) {
          if (!b || !b.stat) continue;
          const cur = out.buffs[b.stat] || { stat: b.stat, amount: 0, duration: 0 };
          cur.amount += b.amount || 0;
          cur.duration += b.duration || 0;
          out.buffs[b.stat] = cur;
        }
      } else if (typeof val === 'number') {
        out[key] = (out[key] || 0) + val;
      } else if (typeof val === 'object' && val !== null) {
        mergeObj(key, val);
      }
    }
  }
  return out;
}

// バフ stat → player.passives フィールド・単位変換テーブル。
// unit = amount に掛ける係数（例: 攻撃+20 → damageMultiplier +0.2）。
const BUFF_STAT_MAP = {
  atk:       { field: 'damageMultiplier',   unit: 0.01 },
  def:       { field: 'damageReduction',    unit: 0.1  },
  spd:       { field: 'moveSpeedMultiplier', unit: 0.01 },
  crit:      { field: 'critChance',         unit: 0.01 },
  critDmg:   { field: 'critDamage',         unit: 0.01 },
  cooldown:  { field: 'cooldownReduction',  unit: 0.01 },
  elemPower: { field: 'elementPowerBonus',  unit: 0.01 },
  elemProc:  { field: 'elementProcBonus',   unit: 0.01 },
  dodge:     { field: 'dodge',              unit: 0.01 },
  range:     { field: 'rangeMultiplier',    unit: 0.01 },
  magnet:    { field: 'magnetMultiplier',   unit: 0.01 },
  maxHp:     { field: 'maxHpFlat',          unit: 1    },
};
export function getBuffStatMap() { return BUFF_STAT_MAP; }

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
    // 差分更新: 各バフは player.passives.xxx += value で即加算し、
    // 期限切れ時に value を減算して戻す。レベルアップで passives が変わっても正しく追従する。

    // スロット情報の前回値キャッシュ（差分があるときだけ emit してDOM churnを防ぐ）
    this._lastSlotsInfo = null;

    // レベルアップモーダルなどのUIがキー入力を占有しているか
    this._inputBlocked = false;
    this._unsubInputBlock = eventBus.on('input:blockGame', () => { this._inputBlocked = true; });
    this._unsubInputRelease = eventBus.on('input:releaseGame', () => { this._inputBlocked = false; });

    this._onKeyDown = (e) => {
      if (this._inputBlocked) return;
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

    // バフタイマー更新 — 期限切れバフは差分を player.passives から減算（レベルアップ取得分を破壊しない）
    let buffChanged = false;
    for (let i = this._activeBuffs.length - 1; i >= 0; i--) {
      this._activeBuffs[i].remaining -= dt;
      if (this._activeBuffs[i].remaining <= 0) {
        const buff = this._activeBuffs[i];
        const map = BUFF_STAT_MAP[buff.stat];
        if (map) {
          this.player.passives[map.field] -= buff.value;
          // maxHp シールド: 最大HPが減ったら現HPもクランプ
          if (map.field === 'maxHpFlat') {
            this.player.hp = Math.min(this.player.hp, this.player.effectiveMaxHp);
          }
        }
        this._activeBuffs.splice(i, 1);
        buffChanged = true;
      }
    }

    // スロット/バフ情報に差分があるときのみ emit（HUD DOM churn 削減）
    if (this.slots.length > 0) {
      if (this._hasSlotOrBuffChanged(buffChanged)) {
        eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo(), buffs: this.getActiveBuffs() });
      }
    }
  }

  /**
   * 前回emitした状態と現在を比較し、表示に影響する変化があるかを返す。
   * CD 表示のため CD 値は 0.1s 刻みで量子化して比較（毎tick変わる細かい差分は無視）。
   */
  _hasSlotOrBuffChanged(forceBuff) {
    if (forceBuff) return true;
    const slots = this.slots;
    if (!this._lastSlotsInfo || this._lastSlotsInfo.length !== slots.length) {
      this._lastSlotsInfo = slots.map(() => ({ uses: -1, cdQ: -1 }));
      return true;
    }
    let changed = false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const prev = this._lastSlotsInfo[i];
      const cdQ = Math.round(Math.max(0, s.cooldown) * 10); // 0.1秒刻み
      if (s.usesRemaining !== prev.uses || cdQ !== prev.cdQ) {
        prev.uses = s.usesRemaining;
        prev.cdQ = cdQ;
        changed = true;
      }
    }
    return changed;
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

    // tier 形式の battleEffect は専用ハンドラで処理
    if (Array.isArray(fx.tiers)) {
      this._applyTieredEffect(slotIndex, fx, slot.item, mods);
      applyRegenAfter();
      eventBus.emit('consumable:slotsChanged', { slots: this.getSlotInfo(), buffs: this.getActiveBuffs() });
      return;
    }

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

  /**
   * tiers[] を品質で解決して各効果を適用する。
   * trait 倍率 (mods) は既存と同様に適用: heal→healMult, damage→damageMult, buff.amount→buffMult, duration系→durationMult
   */
  _applyTieredEffect(slotIndex, fx, item, mods) {
    const resolved = resolveTieredEffects(fx, item?.quality || 0);
    if (!resolved) return;
    const target = fx.target || 'ally';
    const radius = fx.radius || 120;
    const healMult = 1 + mods.consumableHealMult;
    const damageMult = 1 + mods.consumableDamageMult;
    const buffMult = 1 + mods.consumableBuffMult;
    const durMult = 1 + mods.consumableDurationMult;
    const player = this.player;
    let totalHealed = 0;

    // 回復（固定値）
    if (resolved.heal) {
      const v = Math.round(resolved.heal * healMult);
      const before = player.hp;
      player.hp = Math.min(player.effectiveMaxHp, player.hp + v);
      totalHealed += player.hp - before;
    }
    // 割合回復（最大HPの%）
    if (resolved.percentHeal) {
      const pct = resolved.percentHeal / 100;
      const v = Math.round(player.effectiveMaxHp * pct * healMult);
      const before = player.hp;
      player.hp = Math.min(player.effectiveMaxHp, player.hp + v);
      totalHealed += player.hp - before;
    }
    // 持続回復 (HoT)
    if (resolved.regen && resolved.regen.duration > 0 && resolved.regen.hpPerSec > 0) {
      this._regenEffects.push({
        amount: resolved.regen.hpPerSec * healMult,
        remaining: resolved.regen.duration * durMult,
      });
    }
    // シールド（一時最大HP + 即時チャージ）
    if (resolved.shield && resolved.shield.amount > 0 && resolved.shield.duration > 0) {
      const amt = Math.round(resolved.shield.amount * buffMult);
      const dur = resolved.shield.duration * durMult;
      player.passives.maxHpFlat += amt;
      player.hp = Math.min(player.effectiveMaxHp, player.hp + amt);
      this._activeBuffs.push({ stat: 'maxHp', value: amt, remaining: dur });
    }
    // バフ（複数 stat 対応）
    if (resolved.buffs) {
      for (const key of Object.keys(resolved.buffs)) {
        const b = resolved.buffs[key];
        const map = BUFF_STAT_MAP[b.stat];
        if (!map || !b.amount || !b.duration) continue;
        const value = b.amount * buffMult * map.unit;
        const dur = b.duration * durMult;
        player.passives[map.field] += value;
        this._activeBuffs.push({ stat: b.stat, value, remaining: dur });
      }
    }
    // AoE ダメージ
    if (resolved.damage) {
      const v = Math.round(resolved.damage * damageMult);
      eventBus.emit('consumable:aoe', { x: player.x, y: player.y, radius: fx.radius || 100, damage: v });
    }
    // 状態異常付与 (敵 AoE)
    if (resolved.statusEffect && resolved.statusEffect.type) {
      const se = resolved.statusEffect;
      eventBus.emit('consumable:status', {
        x: player.x, y: player.y, radius,
        type: se.type,
        params: {
          duration: (se.duration || 0) * durMult,
          dps: se.dps || 0,
          speedMod: se.speedMod,
          damageMultiplier: se.damageMultiplier,
        },
      });
    }
    // 脆弱化（被ダメUP）
    if (resolved.vulnerable && resolved.vulnerable.duration > 0) {
      eventBus.emit('consumable:status', {
        x: player.x, y: player.y, radius,
        type: 'vulnerable',
        params: {
          duration: resolved.vulnerable.duration * durMult,
          damageMultiplier: (resolved.vulnerable.amount || 0) / 100,
        },
      });
    }
    // スタン
    if (resolved.stun && resolved.stun.duration > 0) {
      eventBus.emit('consumable:debuff', {
        x: player.x, y: player.y, radius: radius,
        stat: 'spd', amount: -999, duration: resolved.stun.duration * durMult,
      });
    }

    eventBus.emit('consumable:used', {
      slot: slotIndex,
      type: 'tiered',
      value: totalHealed > 0 ? totalHealed : undefined,
      target,
    });
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._unsubRequestUse) this._unsubRequestUse();
    if (this._unsubInputBlock) this._unsubInputBlock();
    if (this._unsubInputRelease) this._unsubInputRelease();
  }
}
