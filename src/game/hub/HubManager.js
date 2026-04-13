/**
 * HubManager — 拠点画面のシーン管理
 * Phase 2: マルチ武器スロット対応
 */

import { CraftingScreen } from './CraftingScreen.js';
import { EquipmentScreen } from './EquipmentScreen.js';
import { RunPrepScreen } from './RunPrepScreen.js';
import { eventBus } from '../core/EventBus.js';

export class HubManager {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.id = 'hub-screen';
    this.activeTab = 'craft';
    this.screens = {};

    // 4武器スロット
    this.weaponSlots = [null, null, null, null];

    this._unsubEquip = eventBus.on('equipment:changed', ({ weaponSlots }) => {
      this.weaponSlots = [...weaponSlots];
    });

    this._unsubInventory = eventBus.on('inventory:changed', () => {
      this._updateHeader();
    });
  }

  render() {
    this.el.innerHTML = `
      <div class="hub-header">
        <h2>拠点</h2>
        <div class="hub-gold" id="hub-item-count">素材: ${this.inventory.items.length} / ${this.inventory.maxCapacity}</div>
      </div>
      <div class="hub-tabs">
        <button class="hub-tab ${this.activeTab === 'craft' ? 'active' : ''}" data-tab="craft">🔮 錬金工房</button>
        <button class="hub-tab ${this.activeTab === 'equip' ? 'active' : ''}" data-tab="equip">⚔️ 装備</button>
        <button class="hub-tab ${this.activeTab === 'prep' ? 'active' : ''}" data-tab="prep">🚀 出撃準備</button>
      </div>
      <div class="hub-content" id="hub-content"></div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.hub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.el.querySelectorAll('.hub-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderContent();
      });
    });

    this._renderContent();
    return this.el;
  }

  _renderContent() {
    const content = this.el.querySelector('#hub-content');
    content.innerHTML = '';

    if (this.screens[this.activeTab]?.destroy) {
      this.screens[this.activeTab].destroy();
    }

    switch (this.activeTab) {
      case 'craft': {
        const screen = new CraftingScreen(content, this.inventory);
        screen.render();
        this.screens.craft = screen;
        break;
      }
      case 'equip': {
        const screen = new EquipmentScreen(content, this.inventory);
        screen.weaponSlots = [...this.weaponSlots];
        screen.render();
        this.screens.equip = screen;
        break;
      }
      case 'prep': {
        const screen = new RunPrepScreen(content, () => this.weaponSlots);
        screen.render();
        this.screens.prep = screen;
        break;
      }
    }
  }

  _updateHeader() {
    const el = this.el.querySelector('#hub-item-count');
    if (el) el.textContent = `素材: ${this.inventory.items.length} / ${this.inventory.maxCapacity}`;
  }

  refresh() {
    this._renderContent();
    this._updateHeader();
  }

  destroy() {
    this._unsubEquip();
    this._unsubInventory();
    for (const screen of Object.values(this.screens)) {
      if (screen?.destroy) screen.destroy();
    }
    this.el.remove();
  }
}
