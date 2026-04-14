/**
 * HubManager — 拠点画面のシーン管理
 * Phase 2: マルチ武器スロット対応
 */

import { CraftingScreen } from './CraftingScreen.js';
import { EquipmentScreen } from './EquipmentScreen.js';
import { RunPrepScreen } from './RunPrepScreen.js';
import { WarehouseScreen } from './WarehouseScreen.js';
import { UpgradeShopScreen } from './UpgradeShopScreen.js';
import { CollectionScreen } from './CollectionScreen.js';
import { StatsScreen } from './StatsScreen.js';
import { AchievementScreen } from './AchievementScreen.js';
import { SettingsScreen } from './SettingsScreen.js';
import { eventBus } from '../core/EventBus.js';

export class HubManager {
  constructor(container, inventorySystem, stats = null, achievementSystem = null) {
    this.container = container;
    this.inventory = inventorySystem;
    this.stats = stats;
    this.achievementSystem = achievementSystem;
    this.el = document.createElement('div');
    this.el.id = 'hub-screen';
    this.activeTab = 'craft';
    this.screens = {};

    // 4武器スロット + 防具 + アクセサリ
    this.weaponSlots = [null, null, null, null];
    this.equippedArmor = null;
    this.equippedAccessory = null;

    this._unsubEquip = eventBus.on('equipment:changed', ({ weaponSlots, armor, accessory }) => {
      this.weaponSlots = [...weaponSlots];
      this.equippedArmor = armor;
      this.equippedAccessory = accessory;
    });

    this._unsubInventory = eventBus.on('inventory:changed', () => {
      this._updateHeader();
    });
    // ゴールド・容量変動でもヘッダー更新
    this._unsubGold = eventBus.on('gold:changed', () => this._updateHeader());
    this._unsubCapacity = eventBus.on('capacity:changed', () => this._updateHeader());
  }

  render() {
    this.el.innerHTML = `
      <div class="hub-header">
        <h2>拠点</h2>
        <div class="hub-info">
          <span id="hub-gold">💰 ${this.inventory.gold}G</span>
          <span id="hub-item-count">📦 ${this.inventory.items.length} / ${this.inventory.maxCapacity}</span>
        </div>
      </div>
      <div class="hub-tabs">
        <button class="hub-tab ${this.activeTab === 'craft' ? 'active' : ''}" data-tab="craft">🔮 錬金工房</button>
        <button class="hub-tab ${this.activeTab === 'equip' ? 'active' : ''}" data-tab="equip">⚔️ 装備</button>
        <button class="hub-tab ${this.activeTab === 'prep' ? 'active' : ''}" data-tab="prep">🚀 出撃準備</button>
        <button class="hub-tab ${this.activeTab === 'warehouse' ? 'active' : ''}" data-tab="warehouse">📦 倉庫</button>
        <button class="hub-tab ${this.activeTab === 'shop' ? 'active' : ''}" data-tab="shop">🏪 ショップ</button>
        <button class="hub-tab ${this.activeTab === 'collection' ? 'active' : ''}" data-tab="collection">📖 図鑑</button>
        <button class="hub-tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">📊 統計</button>
        <button class="hub-tab ${this.activeTab === 'achievements' ? 'active' : ''}" data-tab="achievements">🏅 実績</button>
        <button class="hub-tab ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙ 設定</button>
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
        screen.armorSlot = this.equippedArmor;
        screen.accessorySlot = this.equippedAccessory;
        screen.render();
        this.screens.equip = screen;
        break;
      }
      case 'prep': {
        const screen = new RunPrepScreen(content, () => this.weaponSlots, () => this.equippedArmor, () => this.equippedAccessory, this.inventory);
        screen.render();
        this.screens.prep = screen;
        break;
      }
      case 'warehouse': {
        const screen = new WarehouseScreen(content, this.inventory);
        screen.setEquippedUidsProvider(() => {
          const uids = new Set();
          for (const w of (this.weaponSlots || [])) { if (w?.uid) uids.add(w.uid); }
          if (this.equippedArmor?.uid) uids.add(this.equippedArmor.uid);
          if (this.equippedAccessory?.uid) uids.add(this.equippedAccessory.uid);
          return uids;
        });
        screen.render();
        this.screens.warehouse = screen;
        break;
      }
      case 'shop': {
        const screen = new UpgradeShopScreen(content, this.inventory);
        screen.render();
        this.screens.shop = screen;
        break;
      }
      case 'collection': {
        const screen = new CollectionScreen(content, this.inventory);
        screen.render();
        this.screens.collection = screen;
        break;
      }
      case 'stats': {
        if (this.stats) {
          const screen = new StatsScreen(content, this.stats);
          screen.render();
          this.screens.stats = screen;
        }
        break;
      }
      case 'achievements': {
        if (this.achievementSystem) {
          const screen = new AchievementScreen(content, this.achievementSystem);
          screen.render();
          this.screens.achievements = screen;
        }
        break;
      }
      case 'settings': {
        const screen = new SettingsScreen(content);
        screen.render();
        this.screens.settings = screen;
        break;
      }
    }
  }

  _updateHeader() {
    const countEl = this.el.querySelector('#hub-item-count');
    if (countEl) countEl.textContent = `📦 ${this.inventory.items.length} / ${this.inventory.maxCapacity}`;
    const goldEl = this.el.querySelector('#hub-gold');
    if (goldEl) goldEl.textContent = `💰 ${this.inventory.gold}G`;
  }

  refresh() {
    this._renderContent();
    this._updateHeader();
  }

  destroy() {
    this._unsubEquip();
    this._unsubInventory();
    if (this._unsubGold) this._unsubGold();
    if (this._unsubCapacity) this._unsubCapacity();
    for (const screen of Object.values(this.screens)) {
      if (screen?.destroy) screen.destroy();
    }
    this.el.remove();
  }
}
