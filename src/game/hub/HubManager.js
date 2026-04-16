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
import { LeaderboardScreen } from './LeaderboardScreen.js';
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
    // 消耗品スロット（UIDで保持、Gameから注入）
    this.savedConsumableUids = [];
    // 前回選択したステージ（Gameから注入）
    this.lastSelectedAreaId = null;

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
    const tabs = [
      { id: 'craft',        icon: '🔮', label: '錬金工房', short: '工房' },
      { id: 'equip',        icon: '⚔️', label: '装備',     short: '装備' },
      { id: 'prep',         icon: '🚀', label: '出撃準備', short: '出撃' },
      { id: 'warehouse',    icon: '📦', label: '倉庫',     short: '倉庫' },
      { id: 'shop',         icon: '🏪', label: 'ショップ', short: '店' },
      { id: 'collection',   icon: '📖', label: '図鑑',     short: '図鑑' },
      { id: 'stats',        icon: '📊', label: '統計',     short: '統計' },
      { id: 'achievements', icon: '🏅', label: '実績',     short: '実績' },
      { id: 'ranking',      icon: '🏆', label: 'ランキング', short: '順位' },
      { id: 'settings',     icon: '⚙',  label: '設定',     short: '設定' },
    ];
    const tabButtons = tabs.map(t => `
      <button class="hub-tab ${this.activeTab === t.id ? 'active' : ''}"
              data-tab="${t.id}"
              role="tab"
              aria-selected="${this.activeTab === t.id}"
              aria-controls="hub-content"
              data-tooltip="${t.label}">
        <span class="hub-tab-icon" aria-hidden="true">${t.icon}</span>
        <span class="hub-tab-label">${t.label}</span>
        <span class="hub-tab-short" aria-hidden="true">${t.short}</span>
      </button>
    `).join('');

    this.el.innerHTML = `
      <div class="hub-header">
        <h2>拠点</h2>
        <div class="hub-info">
          <span id="hub-gold" class="hub-info-item" data-tooltip="所持ゴールド">💰 ${this.inventory.gold}G</span>
          <span id="hub-item-count" class="hub-info-item" data-tooltip="倉庫の使用/最大">📦 ${this.inventory.items.length} / ${this.inventory.maxCapacity}</span>
        </div>
      </div>
      <div class="hub-tabs" role="tablist" aria-label="拠点メニュー">
        ${tabButtons}
      </div>
      <div class="hub-content" id="hub-content" role="tabpanel"></div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.hub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (this.activeTab === tab.dataset.tab) return;
        this.activeTab = tab.dataset.tab;
        this.el.querySelectorAll('.hub-tab').forEach(t => {
          const isActive = t.dataset.tab === this.activeTab;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', String(isActive));
        });
        this._renderContent();
        // アクティブタブが画面外なら可視範囲へスクロール（モバイルの横スクロール対応）
        tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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
        const screen = new CraftingScreen(content, this.inventory, {
          getEquipment: () => ({
            weaponSlots: this.weaponSlots,
            armor: this.equippedArmor,
            accessory: this.equippedAccessory,
          }),
        });
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
        const screen = new RunPrepScreen(content, () => this.weaponSlots, () => this.equippedArmor, () => this.equippedAccessory, this.inventory, this.savedConsumableUids, this.lastSelectedAreaId);
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
      case 'ranking': {
        const screen = new LeaderboardScreen(content);
        screen.render();
        this.screens.ranking = screen;
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
