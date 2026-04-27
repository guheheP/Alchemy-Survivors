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
import { PetDefs } from '../data/pets.js';

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
    /** @type {Map<string, {exp:number, level:number}>} */
    this.ownedPets = new Map();
    /** @type {string|null} */
    this.equippedPetId = null;
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
          ${this._renderPresetBar()}

          <h4>武器スロット</h4>
          <div class="equip-slots">
            ${this.weaponSlots.map((weapon, i) => {
              const bp = weapon ? ItemBlueprints[weapon.blueprintId] : null;
              let statsHtml = '';
              if (weapon && bp) {
                // 実挙動と整合: baseDamageMultiplier と 無属性(+25%) を反映
                const dmgMult = bp.baseDamageMultiplier || 1.0;
                let atkVal = (bp.baseValue / wc.damageBaseDivisor + weapon.quality / wc.damageQualityDivisor) * dmgMult;
                if (bp.element === 'none') atkVal *= 1.25;
                const dmg = fmt1(atkVal);
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
          <h4>契約ペット</h4>
          <div class="equip-slots">${this._renderPetSlot()}</div>
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
    this._bindPresetEvents();
    this._renderSummary();

    // プリセット変更通知を受けて再描画
    if (!this._unsubPreset) {
      this._unsubPreset = eventBus.on('preset:changed', () => {
        // equipment:changed で親から再描画されるので何もしなくて良いが、
        // 装備画面表示中に上書き/削除した場合はプリセットバーだけ更新
        const bar = this.el.querySelector('.equip-presets');
        if (bar) bar.outerHTML = this._renderPresetBar();
        this._bindPresetEvents();
      });
    }

    return this.el;
  }

  _renderPresetBar() {
    const mgr = this.presetsManager;
    if (!mgr) return '';
    const presets = mgr.list || [];
    const items = presets.map(p => `
      <div class="preset-item" data-preset-id="${p.id}">
        <span class="preset-name" title="${this._escapeAttr(p.name)}">${this._escapeAttr(p.name)}</span>
        <div class="preset-item-actions">
          <button class="preset-btn preset-apply" data-id="${p.id}" title="適用">▶</button>
          <button class="preset-btn preset-overwrite" data-id="${p.id}" title="上書き保存">💾</button>
          <button class="preset-btn preset-rename" data-id="${p.id}" title="名前変更">✎</button>
          <button class="preset-btn preset-delete" data-id="${p.id}" title="削除">🗑</button>
        </div>
      </div>
    `).join('');
    const addBtn = mgr.canAdd
      ? `<button class="preset-btn preset-create" title="現在の装備を新規プリセットとして保存">＋ 新規保存</button>`
      : `<span class="preset-limit">(最大${mgr.maxPresets}個)</span>`;
    return `
      <div class="equip-presets">
        <div class="preset-bar-head">
          <span class="preset-bar-title">📂 装備プリセット (${presets.length}/${mgr.maxPresets})</span>
          ${addBtn}
        </div>
        <div class="preset-list">${items || '<span class="preset-empty">プリセット未登録。現在の装備を保存できます。</span>'}</div>
      </div>
    `;
  }

  _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _bindPresetEvents() {
    const bar = this.el.querySelector('.equip-presets');
    if (!bar) return;
    bar.querySelector('.preset-create')?.addEventListener('click', () => {
      const name = prompt('プリセット名を入力:', `セット${(this.presetsManager?.list?.length || 0) + 1}`);
      if (name === null) return; // キャンセル
      eventBus.emit('preset:create', { name });
    });
    bar.querySelectorAll('.preset-apply').forEach(btn => {
      btn.addEventListener('click', () => eventBus.emit('preset:apply', { id: btn.dataset.id }));
    });
    bar.querySelectorAll('.preset-overwrite').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('このプリセットを現在の装備で上書きしますか?')) {
          eventBus.emit('preset:overwrite', { id: btn.dataset.id });
        }
      });
    });
    bar.querySelectorAll('.preset-rename').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = this.presetsManager?.list?.find(x => x.id === btn.dataset.id);
        const name = prompt('新しいプリセット名:', p?.name || '');
        if (name === null || name === '') return;
        eventBus.emit('preset:rename', { id: btn.dataset.id, name });
      });
    });
    bar.querySelectorAll('.preset-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('このプリセットを削除しますか?')) {
          eventBus.emit('preset:delete', { id: btn.dataset.id });
        }
      });
    });
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
    // 武器スロットに装備した盾は追加の軽い防御ボーナス (防具の約1/4)
    for (const w of weapons) {
      const bp = ItemBlueprints[w.blueprintId];
      if (bp?.equipType === 'shield') {
        def += (bp.baseValue / 48) + (w.quality / 32);
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

  _renderPetSlot() {
    const equipped = this.equippedPetId ? this.ownedPets.get(this.equippedPetId) : null;
    const def = this.equippedPetId ? PetDefs[this.equippedPetId] : null;
    const ownedCount = this.ownedPets.size;
    if (equipped && def) {
      return `<div class="weapon-slot filled" data-type="pet">
        <span class="slot-number">🐾</span>
        <span class="slot-icon" style="font-size:1.4rem; line-height:1; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px;">${def.icon}</span>
        <span class="slot-name">${def.name} <small style="opacity:.7">Lv${equipped.level || 1}</small></span>
        <span class="slot-stats">${this._escapeAttr(def.description)}</span>
        <button class="slot-remove" data-type="pet" title="解除">✕</button>
      </div>`;
    }
    if (ownedCount === 0) {
      return `<div class="weapon-slot empty" data-type="pet">
        <span class="slot-number">🐾</span>
        <span class="slot-empty-label">ペット未所持（錬金で卵を作ろう）</span>
      </div>`;
    }
    return `<div class="weapon-slot empty" data-type="pet">
      <span class="slot-number">🐾</span>
      <span class="slot-empty-label">契約スロット — ${ownedCount}匹のペットから選択</span>
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
        } else if (type === 'pet') {
          this.equippedPetId = null;
          eventBus.emit('pet:equipped', { petId: null });
          this.render();
          return;
        }
        this._emitChange();
        this.render();
      });
    });

    // Pet slot click -> picker
    const petSlot = this.el.querySelector('.weapon-slot[data-type="pet"]');
    if (petSlot && this.ownedPets.size > 0) {
      petSlot.addEventListener('click', (e) => {
        // 既装備時は本体クリックで再選択を許す（×ボタンは別ハンドラ）
        if (e.target.classList.contains('slot-remove')) return;
        this._openPetPicker();
      });
      petSlot.style.cursor = 'pointer';
    }
  }

  _openPetPicker() {
    if (this.ownedPets.size === 0) return;
    const picker = document.createElement('div');
    picker.className = 'item-picker-overlay';
    const items = Array.from(this.ownedPets.entries()).map(([id, data]) => {
      const def = PetDefs[id];
      if (!def) return '';
      const equipped = id === this.equippedPetId ? '<span class="picker-equipped">装備中</span>' : '';
      return `<div class="picker-item" data-pet-id="${id}">
        <span style="font-size:1.6rem; margin-right:.5rem;">${def.icon}</span>
        <div style="display:flex; flex-direction:column; gap:0.1rem;">
          <span class="picker-name">${def.name} <small style="opacity:.7">Lv${data.level || 1}</small></span>
          <span style="font-size:0.75rem; opacity:0.85;">${this._escapeAttr(def.description)}</span>
        </div>
        ${equipped}
      </div>`;
    }).join('');
    picker.innerHTML = `
      <div class="item-picker">
        <div class="picker-head">契約するペットを選択</div>
        <div class="picker-list">${items}</div>
        <button class="picker-cancel">キャンセル</button>
      </div>
    `;
    document.body.appendChild(picker);

    const close = () => {
      if (onKey) window.removeEventListener('keydown', onKey);
      picker.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey);
    picker.addEventListener('click', (e) => { if (e.target === picker) close(); });
    picker.querySelector('.picker-cancel').addEventListener('click', close);
    picker.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => {
        const petId = el.dataset.petId;
        this.equippedPetId = petId;
        eventBus.emit('pet:equipped', { petId });
        close();
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
    if (this._unsubPreset) { this._unsubPreset(); this._unsubPreset = null; }
    this.el.remove();
  }
}
