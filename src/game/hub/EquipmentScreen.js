/**
 * EquipmentScreen — 装備変更UI（4武器 + 防具 + アクセサリ）
 */

import { ItemBlueprints, TraitDefs, canEquipInSlot } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { WeaponSkillDefs } from '../data/weaponSkills.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';
import { getTraitCategory, createElementBadgeHTML } from '../ui/UIHelpers.js';
import { fmt1, fmtPct1, fmtInt } from '../ui/NumberFormat.js';

/** 特性のラン中効果を簡潔な日本語表記に変換 */
function formatTraitRunEffect(def) {
  if (!def?.effects) return '';
  const labels = {
    runDamageFlat: 'ダメージ', runDamageReduction: '軽減', runMaxHpFlat: 'HP',
    runMoveSpeed: '速度', runRegenPerSec: '回復/秒', runDodge: '回避',
    runDropRate: 'ドロップ率', runAttackSpeed: '攻速', runExpBonus: '経験値',
    runStartInvincible: '開始無敵(秒)',
    runCritChance: '会心率', runCritDamage: '会心ダメ',
    runElementProc: '属性発動', runElementPower: '属性威力',
  };
  const parts = [];
  for (const [key, val] of Object.entries(def.effects)) {
    if (key.startsWith('run') && labels[key]) {
      const display = typeof val === 'number' && val < 1 && val > 0
        ? `+${fmtPct1(val)}%` : `+${fmt1(val)}`;
      parts.push(`${labels[key]}${display}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

/** アイテムの特性を「バッジ + ホバーツールチップ」として描画 */
function renderTraitBadges(traits) {
  if (!traits || traits.length === 0) return '';
  return `<div class="equip-card-traits">${traits.map(t => {
    const def = TraitDefs[t];
    const rarity = def?.rarity || 'common';
    const desc = def?.description || '';
    const runFx = formatTraitRunEffect(def);
    const cat = getTraitCategory(t);
    const pills = (cat.equip ? `<span class="trait-cat-pill trait-cat-equip" title="装備中に発動">装</span>` : '')
      + (cat.craft ? `<span class="trait-cat-pill trait-cat-craft" title="素材として調合時に発動">素</span>` : '');
    return `<span class="equip-trait-wrap">
      <span class="wh-trait rarity-${rarity}">${pills}${t}</span>
      <span class="trait-tooltip">
        <span class="trait-tt-name rarity-${rarity}">${t}</span>
        <span class="trait-tt-rarity">${rarity}</span>
        ${desc ? `<p class="trait-tt-desc">${desc}</p>` : ''}
        ${runFx ? `<p class="trait-tt-run">装備効果: ${runFx}</p>` : ''}
      </span>
    </span>`;
  }).join('')}</div>`;
}

const MAX_WEAPON_SLOTS = 4;

export class EquipmentScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'equip-screen';
    this.weaponSlots = [null, null, null, null];
    this.armorSlot = null;
    this.accessorySlot = null;
  }

  render() {
    const allEquipment = this.inventory.getItemsByType('equipment');
    const allAccessories = this.inventory.getItemsByType('accessory');

    // 盾は武器スロットにも装備可能（ShieldStrategyで武器効果を持つ）
    const weapons = allEquipment.filter(item => canEquipInSlot(item, 'weapon'));

    const armors = allEquipment.filter(item => canEquipInSlot(item, 'armor'));

    const equippedUids = new Set([
      ...this.weaponSlots.filter(w => w).map(w => w.uid),
      this.armorSlot?.uid,
      this.accessorySlot?.uid,
    ].filter(Boolean));

    const wc = GameConfig.weapon;

    this.el.innerHTML = `
      <div class="equip-layout">
        <div class="equip-current">
          <h3>装備セット</h3>
          <p class="equip-hint">武器4枠 + 防具 + アクセサリ。武器はレベルアップで順番に解放。</p>

          <h4>武器スロット</h4>
          <div class="equip-slots">
            ${this.weaponSlots.map((weapon, i) => {
              const bp = weapon ? ItemBlueprints[weapon.blueprintId] : null;
              let statsHtml = '';
              if (weapon && bp) {
                const dmg = fmt1(bp.baseValue / wc.damageBaseDivisor + weapon.quality / wc.damageQualityDivisor);
                statsHtml = `<span class="slot-stats">ATK:${dmg} Q${weapon.quality}</span>`;
              }
              return `<div class="weapon-slot ${weapon ? 'filled' : 'empty'}" data-slot="${i}" data-type="weapon">
                <span class="slot-number">${i + 1}</span>
                ${weapon
                  ? `<img src="${bp?.image ? assetPath(bp.image) : ''}" class="slot-icon" onerror="this.style.display='none'" alt="">
                     <span class="slot-name">${weapon.name}</span>
                     ${statsHtml}
                     ${renderTraitBadges(weapon.traits)}
                     <button class="slot-remove" data-slot="${i}" data-type="weapon">✕</button>`
                  : `<span class="slot-empty-label">${i === 0 ? '初期武器（必須）' : '空きスロット'}</span>`
                }
              </div>`;
            }).join('')}
          </div>

          <h4>防具・アクセサリ</h4>
          <div class="equip-slots">
            ${this._renderDefenseSlot('armor', '防具', this.armorSlot)}
            ${this._renderDefenseSlot('accessory', 'アクセサリ', this.accessorySlot)}
          </div>
          <div class="equip-summary" id="equip-summary"></div>
        </div>
        <div class="equip-inventory">
          <h4>装備可能アイテム</h4>
          <div class="equip-tabs">
            <button class="equip-filter-btn active" data-filter="weapon">武器</button>
            <button class="equip-filter-btn" data-filter="armor">防具</button>
            <button class="equip-filter-btn" data-filter="accessory">アクセサリ</button>
          </div>
          <div class="equip-list" id="equip-item-list">
            ${this._renderItemList(weapons, equippedUids)}
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this._currentFilter = 'weapon';
    this._bindEvents(weapons, armors, allAccessories, equippedUids);
    this._renderSummary();

    return this.el;
  }

  _renderSummary() {
    const summary = this.el.querySelector('#equip-summary');
    if (!summary) return;

    const weapons = this.weaponSlots.filter(w => w);
    if (weapons.length === 0 && !this.armorSlot && !this.accessorySlot) {
      summary.innerHTML = '';
      return;
    }

    const wc = GameConfig.weapon;

    // 武器ごとの基礎ダメージ（baseValue+quality+baseDamageMultiplier）を個別計算
    const weaponBaseDmgs = weapons.map(w => {
      const bp = ItemBlueprints[w.blueprintId];
      if (!bp) return 0;
      const dmgMult = bp.baseDamageMultiplier || 1.0;
      return (bp.baseValue / wc.damageBaseDivisor + w.quality / wc.damageQualityDivisor) * dmgMult;
    });

    let def = 0, hpBonus = 0, spdBonus = 0;
    if (this.armorSlot) {
      const bp = ItemBlueprints[this.armorSlot.blueprintId];
      if (bp) {
        def = bp.baseValue / 12 + this.armorSlot.quality / 8;
        hpBonus = this.armorSlot.quality * 0.5;
      }
    }
    if (this.accessorySlot) {
      const bp = ItemBlueprints[this.accessorySlot.blueprintId];
      if (bp) spdBonus = bp.baseValue / 2500 + this.accessorySlot.quality / 5000;
    }

    // 装備中アイテムの特性からステータス上昇値を集計（戦闘に関わるrun系のみ）
    const traitBonus = {
      runDamageFlat: 0, runDamageReduction: 0, runMaxHpFlat: 0,
      runMoveSpeed: 0, runRegenPerSec: 0, runDodge: 0,
      runDropRate: 0, runAttackSpeed: 0, runExpBonus: 0,
      runCritChance: 0, runCritDamage: 0,
      runElementProc: 0, runElementPower: 0,
    };
    const accumulateTraits = (item, targetBag = traitBonus) => {
      if (!item?.traits) return;
      for (const t of item.traits) {
        const td = TraitDefs[t];
        if (!td?.effects) continue;
        for (const [k, v] of Object.entries(td.effects)) {
          if (k in targetBag) targetBag[k] += v;
        }
      }
    };
    weapons.forEach(w => accumulateTraits(w));
    accumulateTraits(this.armorSlot);
    accumulateTraits(this.accessorySlot);

    // 武器固有スコープの runDamageFlat (各武器に個別適用)
    const weaponOwnFlat = weapons.map(w => {
      if (!w?.traits) return 0;
      let sum = 0;
      for (const t of w.traits) {
        const td = TraitDefs[t];
        if (td?.effects?.runDamageFlat) sum += td.effects.runDamageFlat;
      }
      return sum;
    });
    // 全武器共通スコープ (防具+アクセサリ由来の runDamageFlat)
    let gearFlat = 0;
    for (const slot of [this.armorSlot, this.accessorySlot]) {
      if (!slot?.traits) continue;
      for (const t of slot.traits) {
        const td = TraitDefs[t];
        if (td?.effects?.runDamageFlat) gearFlat += td.effects.runDamageFlat;
      }
    }

    // 装備値+特性値の合計を表示するヘルパー
    const fmtBonus = (val, formatter) => val ? `<span class="stat-trait-bonus" title="特性によるボーナス">${formatter(val)}</span>` : '';

    // 特性ボーナス行のフォーマッタ
    const traitFormatters = {
      runDamageFlat:      v => ['攻撃力',         `+${fmt1(v)}`],
      runDamageReduction: v => ['ダメージ軽減',   `+${fmt1(v)}`],
      runMaxHpFlat:       v => ['最大HP',         `+${fmt1(v)}`],
      runMoveSpeed:       v => ['移動速度',       `${v >= 0 ? '+' : ''}${fmtPct1(v)}%`],
      runRegenPerSec:     v => ['HP回復',         `+${fmt1(v)}/秒`],
      runDodge:           v => ['回避率',         `${v >= 0 ? '+' : ''}${fmtPct1(v)}%`],
      runDropRate:        v => ['ドロップ率',     `+${fmtPct1(v)}%`],
      runAttackSpeed:     v => ['攻撃速度',       `+${fmtPct1(v)}%`],
      runExpBonus:        v => ['経験値',         `+${fmtPct1(v)}%`],
      runCritChance:      v => ['会心率', `+${fmtPct1(v)}%`],
      runCritDamage:      v => ['会心ダメージ', `+${fmtPct1(v)}%`],
      runElementProc:     v => ['属性発動率',   `+${fmtPct1(v)}%`],
      runElementPower:    v => ['属性効果量',   `+${fmtPct1(v)}%`],
    };
    const traitBonusRows = Object.entries(traitBonus)
      .filter(([k, v]) => v !== 0 && traitFormatters[k])
      .map(([k, v]) => {
        const [label, valStr] = traitFormatters[k](v);
        return `<div class="equip-stat-item"><span>${label}</span><span class="stat-val stat-trait-only">${valStr}</span></div>`;
      })
      .join('');

    // 武器スキル一覧
    let skillsHtml = '';
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      const skillDef = WeaponSkillDefs[w.blueprintId];
      if (!skillDef) continue;
      skillsHtml += `<div class="equip-skill-row"><span class="equip-skill-weapon">${w.name}</span><span class="equip-skill-name">${skillDef.name}</span><span class="equip-skill-cd">CD${skillDef.cooldown}s</span></div>`;
    }

    // 装備値と特性値を合算した合計表示（武器固有スコープ対応版）
    // - 武器スロットの runDamageFlat: その武器のみに加算
    // - 防具/アクセの runDamageFlat: 全武器に加算 (weapons.length × gearFlat)
    // - 無属性武器(element='none'): 該当武器のダメージに ×1.25
    let totalAtk = 0;
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      const bp = ItemBlueprints[w.blueprintId];
      let perWeapon = weaponBaseDmgs[i] + weaponOwnFlat[i] + gearFlat;
      if (bp?.element === 'none') perWeapon *= 1.25;
      totalAtk += perWeapon;
    }
    const totalDmg = weaponBaseDmgs.reduce((a, b) => a + b, 0);
    const flatBonusTotal = totalAtk - totalDmg;
    const avgAtk = weapons.length > 0 ? totalAtk / weapons.length : 0;
    const totalDef = def + traitBonus.runDamageReduction;
    const totalHp = hpBonus + traitBonus.runMaxHpFlat;
    const totalSpd = spdBonus + traitBonus.runMoveSpeed;

    summary.innerHTML = `
      <h4>装備合計ステータス</h4>
      <div class="equip-stat-grid">
        <div class="equip-stat-item"><span>合算攻撃力</span><span class="stat-val">${fmt1(totalAtk)}${fmtBonus(flatBonusTotal, v => `+${fmt1(v)}`)}</span></div>
        <div class="equip-stat-item"><span>平均攻撃力</span><span class="stat-val">${weapons.length > 0 ? `${fmt1(avgAtk)}${fmtBonus(traitBonus.runDamageFlat, v => `+${fmt1(v)}`)}` : '—'}</span></div>
        <div class="equip-stat-item"><span>防御力</span><span class="stat-val">${fmt1(totalDef)}${fmtBonus(traitBonus.runDamageReduction, v => `+${fmt1(v)}`)}</span></div>
        <div class="equip-stat-item"><span>HP増加</span><span class="stat-val">+${fmtInt(totalHp)}${fmtBonus(traitBonus.runMaxHpFlat, v => `+${fmt1(v)}`)}</span></div>
        <div class="equip-stat-item"><span>速度増加</span><span class="stat-val">+${fmtPct1(totalSpd)}%${fmtBonus(traitBonus.runMoveSpeed, v => `+${fmtPct1(v)}%`)}</span></div>
        <div class="equip-stat-item"><span>武器数</span><span class="stat-val">${weapons.length}/4</span></div>
      </div>
      ${traitBonusRows ? `<h4>特性ボーナス合計</h4><div class="equip-stat-grid">${traitBonusRows}</div>` : ''}
      ${skillsHtml ? `<h4>武器スキル</h4><div class="equip-skill-list">${skillsHtml}</div>` : ''}
    `;
  }

  _renderDefenseSlot(type, label, item) {
    const bp = item ? ItemBlueprints[item.blueprintId] : null;
    let statsHtml = '';
    if (item && bp) {
      if (type === 'armor') {
        const def = fmt1(bp.baseValue / 12 + item.quality / 8);
        statsHtml = `<span class="slot-stats">DEF:${def} Q${item.quality}</span>`;
      } else {
        const spdRatio = bp.baseValue / 2500 + item.quality / 5000;
        statsHtml = `<span class="slot-stats">SPD:+${fmtPct1(spdRatio)}% Q${item.quality}</span>`;
      }
    }
    return `<div class="weapon-slot ${item ? 'filled' : 'empty'}" data-type="${type}">
      <span class="slot-number">${type === 'armor' ? '🛡' : '💍'}</span>
      ${item
        ? `<img src="${bp?.image ? assetPath(bp.image) : ''}" class="slot-icon" onerror="this.style.display='none'" alt="">
           <span class="slot-name">${item.name}</span>
           ${statsHtml}
           ${renderTraitBadges(item.traits)}
           <button class="slot-remove" data-type="${type}">✕</button>`
        : `<span class="slot-empty-label">${label}スロット</span>`
      }
    </div>`;
  }

  _renderItemList(items, equippedUids) {
    if (items.length === 0) return '<p class="equip-no-weapons">該当アイテムなし</p>';
    return items.map(w => {
      const bp = ItemBlueprints[w.blueprintId];
      const isEquipped = equippedUids.has(w.uid);
      return `<div class="equip-weapon-card ${isEquipped ? 'equipped' : ''}" data-uid="${w.uid}">
        <img src="${bp?.image ? assetPath(bp.image) : ''}" class="equip-card-icon" onerror="this.style.display='none'" alt="">
        <div class="equip-card-info">
          <span class="equip-card-name">${w.name}</span>
          <div class="equip-card-meta">
            <span class="equip-card-quality">Q${w.quality}</span>
            ${createElementBadgeHTML(bp?.element)}
            ${renderTraitBadges(w.traits)}
          </div>
        </div>
        ${isEquipped ? '<span class="equip-badge">装備中</span>' : ''}
      </div>`;
    }).join('');
  }

  _bindEvents(weapons, armors, accessories, equippedUids) {
    // Filter tabs
    this.el.querySelectorAll('.equip-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('.equip-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._currentFilter = btn.dataset.filter;
        const listEl = this.el.querySelector('#equip-item-list');
        const items = this._currentFilter === 'weapon' ? weapons
          : this._currentFilter === 'armor' ? armors : accessories;
        listEl.innerHTML = this._renderItemList(items, equippedUids);
        this._bindItemCards();
      });
    });

    this._bindItemCards();

    // Remove buttons
    this.el.querySelectorAll('.slot-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        if (type === 'weapon') {
          const idx = parseInt(btn.dataset.slot);
          this.weaponSlots[idx] = null;
          this._compactSlots();
        } else if (type === 'armor') {
          this.armorSlot = null;
        } else if (type === 'accessory') {
          this.accessorySlot = null;
        }
        this._emitChange();
        this.render();
      });
    });
  }

  _bindItemCards() {
    this.el.querySelectorAll('.equip-weapon-card:not(.equipped)').forEach(card => {
      card.addEventListener('click', () => {
        const uid = card.dataset.uid;
        const item = this.inventory.getItemByUid(uid);
        if (!item) return;

        // 現在タブのスロットに装備可能かを検証（盾は武器・防具どちらも可）
        if (!canEquipInSlot(item, this._currentFilter)) return;

        if (this._currentFilter === 'weapon') {
          const emptyIdx = this.weaponSlots.indexOf(null);
          if (emptyIdx === -1) return;
          this.weaponSlots[emptyIdx] = item;
        } else if (this._currentFilter === 'armor') {
          this.armorSlot = item;
        } else if (this._currentFilter === 'accessory') {
          this.accessorySlot = item;
        }

        this._emitChange();
        this.render();
      });
    });
  }

  _compactSlots() {
    const filled = this.weaponSlots.filter(w => w !== null);
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
      this.weaponSlots[i] = filled[i] || null;
    }
  }

  _emitChange() {
    eventBus.emit('equipment:changed', {
      weaponSlots: [...this.weaponSlots],
      armor: this.armorSlot,
      accessory: this.accessorySlot,
    });
  }

  destroy() {
    this.el.remove();
  }
}
