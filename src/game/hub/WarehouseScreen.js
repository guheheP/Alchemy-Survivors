/**
 * WarehouseScreen -- 倉庫（アイテム一覧・フィルタ・ソート・複数選択・売却）
 */

import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';
import { createElementBadgeHTML } from '../ui/UIHelpers.js';
import { fmt1, fmtPct1, fmtInt } from '../ui/NumberFormat.js';

/** 売却価格: baseValue × (quality/100) × (1 + traits × 0.3)
 * 装備は素材の2倍、消耗品は1.5倍。低品質でも最低1G。 */
export function calcSellPrice(item) {
  const bp = ItemBlueprints[item.blueprintId];
  if (!bp) return 1;
  const baseValue = bp.baseValue || 10;
  const qualityFactor = Math.max(0.1, item.quality / 100);
  const traitBonus = 1 + (item.traits?.length || 0) * 0.3;
  let typeMult = 1.0;
  if (item.type === 'equipment') typeMult = 2.0;
  else if (item.type === 'consumable') typeMult = 1.5;
  else if (item.type === 'accessory') typeMult = 2.0;
  return Math.max(1, Math.floor(baseValue * qualityFactor * traitBonus * typeMult));
}

export class WarehouseScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'warehouse-screen';
    this.filter = 'all';
    this.sortBy = 'type';
    this.qualityMin = 0;      // 10刻み: 0, 10, 20, ... 200
    this.qualityMax = 999;    // 999 = 上限なし
    this.traitFilter = 'any'; // 'any' | 'with' | 'without'
    this.selected = new Set(); // Set<uid>
    this.multiSelectMode = false;
    this.lastClickedIdx = null;
    this.getEquippedUids = () => new Set(); // main.js が設定
  }

  /** 外部から装備中UIDセット取得関数を注入 */
  setEquippedUidsProvider(fn) { this.getEquippedUids = fn; }

  render() {
    const capacity = `${this.inventory.items.length} / ${this.inventory.maxCapacity}`;
    // 品質プルダウンのオプション生成（10刻み + 999=上限なし）
    const qMinOpts = [];
    for (let q = 0; q <= 200; q += 10) {
      qMinOpts.push(`<option value="${q}" ${this.qualityMin === q ? 'selected' : ''}>Q${q}${q === 0 ? ' 〜' : ''}</option>`);
    }
    const qMaxOpts = [`<option value="999" ${this.qualityMax === 999 ? 'selected' : ''}>上限なし</option>`];
    for (let q = 10; q <= 200; q += 10) {
      qMaxOpts.push(`<option value="${q}" ${this.qualityMax === q ? 'selected' : ''}>Q${q}</option>`);
    }

    this.el.innerHTML = `
      <div class="warehouse-layout">
        <div class="warehouse-header">
          <h3>倉庫</h3>
          <span class="warehouse-capacity">📦 ${capacity}</span>
          <span class="warehouse-gold">💰 ${this.inventory.gold}G</span>
          <button class="wh-multiselect-toggle ${this.multiSelectMode ? 'active' : ''}" id="wh-multisel-btn">
            ${this.multiSelectMode ? '✓ 複数選択モード ON' : '☐ 複数選択モード'}
          </button>
        </div>
        <div class="warehouse-controls">
          <div class="warehouse-filters">
            <button class="wh-filter ${this.filter === 'all' ? 'active' : ''}" data-filter="all">全て</button>
            <button class="wh-filter ${this.filter === 'material' ? 'active' : ''}" data-filter="material">素材</button>
            <button class="wh-filter ${this.filter === 'equipment' ? 'active' : ''}" data-filter="equipment">装備</button>
            <button class="wh-filter ${this.filter === 'accessory' ? 'active' : ''}" data-filter="accessory">アクセサリ</button>
            <button class="wh-filter ${this.filter === 'consumable' ? 'active' : ''}" data-filter="consumable">消耗品</button>
          </div>
          <div class="warehouse-sort">
            <label>並替:</label>
            <select id="wh-sort">
              <option value="type" ${this.sortBy === 'type' ? 'selected' : ''}>種類</option>
              <option value="quality" ${this.sortBy === 'quality' ? 'selected' : ''}>品質↓</option>
              <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>名前</option>
              <option value="price" ${this.sortBy === 'price' ? 'selected' : ''}>売却額↓</option>
            </select>
          </div>
        </div>
        <div class="warehouse-subfilters">
          <div class="wh-quality-filters">
            <span class="wh-sub-label">品質:</span>
            <select id="wh-qmin" class="wh-qsel">${qMinOpts.join('')}</select>
            <span class="wh-sub-sep">〜</span>
            <select id="wh-qmax" class="wh-qsel">${qMaxOpts.join('')}</select>
          </div>
          <div class="wh-trait-filters">
            <span class="wh-sub-label">特性:</span>
            <button class="wh-tf ${this.traitFilter === 'any' ? 'active' : ''}" data-t="any">全て</button>
            <button class="wh-tf ${this.traitFilter === 'with' ? 'active' : ''}" data-t="with">あり</button>
            <button class="wh-tf ${this.traitFilter === 'without' ? 'active' : ''}" data-t="without">なし</button>
          </div>
        </div>
        <div class="warehouse-quickselect ${this.multiSelectMode ? '' : 'hidden'}">
          <button class="wh-quick" data-quick="traitless">特性なし素材を全選択</button>
          <button class="wh-quick" data-quick="all">表示中を全選択</button>
          <button class="wh-quick" data-quick="clear">選択解除</button>
        </div>
        <div class="warehouse-selection-bar ${this.multiSelectMode ? '' : 'hidden'}" id="warehouse-selbar"></div>
        <div class="warehouse-grid ${this.multiSelectMode ? 'multisel' : ''}" id="warehouse-grid"></div>
        <div class="warehouse-detail" id="warehouse-detail">
          <p class="wh-detail-placeholder">${this.multiSelectMode ? '複数選択モード中: クリックで選択／再クリックで解除／Shift+クリックで範囲選択' : 'アイテムをクリックすると詳細が表示されます'}</p>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    // 複数選択モードトグル
    this.el.querySelector('#wh-multisel-btn').addEventListener('click', () => {
      this.multiSelectMode = !this.multiSelectMode;
      if (!this.multiSelectMode) this.selected.clear();
      this._rerender();
    });

    // 品質プルダウン
    this.el.querySelector('#wh-qmin').addEventListener('change', (e) => {
      this.qualityMin = parseInt(e.target.value);
      // 不整合を自動補正（min > max なら max を min+10 に）
      if (this.qualityMax !== 999 && this.qualityMin > this.qualityMax) {
        this.qualityMax = 999;
      }
      this._renderGrid();
      // max プルダウンを更新するために再描画
      const maxSel = this.el.querySelector('#wh-qmax');
      if (maxSel) maxSel.value = String(this.qualityMax);
    });
    this.el.querySelector('#wh-qmax').addEventListener('change', (e) => {
      this.qualityMax = parseInt(e.target.value);
      if (this.qualityMax !== 999 && this.qualityMin > this.qualityMax) {
        this.qualityMin = Math.max(0, this.qualityMax - 10);
      }
      this._renderGrid();
      const minSel = this.el.querySelector('#wh-qmin');
      if (minSel) minSel.value = String(this.qualityMin);
    });

    // メインフィルタ（種類）
    this.el.querySelectorAll('.wh-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        this.el.querySelectorAll('.wh-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderGrid();
      });
    });
    // 特性フィルタ
    this.el.querySelectorAll('.wh-tf').forEach(btn => {
      btn.addEventListener('click', () => {
        this.traitFilter = btn.dataset.t;
        this.el.querySelectorAll('.wh-tf').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderGrid();
      });
    });
    // クイック選択
    this.el.querySelectorAll('.wh-quick').forEach(btn => {
      btn.addEventListener('click', () => this._applyQuickSelect(btn.dataset.quick));
    });
    // ソート
    this.el.querySelector('#wh-sort').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this._renderGrid();
    });

    this._renderGrid();
    return this.el;
  }

  _getFilteredItems() {
    let items = [...this.inventory.items];
    if (this.filter !== 'all') {
      items = items.filter(i => i.type === this.filter);
    }
    // 品質レンジフィルタ（min以上 かつ max以下／max=999は上限なし）
    items = items.filter(i => {
      if (i.quality < this.qualityMin) return false;
      if (this.qualityMax !== 999 && i.quality > this.qualityMax) return false;
      return true;
    });
    // 特性フィルタ
    if (this.traitFilter === 'with') items = items.filter(i => (i.traits?.length || 0) > 0);
    else if (this.traitFilter === 'without') items = items.filter(i => (i.traits?.length || 0) === 0);

    switch (this.sortBy) {
      case 'quality':
        items.sort((a, b) => b.quality - a.quality);
        break;
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        break;
      case 'price':
        items.sort((a, b) => calcSellPrice(b) - calcSellPrice(a));
        break;
      case 'type':
      default: {
        const typeOrder = { equipment: 0, accessory: 1, consumable: 2, material: 3 };
        items.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || b.quality - a.quality);
        break;
      }
    }
    this._currentItems = items;
    return items;
  }

  _renderGrid() {
    const grid = this.el.querySelector('#warehouse-grid');
    const items = this._getFilteredItems();
    const equipped = this.getEquippedUids();

    if (items.length === 0) {
      grid.innerHTML = '<p class="wh-empty">アイテムがありません</p>';
      this._renderSelectionBar();
      return;
    }

    grid.innerHTML = items.map((item, idx) => {
      const bp = ItemBlueprints[item.blueprintId];
      const tierClass = item.quality > 80 ? 'tier-legendary' : item.quality > 60 ? 'tier-epic' : item.quality > 40 ? 'tier-rare' : '';
      const isSelected = this.selected.has(item.uid);
      const isEquipped = equipped.has(item.uid);
      const isLocked = item.locked;
      const price = calcSellPrice(item);
      const sellable = !isEquipped && !isLocked;
      const unsellableInMulti = this.multiSelectMode && !sellable;
      return `<div class="wh-item ${tierClass} ${isSelected ? 'selected' : ''} ${isEquipped ? 'equipped' : ''} ${isLocked ? 'locked' : ''} ${unsellableInMulti ? 'disabled' : ''}" data-uid="${item.uid}" data-idx="${idx}">
        <img src="${bp?.image ? assetPath(bp.image) : ''}" class="wh-item-icon" onerror="this.style.display='none'" alt="">
        <div class="wh-item-info">
          <span class="wh-item-name">${item.name}</span>
          <span class="wh-item-meta">
            <span class="wh-item-quality">Q${item.quality}</span>
            <span class="wh-item-price">💰${price}</span>
            ${createElementBadgeHTML(bp?.element)}
            ${isEquipped ? '<span class="wh-tag wh-tag-equipped">装備</span>' : ''}
            ${isLocked ? '<span class="wh-tag wh-tag-locked">🔒</span>' : ''}
          </span>
        </div>
        ${(item.traits && item.traits.length > 0) ? `<div class="wh-item-traits">${item.traits.map(t => {
          const def = TraitDefs[t];
          return `<span class="wh-trait rarity-${def?.rarity || 'common'}">${t}</span>`;
        }).join('')}</div>` : ''}
        ${isSelected ? '<div class="wh-select-mark">✓</div>' : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.wh-item').forEach(el => {
      const uid = el.dataset.uid;
      const idx = parseInt(el.dataset.idx);
      el.addEventListener('click', (e) => {
        if (this.multiSelectMode) {
          // 複数選択モード: クリックで選択トグル、Shift+クリックで範囲選択
          if (e.shiftKey && this.lastClickedIdx != null) {
            this._toggleRange(this.lastClickedIdx, idx);
          } else {
            this._toggleSelection(uid);
          }
          this.lastClickedIdx = idx;
        } else {
          // 通常モード: 詳細表示
          this._showDetail(uid);
        }
      });
    });

    if (this.multiSelectMode) this._renderSelectionBar();
  }

  _toggleSelection(uid) {
    const equipped = this.getEquippedUids();
    const item = this.inventory.getItemByUid(uid);
    if (!item || item.locked || equipped.has(uid)) return;
    if (this.selected.has(uid)) this.selected.delete(uid); else this.selected.add(uid);
    this._renderGrid();
  }

  _toggleRange(fromIdx, toIdx) {
    if (!this._currentItems) return;
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const equipped = this.getEquippedUids();
    for (let i = lo; i <= hi; i++) {
      const it = this._currentItems[i];
      if (!it || it.locked || equipped.has(it.uid)) continue;
      this.selected.add(it.uid);
    }
    this._renderGrid();
  }

  _applyQuickSelect(kind) {
    const items = this._currentItems || this._getFilteredItems();
    const equipped = this.getEquippedUids();
    if (kind === 'clear') {
      this.selected.clear();
    } else if (kind === 'all') {
      for (const it of items) {
        if (!it.locked && !equipped.has(it.uid)) this.selected.add(it.uid);
      }
    } else if (kind === 'traitless') {
      for (const it of items) {
        if (it.type === 'material' && (!it.traits || it.traits.length === 0) && !it.locked && !equipped.has(it.uid)) {
          this.selected.add(it.uid);
        }
      }
    }
    this._renderGrid();
  }

  /** 全体再描画（モード切替・売却後などヘッダー状態が変わるとき） */
  _rerender() {
    const prevScroll = this.el.scrollTop;
    this.container.removeChild(this.el);
    this.render();
    this.el.scrollTop = prevScroll;
  }

  _renderSelectionBar() {
    const bar = this.el.querySelector('#warehouse-selbar');
    if (!bar) return;
    if (this.selected.size === 0) {
      bar.innerHTML = '<span class="wh-selbar-empty">アイテム未選択 — チェックボックスで複数選択、またはクイック選択ボタンをどうぞ</span>';
      return;
    }
    let total = 0;
    for (const uid of this.selected) {
      const it = this.inventory.getItemByUid(uid);
      if (it) total += calcSellPrice(it);
    }
    bar.innerHTML = `
      <span class="wh-selbar-count">選択中: <b>${this.selected.size}</b> 個</span>
      <span class="wh-selbar-total">合計売却額: <b>💰 ${total}G</b></span>
      <button class="wh-selbar-sell" id="wh-sell-btn">選択したアイテムを売却</button>
      <button class="wh-selbar-clear" id="wh-clear-btn">選択解除</button>
    `;
    bar.querySelector('#wh-sell-btn').addEventListener('click', () => this._confirmSell(total));
    bar.querySelector('#wh-clear-btn').addEventListener('click', () => {
      this.selected.clear();
      this._renderGrid();
    });
  }

  _confirmSell(total) {
    const count = this.selected.size;
    if (count === 0) return;
    const ok = confirm(`${count}個のアイテムを合計 ${total}G で売却しますか？\nこの操作は取り消せません。`);
    if (!ok) return;
    const uids = [...this.selected];
    const result = this.inventory.sellItems(uids, calcSellPrice);
    eventBus.emit('toast', { message: `💰 ${result.sold}個を売却しました (+${result.total}G)`, type: 'success' });
    this.selected.clear();
    this.lastClickedIdx = null;
    this._rerender();
  }

  _showDetail(uid) {
    const detail = this.el.querySelector('#warehouse-detail');
    const item = this.inventory.getItemByUid(uid);
    if (!item) return;

    const bp = ItemBlueprints[item.blueprintId];
    const typeNames = { material: '素材', equipment: '装備', consumable: '消耗品', accessory: 'アクセサリ' };
    const price = calcSellPrice(item);

    let statsHtml = '';
    if (bp.type === 'equipment' && bp.equipType) {
      const wc = GameConfig.weapon;
      // 実挙動と整合: baseDamageMultiplier と 無属性(+25%) を反映
      const dmgMult = bp.baseDamageMultiplier || 1.0;
      let rawDmg = (bp.baseValue / wc.damageBaseDivisor + item.quality / wc.damageQualityDivisor) * dmgMult;
      if (bp.element === 'none') rawDmg *= 1.25;
      const dmg = fmt1(rawDmg);
      const spd = fmt1(wc.speedBase + item.quality / wc.speedQualityDivisor);
      const typeConfig = GameConfig.weaponTypes[bp.equipType];
      const range = fmtInt(typeConfig.baseRange * (1 + item.quality / wc.rangeQualityDivisor));
      statsHtml = `
        <div class="wh-stats">
          <div>攻撃力: ${dmg}</div>
          <div>攻撃速度: ${spd}x</div>
          <div>射程: ${range}px</div>
          <div>武器種: ${bp.equipType}</div>
        </div>
      `;
    }

    let traitDetailHtml = '';
    if (item.traits.length > 0) {
      traitDetailHtml = `<div class="wh-trait-details">
        <h5>特性効果</h5>
        ${item.traits.map(t => {
          const def = TraitDefs[t];
          if (!def) return '';
          const runEffects = [];
          if (def.effects) {
            for (const [key, val] of Object.entries(def.effects)) {
              if (key.startsWith('run')) {
                const label = {
                  runDamageFlat: '武器ダメージ', runDamageReduction: 'ダメージ軽減',
                  runMaxHpFlat: '最大HP', runMoveSpeed: '移動速度', runRegenPerSec: 'HP回復/秒',
                  runDodge: '回避率', runDropRate: 'ドロップ率', runAttackSpeed: '攻撃速度',
                  runExpBonus: '経験値ボーナス', runStartInvincible: '開始時無敵',
                  runCritChance: '会心率', runCritDamage: '会心ダメージ',
                  runElementProc: '属性発動率', runElementPower: '属性効果量',
                }[key] || key;
                runEffects.push(`${label}: +${typeof val === 'number' && val < 1 && val > 0 ? fmtPct1(val) + '%' : fmt1(val)}`);
              }
            }
          }
          return `<div class="wh-trait-row">
            <span class="wh-trait-name rarity-${def.rarity}">${t}</span>
            <span class="wh-trait-desc">${def.description}</span>
            ${runEffects.length > 0 ? `<div class="wh-trait-run">${runEffects.join(' / ')}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }

    const equipped = this.getEquippedUids();
    const isEquipped = equipped.has(item.uid);
    const canToggleLock = !isEquipped;
    // 個別売却は 装備中 / ロック中 のときは不可
    const canSellSingle = !isEquipped && !item.locked;

    detail.innerHTML = `
      <div class="wh-detail-content">
        <div class="wh-detail-header">
          <img src="${bp?.image ? assetPath(bp.image) : ''}" class="wh-detail-icon" onerror="this.style.display='none'" alt="">
          <div>
            <h4>${item.name}</h4>
            <span class="wh-detail-type">${typeNames[item.type] || item.type}</span>
            <span class="wh-detail-quality">品質: Q${item.quality}</span>
            <span class="wh-detail-price">売却額: 💰${price}G</span>
            ${isEquipped ? '<span class="wh-tag wh-tag-equipped">装備中</span>' : ''}
            ${item.locked ? '<span class="wh-tag wh-tag-locked">🔒ロック中</span>' : ''}
          </div>
          <div class="wh-detail-actions">
            ${canToggleLock ? `<button class="wh-lock-btn" data-uid="${item.uid}">${item.locked ? '🔓 ロック解除' : '🔒 ロック'}</button>` : ''}
            ${canSellSingle ? `<button class="wh-sell-single" data-uid="${item.uid}" data-price="${price}">💰 単品売却 (${price}G)</button>` : ''}
          </div>
        </div>
        ${statsHtml}
        ${traitDetailHtml}
      </div>
    `;

    const lockBtn = detail.querySelector('.wh-lock-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        this.inventory.toggleLock(uid);
        // 再描画
        this._renderGrid();
        this._showDetail(uid);
      });
    }

    const sellBtn = detail.querySelector('.wh-sell-single');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => {
        const ok = confirm(`「${item.name}」を ${price}G で売却しますか？\nこの操作は取り消せません。`);
        if (!ok) return;
        const result = this.inventory.sellItems([uid], calcSellPrice);
        eventBus.emit('toast', { message: `💰 ${item.name} を売却しました (+${result.total}G)`, type: 'success' });
        // 選択解除 + 再描画（詳細ペインも閉じる）
        this.selected.delete(uid);
        detail.innerHTML = '';
        this._rerender();
      });
    }
  }

  destroy() {
    this.el.remove();
  }
}
