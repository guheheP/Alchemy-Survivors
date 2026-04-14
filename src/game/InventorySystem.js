/**
 * InventorySystem — 所持品（アイテム＆ゴールド）の管理
 * 倉庫容量制限付き
 *
 * パフォーマンス: UID / blueprintId / category / type の 4 種セカンダリインデックスを
 * 維持し、ルックアップ系メソッドを O(1)〜O(k) で返せるようにしている。
 * ルックアップが O(n) になるのは（この実装では）`items` 配列のフル走査だけ。
 */
import { createItemInstance } from './ItemSystem.js';
import { ItemBlueprints } from './data/items.js';
import { GameConfig } from './data/config.js';
import { Progression } from './data/progression.js';
import { eventBus } from './core/EventBus.js';

export class InventorySystem {
  constructor() {
    this.items = [];
    this.gold = GameConfig.initialGold;
    // 容量は Progression.warehouseLevel から派生（初期容量 + Lv * perLevel）
    this._batchMode = false;
    this._batchDirty = false;

    /** 自動ロック対象の特性名セット */
    this.autoLockTraits = new Set();

    // セカンダリインデックス（派生データ、セーブ対象外）
    this._byUid = new Map();            // uid → item
    this._byBlueprint = new Map();      // blueprintId → Set<item>
    this._byCategory = new Map();       // categoryId → Set<item>
    this._byType = new Map();           // type → Set<item>

    // 初期アイテムの生成
    for (const def of GameConfig.initialItems) {
      const inst = createItemInstance(def.blueprintId, def.quality, def.traits);
      this.items.push(inst);
      this._addToIndexes(inst);
    }
  }

  /** 現在の最大容量（倉庫拡張レベルから派生） */
  get maxCapacity() {
    return GameConfig.initialInventoryCapacity + Progression.getWarehouseLevel() * GameConfig.warehouseExpansionPerLevel;
  }

  get isFull() {
    return this.items.length >= this.maxCapacity;
  }

  get freeSlots() {
    return Math.max(0, this.maxCapacity - this.items.length);
  }

  addGold(amount) {
    this.gold += amount;
    eventBus.emit('gold:changed', { gold: this.gold });
  }

  spendGold(amount) {
    if (this.gold >= amount) {
      this.gold -= amount;
      eventBus.emit('gold:changed', { gold: this.gold });
      return true;
    }
    return false;
  }

  addItem(itemInstance) {
    if (this.isFull) {
      // トーストスパム防止（5秒間隔）
      const now = Date.now();
      if (!this._lastFullToast || now - this._lastFullToast > 5000) {
        eventBus.emit('toast', { message: '⚠️ 倉庫がいっぱいです！素材を整理しましょう', type: 'warning' });
        this._lastFullToast = now;
      }
      return false;
    }
    this._applyAutoLock(itemInstance);
    this.items.push(itemInstance);
    this._addToIndexes(itemInstance);
    if (this._batchMode) { this._batchDirty = true; } else { eventBus.emit('inventory:changed'); }
    return true;
  }

  /** 容量無視でアイテム追加（探索報酬等、確実に追加したい場合） */
  forceAddItem(itemInstance) {
    this._applyAutoLock(itemInstance);
    this.items.push(itemInstance);
    this._addToIndexes(itemInstance);
    if (this._batchMode) { this._batchDirty = true; } else { eventBus.emit('inventory:changed'); }
  }

  /** バッチモード開始 — inventory:changed イベント発火を抑制 */
  beginBatch() { this._batchMode = true; this._batchDirty = false; }
  /** バッチモード終了 — 変更があった場合のみ1回イベント発火 */
  endBatch() {
    this._batchMode = false;
    if (this._batchDirty) {
      this._batchDirty = false;
      eventBus.emit('inventory:changed');
    }
  }

  /** バッチモード中かどうかを返す（ネスト防止用） */
  get isBatching() { return this._batchMode; }

  /** 自動ロック判定 — アイテムの特性が autoLockTraits に含まれていればロック */
  _applyAutoLock(item) {
    if (this.autoLockTraits.size === 0) return;
    if (item.traits && item.traits.some(t => this.autoLockTraits.has(t))) {
      item.locked = true;
    }
  }

  /** 自動ロック特性のトグル */
  toggleAutoLockTrait(traitName) {
    if (this.autoLockTraits.has(traitName)) {
      this.autoLockTraits.delete(traitName);
      return false;
    } else {
      this.autoLockTraits.add(traitName);
      return true;
    }
  }

