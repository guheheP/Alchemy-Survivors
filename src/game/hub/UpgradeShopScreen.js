/**
 * UpgradeShopScreen -- アップグレードショップ（ゴールドで強化購入）
 */

import { eventBus } from '../core/EventBus.js';
import { Progression } from '../data/progression.js';
import { GameConfig } from '../data/config.js';

/** 倉庫拡張 Lv → 次レベル購入コスト */
function warehouseCost(currentLevel) {
  // 累進式: Lv1=150, Lv5≈500, Lv10≈2800, Lv20≈55000
  return Math.floor(150 * Math.pow(1.35, currentLevel));
}

export class UpgradeShopScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'shop-screen';
  }

  render() {
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
                <div class="shop-level-fill" style="width: ${(whLv / whMax * 100).toFixed(1)}%"></div>
              </div>
            </div>
            ${whMaxedOut ? '' : `<button class="shop-buy-btn" data-upg="warehouse" ${whCanAfford ? '' : 'disabled'}>
              ${whCost}G で Lv.${whLv + 1} に強化
            </button>`}
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    const whBtn = this.el.querySelector('[data-upg="warehouse"]');
    if (whBtn && !whBtn.disabled) {
      whBtn.addEventListener('click', () => this._purchaseWarehouse());
    }

    return this.el;
  }

  _purchaseWarehouse() {
    const lv = Progression.getWarehouseLevel();
    if (lv >= GameConfig.warehouseMaxLevel) return;
    const cost = warehouseCost(lv);
    if (!this.inventory.spendGold(cost)) return;
    this.inventory.expandCapacity(GameConfig.warehouseExpansionPerLevel);
    eventBus.emit('gold:changed', { gold: this.inventory.gold });
    this.render();
  }

  destroy() {
    this.el.remove();
  }
}
