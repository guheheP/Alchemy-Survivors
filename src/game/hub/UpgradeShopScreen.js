/**
 * UpgradeShopScreen -- アップグレードショップ（ゴールドで強化購入）
 */

import { eventBus } from '../core/EventBus.js';
import { Progression } from '../data/progression.js';
import { GameConfig } from '../data/config.js';
import { fmt1 } from '../ui/NumberFormat.js';

/** 倉庫拡張 Lv → 次レベル購入コスト */
function warehouseCost(currentLevel) {
  // 累進式: Lv1=150, Lv5≈500, Lv10≈2800, Lv20≈55000
  return Math.floor(150 * Math.pow(1.35, currentLevel));
}

/** 永続ステータスアップグレード Lv → 次レベル購入コスト
 * Lv0→1=80, Lv50≈920, Lv99≈10300（合計約20万Gで完凸） */
function statCost(currentLevel) {
  return Math.floor(80 * Math.pow(1.05, currentLevel));
}

const STAT_DEFS = [
  { key: 'hp',  icon: '❤️', name: '最大HP強化',   desc: '最大HPを上昇' },
  { key: 'atk', icon: '⚔️', name: '攻撃力強化',   desc: '攻撃力を上昇' },
  { key: 'def', icon: '🛡️', name: '防御力強化',   desc: '防御力を上昇' },
];

export class UpgradeShopScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'shop-screen';
  }

  _renderStatCard(def) {
    const lv = Progression.getStatLevel(def.key);
    const max = Progression.STAT_MAX_LEVEL;
    const maxedOut = lv >= max;
    const cost = maxedOut ? 0 : statCost(lv);
    const canAfford = this.inventory.gold >= cost;
    // DEF は数値加算、HP/ATK は% 表記
    const suffix = def.key === 'def' ? '' : '%';
    const currentStr = `+${lv}${suffix}`;
    const nextStr = `+${lv + 1}${suffix}`;
    return `
      <div class="shop-card upgrade-card stat-upgrade ${maxedOut ? 'owned' : ''} ${!canAfford && !maxedOut ? 'expensive' : ''}">
        <div class="shop-card-header">
          <span class="shop-card-name">${def.icon} ${def.name} Lv.${lv} / ${max}</span>
          ${maxedOut ? '<span class="shop-card-badge">最大</span>' : ''}
        </div>
        <div class="shop-card-body">
          <p class="shop-card-desc">
            ${def.desc}<br>
            現在: <b>${currentStr}</b>
            ${maxedOut ? '' : ` → <b style="color:#8f8">${nextStr}</b>`}
          </p>
          <div class="shop-level-bar">
            <div class="shop-level-fill" style="width: ${fmt1(lv / max * 100)}%"></div>
          </div>
        </div>
        ${maxedOut ? '' : `<button class="shop-buy-btn" data-stat="${def.key}" ${canAfford ? '' : 'disabled'}>
          ${cost}G で Lv.${lv + 1} に強化
        </button>`}
      </div>
    `;
  }

  render() {
    this._renderContent();
    // 初回のみ DOM ツリーに追加。以降 _renderContent は innerHTML のみ更新し、
    // 親要素のスクロール位置を保持する。
    if (this.el.parentNode !== this.container) {
      this.container.appendChild(this.el);
    }
    return this.el;
  }

  _renderContent() {
    const whLv = Progression.getWarehouseLevel();
    const whMax = GameConfig.warehouseMaxLevel;
    const whPer = GameConfig.warehouseExpansionPerLevel;
    const whMaxedOut = whLv >= whMax;
    const whCost = whMaxedOut ? 0 : warehouseCost(whLv);
    const whCanAfford = this.inventory.gold >= whCost;
    const currentCapacity = this.inventory.maxCapacity;
    const nextCapacity = currentCapacity + whPer;

    this.el.innerHTML = `
      <div class="shop-layout">
        <div class="shop-header">
          <h3>アップグレードショップ</h3>
          <span class="shop-gold">💰 ${this.inventory.gold}G</span>
        </div>
        <div class="shop-grid">
          <div class="shop-card upgrade-card wh-expansion ${whMaxedOut ? 'owned' : ''} ${!whCanAfford && !whMaxedOut ? 'expensive' : ''}">
            <div class="shop-card-header">
              <span class="shop-card-name">📦 倉庫拡張 Lv.${whLv} / ${whMax}</span>
              ${whMaxedOut ? '<span class="shop-card-badge">最大</span>' : ''}
            </div>
            <div class="shop-card-body">
              <p class="shop-card-desc">
                1レベルにつき容量 +${whPer}<br>
                現在: <b>${currentCapacity}</b> 枠
                ${whMaxedOut ? '' : ` → <b style="color:#8f8">${nextCapacity}</b> 枠`}
              </p>
              <div class="shop-level-bar">
                <div class="shop-level-fill" style="width: ${fmt1(whLv / whMax * 100)}%"></div>
              </div>
            </div>
            ${whMaxedOut ? '' : `<button class="shop-buy-btn" data-upg="warehouse" ${whCanAfford ? '' : 'disabled'}>
              ${whCost}G で Lv.${whLv + 1} に強化
            </button>`}
          </div>
          ${STAT_DEFS.map(def => this._renderStatCard(def)).join('')}
        </div>
      </div>
    `;

    const whBtn = this.el.querySelector('[data-upg="warehouse"]');
    if (whBtn && !whBtn.disabled) {
      whBtn.addEventListener('click', () => this._purchaseWarehouse());
    }

    for (const btn of this.el.querySelectorAll('[data-stat]')) {
      if (btn.disabled) continue;
      const stat = btn.dataset.stat;
      btn.addEventListener('click', () => this._purchaseStat(stat));
    }
  }

  _purchaseWarehouse() {
    const lv = Progression.getWarehouseLevel();
    if (lv >= GameConfig.warehouseMaxLevel) return;
    const cost = warehouseCost(lv);
    if (!this.inventory.spendGold(cost)) return;
    this.inventory.expandCapacity(GameConfig.warehouseExpansionPerLevel);
    eventBus.emit('gold:changed', { gold: this.inventory.gold });
    eventBus.emit('save:request');
    this._renderContent();
  }

  _purchaseStat(stat) {
    const lv = Progression.getStatLevel(stat);
    if (lv >= Progression.STAT_MAX_LEVEL) return;
    const cost = statCost(lv);
    if (!this.inventory.spendGold(cost)) return;
    Progression.incrementStatLevel(stat);
    eventBus.emit('gold:changed', { gold: this.inventory.gold });
    eventBus.emit('save:request');
    eventBus.emit('toast', { message: `🎉 ${stat.toUpperCase()} 強化 Lv.${Progression.getStatLevel(stat)}！`, type: 'success' });
    this._renderContent();
  }

  destroy() {
    this.el.remove();
  }
}