  removeItem(uid, force = false) {
    const item = this._byUid.get(uid);
    if (!item) return null;
    // ロック済みアイテムは force=true でない限り削除不可
    if (item.locked && !force) return null;

    // items 配列から削除（swap-pop で O(1)）
    const lastIdx = this.items.length - 1;
    const idx = this.items.indexOf(item);
    if (idx !== -1) {
      if (idx !== lastIdx) {
        this.items[idx] = this.items[lastIdx];
      }
      this.items.pop();
    }
    this._removeFromIndexes(item);
    return item;
  }

  /** アイテムのロック状態を切り替え */
  toggleLock(uid) {
    const item = this._byUid.get(uid);
    if (item) {
      item.locked = !item.locked;
      eventBus.emit('inventory:changed');
      return item.locked;
    }
    return false;
  }

  /** UID からアイテムを直接取得 (O(1)) */
  getItemByUid(uid) {
    return this._byUid.get(uid) || null;
  }

  /** ロックされていないアイテムのみを返す */
  getUnlockedItems() {
    return this.items.filter(i => !i.locked);
  }

  getItems() {
    return this.items;
  }

  getItemsByBlueprint(blueprintId) {
    const set = this._byBlueprint.get(blueprintId);
    return set ? Array.from(set) : [];
  }

  /** カテゴリに属するアイテムを返す */
  getItemsByCategory(categoryId) {
    const set = this._byCategory.get(categoryId);
    return set ? Array.from(set) : [];
  }

  /** タイプ別アイテムを返す ('material' | 'equipment' | 'consumable' | 'accessory') */
  getItemsByType(type) {
    const set = this._byType.get(type);
    return set ? Array.from(set) : [];
  }

  /** セーブロード後にインデックスを再構築する（main.js の _applySaveData 用） */
  rebuildIndexes() {
    this._byUid.clear();
    this._byBlueprint.clear();
    this._byCategory.clear();
    this._byType.clear();
    for (const item of this.items) {
      this._addToIndexes(item);
    }
  }

  /** 容量拡張 (アップグレード購入時) — 倉庫Lvを+1し、容量は getter で派生 */
  expandCapacity(_amount) {
    Progression.incrementWarehouseLevel();
    const per = GameConfig.warehouseExpansionPerLevel;
    eventBus.emit('toast', { message: `📦 倉庫容量が ${per} 増えました！（${this.maxCapacity}枠）`, type: 'success' });
    eventBus.emit('capacity:changed', { maxCapacity: this.maxCapacity });
  }

  /** 一括売却 — 売却可能なUIDリストを受け取り、合計goldを返す */
  sellItems(uids, priceFor) {
    let total = 0;
    let sold = 0;
    this.beginBatch();
    try {
      for (const uid of uids) {
        const item = this._byUid.get(uid);
        if (!item || item.locked) continue;
        const price = priceFor ? priceFor(item) : 0;
        const removed = this.removeItem(uid, false);
        if (removed) {
          total += price;
          sold++;
        }
      }
    } finally {
      this.endBatch();
    }
    if (sold > 0) {
      this.addGold(total);
      eventBus.emit('inventory:uidsRemoved', { uids });
      eventBus.emit('inventory:changed');
    }
    return { total, sold };
  }

  // ── インデックス管理 (private) ──

  _addToIndexes(item) {
    if (!item || !item.uid) return;
    this._byUid.set(item.uid, item);

    let set = this._byBlueprint.get(item.blueprintId);
    if (!set) { set = new Set(); this._byBlueprint.set(item.blueprintId, set); }
    set.add(item);

    const bp = ItemBlueprints[item.blueprintId];
    if (bp?.category) {
      let cset = this._byCategory.get(bp.category);
      if (!cset) { cset = new Set(); this._byCategory.set(bp.category, cset); }
      cset.add(item);
    }

    if (item.type) {
      let tset = this._byType.get(item.type);
      if (!tset) { tset = new Set(); this._byType.set(item.type, tset); }
      tset.add(item);
    }
  }

  _removeFromIndexes(item) {
    if (!item || !item.uid) return;
    this._byUid.delete(item.uid);

    const bset = this._byBlueprint.get(item.blueprintId);
    if (bset) {
      bset.delete(item);
      if (bset.size === 0) this._byBlueprint.delete(item.blueprintId);
    }

    const bp = ItemBlueprints[item.blueprintId];
    if (bp?.category) {
      const cset = this._byCategory.get(bp.category);
      if (cset) {
        cset.delete(item);
        if (cset.size === 0) this._byCategory.delete(bp.category);
      }
    }

    if (item.type) {
      const tset = this._byType.get(item.type);
      if (tset) {
        tset.delete(item);
        if (tset.size === 0) this._byType.delete(item.type);
      }
    }
  }
}
