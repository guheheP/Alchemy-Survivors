/**
 * SaveSystem — Alchemy Survivors用セーブシステム
 * - ローカル: localStorage（常に真実のソース）
 * - クラウド: Azure PlayFab UserData（デバイス間共有用）
 * タイムスタンプで新しい方を採用し、競合時は旧データをバックアップ保存
 */

import { createItemInstance } from '../ItemSystem.js';
import { Recipes } from '../data/items.js';
import { AreaDefs } from '../data/areas.js';
import { Progression } from '../data/progression.js';
import { PlayFabClient } from './PlayFabClient.js';

const SAVE_KEY = 'alchemy_survivors_save_v1';
const BACKUP_KEY_PREFIX = 'alchemy_survivors_save_backup_';
const CLOUD_USER_DATA_KEY = 'save';
const CLOUD_SAVE_DEBOUNCE_MS = 5000;
const SAVE_VERSION = 3;

const DEFAULT_STATS = {
  totalRuns: 0,
  totalKills: 0,
  bestSurvivalTime: 0,
  totalMaterialsCollected: 0,
  totalGoldEarned: 0,
  totalBossesDefeated: 0,
  totalDeaths: 0,
  totalSurvivals: 0,
  totalCrafted: 0,
  totalPlayTime: 0,
  highestLevel: 0,
  highestDamageDealt: 0,
  perArea: {},
  perWeaponType: {},
  hardModeClears: 0,
  firstPlayDate: null,
};

