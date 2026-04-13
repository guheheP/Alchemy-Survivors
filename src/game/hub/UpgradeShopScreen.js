/**
 * UpgradeShopScreen -- アップグレードショップ（ゴールドで強化購入）
 */

import { eventBus } from '../core/EventBus.js';
import { Progression } from '../data/progression.js';

const UPGRADES = [
  {
    id: 'capacity_1', name: '倉庫拡張 I', description: '倉庫容量 +20', cost: 200,
    requires: null, effect: { type: 'capacity', value: 20 },
  },
  {
    id: 'capacity_2', name: '倉庫拡張 II', description: '倉庫容量 +30', cost: 500,
    requires: 'capacity_1', effect: { type: 'capacity', value: 30 },
  },
  {
    id: 'capacity_3', name: '倉庫拡張 III', description: '倉庫容量 +50', cost: 1200,
    requires: 'capacity_2', effect: { type: 'capacity', value: 50 },
  },
];

export class UpgradeShopScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'shop-screen';
  }

  render() {
    const purchased = Progression.getPurchasedUpgrades();

    this.el.innerHTML = `
      <div class="shop-layout">
        <div class="shop-header">
          <h3>アップグレードショップ</h3>
          <span class="shop-gold">💰 ${this.inventory.gold}G</span>
        </div>
        <div class="shop-grid">
          ${UPGRADES.map(upg => {
            const owned = purchased.has(upg.id);
            const locked = upg.requires && !purchased.has(upg.requires);
            const canAfford = this.inventory.gold >= upg.cost;
            const available = !owned && !locked && canAfford;

            return `<div class="shop-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''} ${!canAfford && !owned ? 'expensive' : ''}" data-id="${upg.id}">
              <div class="shop-card-header">
                <span class="shop-card-name">${upg.name}</span>
                ${owned ? '<span class="shop-card-badge">購入済</span>' : locked ? '<span class="shop-card-badge locked">🔒</span>' : ''}
              </div>
              <p class="shop-card-desc">${upg.description}</p>
              ${!owned ? `<button class="shop-buy-btn" data-id="${upg.id}" ${available ? '' : 'disabled'}>
                ${locked ? '前提未達成' : `${upg.cost}G で購入`}
              </button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.shop-buy-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => this._purchase(btn.dataset.id));
    });

    return this.el;
  }

  _purchase(upgradeId) {
    const upg = UPGRADES.find(u => u.id === upgradeId);
    if (!upg || !this.inventory.spendGold(upg.cost)) return;

    Progression.addPurchasedUpgrade(upgradeId);

    if (upg.effect.type === 'capacity') {
      this.inventory.expandCapacity(upg.effect.value);
    }

    eventBus.emit('toast', { message: `${upg.name} を購入しました！`, type: 'success' });
    eventBus.emit('gold:changed', { gold: this.inventory.gold });
    this.render();
  }

  destroy() {
    this.el.remove();
  }
}
