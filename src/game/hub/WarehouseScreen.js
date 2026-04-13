/**
 * WarehouseScreen -- 倉庫（アイテム一覧・フィルタ・ソート）
 */

import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';

export class WarehouseScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'warehouse-screen';
    this.filter = 'all';
    this.sortBy = 'type'; // 'type' | 'quality' | 'name'
  }

  render() {
    this.el.innerHTML = `
      <div class="warehouse-layout">
        <div class="warehouse-header">
          <h3>倉庫</h3>
          <span class="warehouse-capacity">📦 ${this.inventory.items.length} / ${this.inventory.maxCapacity}</span>
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
            </select>
          </div>
        </div>
        <div class="warehouse-grid" id="warehouse-grid"></div>
        <div class="warehouse-detail" id="warehouse-detail">
          <p class="wh-detail-placeholder">アイテムを選択すると詳細が表示されます</p>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.wh-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        this.el.querySelectorAll('.wh-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderGrid();
      });
    });

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

    switch (this.sortBy) {
      case 'quality':
        items.sort((a, b) => b.quality - a.quality);
        break;
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        break;
      case 'type':
      default: {
        const typeOrder = { equipment: 0, accessory: 1, consumable: 2, material: 3 };
        items.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || b.quality - a.quality);
        break;
      }
    }
    return items;
  }

  _renderGrid() {
    const grid = this.el.querySelector('#warehouse-grid');
    const items = this._getFilteredItems();

    if (items.length === 0) {
      grid.innerHTML = '<p class="wh-empty">アイテムがありません</p>';
      return;
    }

    grid.innerHTML = items.map(item => {
      const bp = ItemBlueprints[item.blueprintId];
      const tierClass = item.quality > 80 ? 'tier-legendary' : item.quality > 60 ? 'tier-epic' : item.quality > 40 ? 'tier-rare' : '';
      return `<div class="wh-item ${tierClass}" data-uid="${item.uid}">
        <img src="${bp?.image ? assetPath(bp.image) : ''}" class="wh-item-icon" onerror="this.style.display='none'" alt="">
        <div class="wh-item-info">
          <span class="wh-item-name">${item.name}</span>
          <span class="wh-item-quality">Q${item.quality}</span>
        </div>
        ${item.traits.length > 0 ? `<div class="wh-item-traits">${item.traits.map(t => {
          const def = TraitDefs[t];
          return `<span class="wh-trait rarity-${def?.rarity || 'common'}">${t}</span>`;
        }).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.wh-item').forEach(el => {
      el.addEventListener('click', () => {
        grid.querySelectorAll('.wh-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        this._showDetail(el.dataset.uid);
      });
    });
  }

  _showDetail(uid) {
    const detail = this.el.querySelector('#warehouse-detail');
    const item = this.inventory.getItemByUid(uid);
    if (!item) return;

    const bp = ItemBlueprints[item.blueprintId];
    const typeNames = { material: '素材', equipment: '装備', consumable: '消耗品', accessory: 'アクセサリ' };

    let statsHtml = '';
    if (bp.type === 'equipment' && bp.equipType) {
      const wc = GameConfig.weapon;
      const dmg = (bp.baseValue / wc.damageBaseDivisor + item.quality / wc.damageQualityDivisor).toFixed(1);
      const spd = (wc.speedBase + item.quality / wc.speedQualityDivisor).toFixed(2);
      const typeConfig = GameConfig.weaponTypes[bp.equipType];
      const range = (typeConfig.baseRange * (1 + item.quality / wc.rangeQualityDivisor)).toFixed(0);
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
                }[key] || key;
                runEffects.push(`${label}: +${val}`);
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

    detail.innerHTML = `
      <div class="wh-detail-content">
        <div class="wh-detail-header">
          <img src="${bp?.image ? assetPath(bp.image) : ''}" class="wh-detail-icon" onerror="this.style.display='none'" alt="">
          <div>
            <h4>${item.name}</h4>
            <span class="wh-detail-type">${typeNames[item.type] || item.type}</span>
            <span class="wh-detail-quality">品質: Q${item.quality}</span>
          </div>
        </div>
        ${statsHtml}
        ${traitDetailHtml}
      </div>
    `;
  }

  destroy() {
    this.el.remove();
  }
}