export class SaveSystem {
  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this._cloudSaveTimer = null;
    this._pendingCloudPayload = null;
    this._cloudSyncListener = null; // (event: 'pushed'|'pushing'|'error'|'pulled', detail) => void
  }

  /** 同期ステータスをUIに伝えるためのコールバック登録 */
  setCloudSyncListener(fn) {
    this._cloudSyncListener = typeof fn === 'function' ? fn : null;
  }

  _emitCloudSync(event, detail) {
    if (this._cloudSyncListener) {
      try { this._cloudSyncListener(event, detail); } catch (e) { /* listener error は無視 */ }
    }
  }

  save(extraData = {}) {
    const payload = this._buildPayload(extraData);
    const ok = this._writeLocal(payload);
    if (ok) this._scheduleCloudPush(payload);
    return ok;
  }

  /** 保存用オブジェクトを構築（ローカル/クラウド共通） */
  _buildPayload(extraData = {}) {
    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      gold: this.inventory.gold,
      maxCapacity: this.inventory.maxCapacity,
      items: this.inventory.items.map(item => ({
        uid: item.uid,
        blueprintId: item.blueprintId,
        quality: item.quality,
        traits: [...item.traits],
        locked: item.locked || false,
      })),
      equippedWeaponUids: extraData.equippedWeaponUids || [null, null, null, null],
      equippedArmorUid: extraData.equippedArmorUid || null,
      equippedAccessoryUid: extraData.equippedAccessoryUid || null,
      savedConsumableUids: extraData.savedConsumableUids || [],
      unlockedRecipes: Object.entries(Recipes)
        .filter(([, r]) => r.unlocked)
        .map(([id]) => id),
      unlockedAreas: Object.entries(AreaDefs)
        .filter(([, a]) => a.unlocked)
        .map(([id]) => id),
      defeatedBosses: Progression.getDefeatedBosses(),
      purchasedUpgrades: Progression.getPurchasedUpgrades ? [...Progression.getPurchasedUpgrades()] : [],
      warehouseLevel: Progression.getWarehouseLevel ? Progression.getWarehouseLevel() : 0,
      statLevels: Progression.getStatLevels ? Progression.getStatLevels() : { hp: 0, atk: 0, def: 0 },
      stats: extraData.stats || { ...DEFAULT_STATS },
      achievements: extraData.achievements || [],
      hardModeUnlocked: extraData.hardModeUnlocked || [],
      tutorialCompleted: extraData.tutorialCompleted || false,
    };
  }

  _writeLocal(payload) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('[SaveSystem] Local save failed:', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[SaveSystem] Load failed:', e);
      return null;
    }
  }

  /**
   * クラウドから生のセーブ JSON を取得
   * @returns {Promise<object|null>}
   */
  async loadFromCloud() {
    if (!PlayFabClient.isAvailable()) return null;
    try {
      const res = await PlayFabClient.getUserData([CLOUD_USER_DATA_KEY]);
      const entry = res?.Data?.[CLOUD_USER_DATA_KEY];
      if (!entry || !entry.Value) return null;
      return JSON.parse(entry.Value);
    } catch (e) {
      console.warn('[SaveSystem] Cloud load failed:', e.message || e);
      this._emitCloudSync('error', { phase: 'pull', message: e.message });
      return null;
    }
  }

  /**
   * 起動時の同期: ローカル/クラウドから新しい方を採用
   * @returns {Promise<{ data: object|null, source: 'local'|'cloud'|'none', conflict: boolean }>}
   */
  async syncOnBoot() {
    const local = this.load();
    if (!PlayFabClient.isAvailable()) {
      return { data: local, source: local ? 'local' : 'none', conflict: false };
    }

    let cloud = null;
    try {
      // PlayFab 未ログインなら先にログイン
      await PlayFabClient.ensureLoggedIn();
      cloud = await this.loadFromCloud();
      this._emitCloudSync('pulled', { hasCloud: !!cloud });
    } catch (e) {
      console.warn('[SaveSystem] Cloud sync (login/pull) failed:', e.message || e);
      this._emitCloudSync('error', { phase: 'login', message: e.message });
      return { data: local, source: local ? 'local' : 'none', conflict: false };
    }

    if (!local && !cloud) return { data: null, source: 'none', conflict: false };
    if (!local) return { data: cloud, source: 'cloud', conflict: false };
    if (!cloud) return { data: local, source: 'local', conflict: false };

    const localTs = local.timestamp || 0;
    const cloudTs = cloud.timestamp || 0;
    // 同一タイムスタンプなら競合なし
    if (localTs === cloudTs) {
      return { data: local, source: 'local', conflict: false };
    }

    // 競合: 片方を採用、もう片方をバックアップ保存
    const useCloud = cloudTs > localTs;
    const chosen = useCloud ? cloud : local;
    const discarded = useCloud ? local : cloud;
    try {
      const backupKey = `${BACKUP_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(backupKey, JSON.stringify(discarded));
    } catch (e) { /* ignore quota */ }
    return { data: chosen, source: useCloud ? 'cloud' : 'local', conflict: true };
  }

  /**
   * デバウンスつきクラウドプッシュ予約
   */
  _scheduleCloudPush(payload) {
    if (!PlayFabClient.isAvailable()) return;
    this._pendingCloudPayload = payload;
    if (this._cloudSaveTimer) clearTimeout(this._cloudSaveTimer);
    this._cloudSaveTimer = setTimeout(() => this._flushCloudPush(), CLOUD_SAVE_DEBOUNCE_MS);
  }

  /** 予約中のプッシュを即座に実行（終了時等に使用） */
  async flushCloudSaveNow() {
    if (this._cloudSaveTimer) {
      clearTimeout(this._cloudSaveTimer);
      this._cloudSaveTimer = null;
    }
    return this._flushCloudPush();
  }

  async _flushCloudPush() {
    const payload = this._pendingCloudPayload;
    this._pendingCloudPayload = null;
    this._cloudSaveTimer = null;
    if (!payload || !PlayFabClient.isAvailable()) return false;
    this._emitCloudSync('pushing', null);
    try {
      await PlayFabClient.updateUserData({ [CLOUD_USER_DATA_KEY]: JSON.stringify(payload) });
      this._emitCloudSync('pushed', { timestamp: payload.timestamp });
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Cloud push failed:', e.message || e);
      this._emitCloudSync('error', { phase: 'push', message: e.message });
      // 次回 save 時にリトライされるので pendingPayload を戻しておく
      if (!this._pendingCloudPayload) this._pendingCloudPayload = payload;
      return false;
    }
  }

  /** v1/v2 → 最新バージョンへのマイグレーション */
  static _migrate(data) {
    if (!data) return null;
    if (data.version === 1) {
      data.version = 2;
      data.stats = { ...DEFAULT_STATS, ...(data.stats || {}) };
      data.achievements = [];
      data.hardModeUnlocked = [];
      data.tutorialCompleted = false;
    }
    if (data.version === 2) {
      // v2→v3: フィールド追加無し。クラウド同期対応のためのバージョンバンプ。
      data.version = 3;
    }
    return data;
  }

  applySaveData(data) {
    if (!data) return false;
    // マイグレーション適用
    data = SaveSystem._migrate(data);
    if (!data || data.version !== SAVE_VERSION) return false;

    // インベントリ復元
    this.inventory.items.length = 0;
    this.inventory.gold = data.gold || 0;
    // maxCapacity は Progression.warehouseLevel から派生（getter）。data.maxCapacity は無視。

    for (const itemData of data.items) {
      const item = createItemInstance(itemData.blueprintId, itemData.quality, itemData.traits);
      if (itemData.uid) item.uid = itemData.uid;
      if (itemData.locked) item.locked = true;
      this.inventory.items.push(item);
    }
    this.inventory.rebuildIndexes();

    // レシピ解放
    for (const [id, recipe] of Object.entries(Recipes)) {
      recipe.unlocked = (data.unlockedRecipes || []).includes(id);
    }

    // エリア解放
    for (const [id, area] of Object.entries(AreaDefs)) {
      area.unlocked = (data.unlockedAreas || []).includes(id);
    }

    // 撃破ボス復元
    Progression.loadDefeatedBosses(data.defeatedBosses || []);

    // アップグレード復元
    if (Progression.loadPurchasedUpgrades) {
      Progression.loadPurchasedUpgrades(data.purchasedUpgrades || []);
    }

    // 永続ステータスアップグレード復元
    if (Progression.loadStatLevels) {
      Progression.loadStatLevels(data.statLevels || { hp: 0, atk: 0, def: 0 });
    }

    // 倉庫拡張レベル復元 + 旧capacity_1/2/3からのマイグレーション
    Progression.setWarehouseLevel(data.warehouseLevel || 0);
    if (Progression.migrateLegacyCapacityUpgrades) {
      const migrated = Progression.migrateLegacyCapacityUpgrades();
      if (migrated > 0 && !data.warehouseLevel) {
        // 旧セーブからの初回マイグレーション: +maxCapacity を保持しておきたいので保存データ側にも反映
        data.warehouseLevel = Progression.getWarehouseLevel();
      }
    }

    // 装備復元（UID → アイテム参照の再構築）
    const restoredEquipment = { weaponSlots: [null, null, null, null], armor: null, accessory: null };
    if (data.equippedWeaponUids) {
      for (let i = 0; i < Math.min(data.equippedWeaponUids.length, 4); i++) {
        const uid = data.equippedWeaponUids[i];
        if (uid) {
          const item = this.inventory.getItemByUid(uid);
          restoredEquipment.weaponSlots[i] = item || null;
        }
      }
    }
    if (data.equippedArmorUid) {
      restoredEquipment.armor = this.inventory.getItemByUid(data.equippedArmorUid) || null;
    }
    if (data.equippedAccessoryUid) {
      restoredEquipment.accessory = this.inventory.getItemByUid(data.equippedAccessoryUid) || null;
    }

    // stats のフィールド補完（新規追加分のデフォルト値を確保）
    data.stats = { ...DEFAULT_STATS, ...(data.stats || {}) };

    return { ...data, restoredEquipment };
  }

  static hasSaveData() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }
}
