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
import { CASINO_ENABLED, isCasinoVisible, CasinoManager } from '../casino/index.js';
import { spawnAtelierMotes } from '../ui/UIHelpers.js';

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

    // 4武器スロット + 防具 + アクセサリ + ペット
    this.weaponSlots = [null, null, null, null];
    this.equippedArmor = null;
    this.equippedAccessory = null;
    /** @type {Map<string,{exp:number,level:number}>} */
    this.ownedPets = new Map();
    /** @type {string|null} */
    this.equippedPetId = null;
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
      // カジノタブ（ショップの隣）。isCasinoVisible() が true のときのみ表示
      ...(isCasinoVisible() ? [{ id: 'casino', icon: '🎰', label: '賭博場', short: '賭博' }] : []),
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
      <div class="atelier-motes" id="hub-motes" aria-hidden="true"></div>
      <div class="hub-header atelier-hub-header">
        <div class="atelier-signboard hub-signboard">
          <div class="atelier-eyebrow">— ATELIER · ALCHEMY SURVIVORS ·</div>
          <h2 class="atelier-title">
            <span class="atelier-alch-glyph" aria-hidden="true"></span>拠 点<span class="atelier-alch-glyph" aria-hidden="true"></span>
          </h2>
        </div>
        <div class="hub-info atelier-hub-info">
          <span id="hub-gold" class="hub-info-item atelier-brass-badge" data-tooltip="所持ゴールド"><span class="atelier-ico">💰</span>${this.inventory.gold}G</span>
          <span id="hub-item-count" class="hub-info-item atelier-brass-badge" data-tooltip="倉庫の使用/最大"><span class="atelier-ico">📦</span>${this.inventory.items.length} / ${this.inventory.maxCapacity}</span>
        </div>
      </div>
      <div class="hub-tabs" role="tablist" aria-label="拠点メニュー">
        ${tabButtons}
      </div>
      <div class="hub-content" id="hub-content" role="tabpanel"></div>
    `;
    this.container.appendChild(this.el);

    spawnAtelierMotes(this.el.querySelector('#hub-motes'), 22);

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

    // 切替前に既存スクリーンを全て破棄（eventBus 購読の蓄積を防ぐ）
    for (const [tabId, screen] of Object.entries(this.screens)) {
      if (screen?.destroy) {
        try { screen.destroy(); } catch (e) { console.error(`[HubManager] destroy failed for ${tabId}`, e); }
      }
    }
    this.screens = {};
    content.innerHTML = '';

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
        screen.presetsManager = this.presetsManager;
        screen.ownedPets = this.ownedPets || new Map();
        screen.equippedPetId = this.equippedPetId || null;
        screen.render();
        this.screens.equip = screen;
        break;
      }
      case 'prep': {
        const screen = new RunPrepScreen(content, () => this.weaponSlots, () => this.equippedArmor, () => this.equippedAccessory, this.inventory, this.savedConsumableUids, this.lastSelectedAreaId);
        screen.presetsManager = this.presetsManager;
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
      case 'casino': {
        if (CASINO_ENABLED) {
          // 疎結合: CasinoManager 自身が画面のライフサイクルを管理する
          CasinoManager.getInstance().mountLobby(content, this.inventory);
          // destroy 呼び出し用にダミー登録（次タブ遷移時に既存 screen.destroy が呼ばれる）
          this.screens.casino = { destroy: () => CasinoManager.getInstance().screen?.destroy() };
        }
        break;
      }
      case 'collection': {
        const screen = new CollectionScreen(content, this.inventory);
        screen.ownedPets = this.ownedPets || new Map();
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

    // Phase D: wrap non-craft/non-casino screens in an atelier parchment frame
    this._applyAtelierHostWrap(content);
  }

  /**
   * Wrap the rendered screen's root element in an `.atl-screen-host` frame
   * with four corner ornaments. Idempotent. Skips tabs that provide their own
   * parchment layout (craft) or have a non-standard mount path (casino).
   * @param {HTMLElement} content - the hub-content element
   */
  _applyAtelierHostWrap(content) {
    if (this.activeTab === 'craft') return;  // Has own 3-panel parchment
    if (this.activeTab === 'casino') return; // Casino mounts via mountLobby
    const root = content.firstElementChild;
    if (!root) return;
    if (root.classList.contains('atl-screen-host')) return; // Already wrapped
    if (root.classList.contains('atl-craft-screen')) return; // Defensive

    const wrapper = document.createElement('div');
    wrapper.className = 'atl-screen-host';
    wrapper.innerHTML =
      '<span class="atelier-corner tl"></span>' +
      '<span class="atelier-corner tr"></span>' +
      '<span class="atelier-corner bl"></span>' +
      '<span class="atelier-corner br"></span>';
    content.replaceChild(wrapper, root);
    wrapper.appendChild(root);
  }

  _updateHeader() {
    const countEl = this.el.querySelector('#hub-item-count');
    if (countEl) countEl.innerHTML = `<span class="atelier-ico">📦</span>${this.inventory.items.length} / ${this.inventory.maxCapacity}`;
    const goldEl = this.el.querySelector('#hub-gold');
    if (goldEl) goldEl.innerHTML = `<span class="atelier-ico">💰</span>${this.inventory.gold}G`;
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
