/**
 * SaveSystem — Alchemy Survivors用セーブシステム
 * - ローカル: localStorage（常に真実のソース）
 * - クラウド: Azure PlayFab UserData（デバイス間共有用）
 * タイムスタンプで新しい方を採用し、競合時は旧データをバックアップ保存
 *
 * データ消失防止機構:
 *  - 自分の SAVE_VERSION より新しい save を検知したら書込ロック（lockWrites）
 *  - cloud push 前に現 cloud を取得し、優先権がcloud側にあれば書込ロック
 *  - 毎 save() 前にlocalStorageへリングバッファでバックアップを退避（LOCAL_BACKUP_RING_SIZE 世代）
 *  - cloud push 時に現 cloud を save_previous へ退避（1世代）
 */

import { createItemInstance } from '../ItemSystem.js';
import { Recipes } from '../data/items.js';
import { AreaDefs } from '../data/areas.js';
import { Progression } from '../data/progression.js';
import { PlayFabClient } from './PlayFabClient.js';

const SAVE_KEY = 'alchemy_survivors_save_v1';
const BACKUP_KEY_PREFIX = 'alchemy_survivors_save_backup_';
const LOCAL_BACKUP_RING_PREFIX = 'alchemy_survivors_save_ring_';
const LOCAL_BACKUP_RING_SIZE = 5;
const CLOUD_USER_DATA_KEY = 'save';
const CLOUD_USER_DATA_KEY_PREVIOUS = 'save_previous';
const CLOUD_SAVE_DEBOUNCE_MS = 5000;
const SAVE_VERSION = 5;

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
  challengeClears: 0,
  nightmareClears: 0,
  firstPlayDate: null,
};

export class SaveSystem {
  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this._cloudSaveTimer = null;
    this._pendingCloudPayload = null;
    this._cloudSyncListener = null; // (event, detail) => void
    this._writeLocked = false;
    this._writeLockReason = null;
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

  /**
   * payload.version を分類する
   * @returns {'empty'|'current'|'migratable'|'future'|'corrupt'}
   */
  static classifyVersion(data) {
    if (!data) return 'empty';
    const v = data.version;
    if (typeof v !== 'number' || Number.isNaN(v)) return 'corrupt';
    if (v === SAVE_VERSION) return 'current';
    if (v > SAVE_VERSION) return 'future';
    if (v >= 1 && v < SAVE_VERSION) return 'migratable';
    return 'corrupt';
  }

  static get SAVE_VERSION() { return SAVE_VERSION; }

  /**
   * 書込ロック: データ消失防止のため、一度ロックされたら以降のsave/push要求を全て無視する
   * @param {string} reason - 'future_version' | 'cloud_newer' | 'corrupt' | 'apply_failed'
   */
  lockWrites(reason) {
    if (this._writeLocked) return;
    this._writeLocked = true;
    this._writeLockReason = reason || 'unknown';
    // 保留中の cloud push を破棄（書き戻し防止）
    if (this._cloudSaveTimer) {
      clearTimeout(this._cloudSaveTimer);
      this._cloudSaveTimer = null;
    }
    this._pendingCloudPayload = null;
    console.warn(`[SaveSystem] Writes locked: ${this._writeLockReason}`);
    this._emitCloudSync('locked', { reason: this._writeLockReason });
  }

  isWriteLocked() { return this._writeLocked; }
  getWriteLockReason() { return this._writeLockReason; }

  save(extraData = {}) {
    if (this._writeLocked) {
      // ロック中は save を受け付けない（消失防止）
      return false;
    }
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
      lastSelectedAreaId: extraData.lastSelectedAreaId || null,
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
      equipmentPresets: extraData.equipmentPresets || [],
      // カジノ独立state（実験機能。CASINO_ENABLED=false時は null が書き込まれる）
      casino: extraData.casino || null,
    };
  }

  _writeLocal(payload) {
    try {
      // 書込前に現在のsaveをリングバッファに退避
      this._rotateLocalBackups();
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('[SaveSystem] Local save failed:', e);
      return false;
    }
  }

  /** 現在のlocalStorageセーブをリングバッファの slot 0 に移し、古いものを順次後ろへずらす */
  _rotateLocalBackups() {
    try {
      const current = localStorage.getItem(SAVE_KEY);
      if (!current) return;
      for (let i = LOCAL_BACKUP_RING_SIZE - 1; i > 0; i--) {
        const prev = localStorage.getItem(`${LOCAL_BACKUP_RING_PREFIX}${i - 1}`);
        if (prev) localStorage.setItem(`${LOCAL_BACKUP_RING_PREFIX}${i}`, prev);
      }
      localStorage.setItem(`${LOCAL_BACKUP_RING_PREFIX}0`, current);
    } catch (e) { /* quota等は無視して上書きは続行 */ }
  }

  /**
   * 復旧UI向け: localStorage内のバックアップ一覧を返す
   * @returns {Array<{slot: number|string, data: object, timestamp: number, source: string}>}
   */
  listLocalBackups() {
    const backups = [];
    for (let i = 0; i < LOCAL_BACKUP_RING_SIZE; i++) {
      try {
        const raw = localStorage.getItem(`${LOCAL_BACKUP_RING_PREFIX}${i}`);
        if (!raw) continue;
        const data = JSON.parse(raw);
        backups.push({
          slot: i,
          data,
          timestamp: data?.timestamp || 0,
          source: `ring_${i}`,
        });
      } catch (e) { /* 壊れたエントリは無視 */ }
    }
    // 旧来の日付ベースbackup + conflict_* も拾う（復旧候補として有用）
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(BACKUP_KEY_PREFIX)) continue;
        try {
          const data = JSON.parse(localStorage.getItem(key));
          backups.push({
            slot: key,
            data,
            timestamp: data?.timestamp || 0,
            source: key.replace(BACKUP_KEY_PREFIX, 'legacy_'),
          });
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    // タイムスタンプ降順
    backups.sort((a, b) => b.timestamp - a.timestamp);
    return backups;
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
   * クラウド側の前世代 (save_previous) を取得（復旧UI用）
   * @returns {Promise<object|null>}
   */
  async loadCloudPrevious() {
    if (!PlayFabClient.isAvailable()) return null;
    try {
      const res = await PlayFabClient.getUserData([CLOUD_USER_DATA_KEY_PREVIOUS]);
      const entry = res?.Data?.[CLOUD_USER_DATA_KEY_PREVIOUS];
      if (!entry || !entry.Value) return null;
      return JSON.parse(entry.Value);
    } catch (e) {
      console.warn('[SaveSystem] Cloud previous load failed:', e.message || e);
      return null;
    }
  }

  /**
   * 復旧: 指定payloadを強制的にlocal+cloudへ書き戻す。書込ロック解除も行う。
   * ユーザーが「このバックアップから復元」を選んだ際に呼ぶ。
   */
  async restoreFromPayload(payload) {
    if (!payload) return false;
    // 書込ロック解除
    this._writeLocked = false;
    this._writeLockReason = null;
    // 現在のsaveをリング経由で退避してから上書き
    const ok = this._writeLocal(payload);
    if (ok) {
      // cloudにも即時push（デバウンスをバイパス）
      this._pendingCloudPayload = payload;
      try { await this._flushCloudPush(); } catch (e) { /* 後続で再試行 */ }
    }
    return ok;
  }

  /**
   * 起動時の同期: ローカル/クラウドから新しい方を採用
   * @returns {Promise<{ data: object|null, source: 'local'|'cloud'|'none', conflict: boolean, status: string, cloudFutureVersion?: number }>}
   */
  async syncOnBoot() {
    const local = this.load();
    const localStatus = SaveSystem.classifyVersion(local);
    if (!PlayFabClient.isAvailable()) {
      return { data: local, source: local ? 'local' : 'none', conflict: false, status: localStatus };
    }

    let cloud = null;
    try {
      await PlayFabClient.ensureLoggedIn();
      cloud = await this.loadFromCloud();
      this._emitCloudSync('pulled', { hasCloud: !!cloud });
    } catch (e) {
      console.warn('[SaveSystem] Cloud sync (login/pull) failed:', e.message || e);
      this._emitCloudSync('error', { phase: 'login', message: e.message });
      return { data: local, source: local ? 'local' : 'none', conflict: false, status: localStatus };
    }

    const cloudStatus = SaveSystem.classifyVersion(cloud);

    // ★ cloud が future-version の場合: local は一切触らず、呼び出し側で「更新必要」UIを出す
    if (cloudStatus === 'future') {
      return {
        data: local,
        source: local ? 'local' : 'none',
        conflict: false,
        status: localStatus,
        cloudFutureVersion: cloud.version,
      };
    }

    if (!local && !cloud) return { data: null, source: 'none', conflict: false, status: 'empty' };
    if (!local) return { data: cloud, source: 'cloud', conflict: false, status: cloudStatus };
    if (!cloud) return { data: local, source: 'local', conflict: false, status: localStatus };

    const localTs = local.timestamp || 0;
    const cloudTs = cloud.timestamp || 0;
    if (localTs === cloudTs) {
      return { data: local, source: 'local', conflict: false, status: localStatus };
    }

    const useCloud = cloudTs > localTs;
    const chosen = useCloud ? cloud : local;
    const discarded = useCloud ? local : cloud;
    try {
      const backupKey = `${BACKUP_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(backupKey, JSON.stringify(discarded));
    } catch (e) { /* ignore quota */ }
    return {
      data: chosen,
      source: useCloud ? 'cloud' : 'local',
      conflict: true,
      status: useCloud ? cloudStatus : localStatus,
    };
  }

  /**
   * デバウンスつきクラウドプッシュ予約
   */
  _scheduleCloudPush(payload) {
    if (this._writeLocked) return;
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
    if (this._writeLocked) {
      this._pendingCloudPayload = null;
      return false;
    }
    const payload = this._pendingCloudPayload;
    this._pendingCloudPayload = null;
    this._cloudSaveTimer = null;
    if (!payload || !PlayFabClient.isAvailable()) return false;
    this._emitCloudSync('pushing', null);
    try {
      // 楽観的ロック + 履歴退避のため、まず現 cloud を取得
      let currentCloud = null;
      try {
        const res = await PlayFabClient.getUserData([CLOUD_USER_DATA_KEY]);
        const entry = res?.Data?.[CLOUD_USER_DATA_KEY];
        if (entry && entry.Value) currentCloud = JSON.parse(entry.Value);
      } catch (e) {
        // 取得失敗時はロック判定をスキップして従来通りのpushを試みる
      }

      if (currentCloud) {
        const cloudV = typeof currentCloud.version === 'number' ? currentCloud.version : 0;
        const cloudTs = currentCloud.timestamp || 0;
        const myV = payload.version || 0;
        const myTs = payload.timestamp || 0;

        // クラウド側が「より新しいversion」または「同version + より新しいtimestamp」なら上書き禁止
        const cloudIsNewer = (cloudV > myV) || (cloudV === myV && cloudTs > myTs);
        if (cloudIsNewer) {
          // 上書きしたらデータ消失する状況。ロックして、cloud側をlocalに退避
          try {
            const backupKey = `${BACKUP_KEY_PREFIX}conflict_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify(currentCloud));
          } catch (e) { /* ignore */ }
          this.lockWrites(cloudV > myV ? 'future_version' : 'cloud_newer');
          this._emitCloudSync('conflict', {
            cloudVersion: cloudV,
            cloudTimestamp: cloudTs,
            localVersion: myV,
            localTimestamp: myTs,
          });
          return false;
        }
      }

      // 履歴: 現cloudを save_previous に退避しつつ新値をatomicに更新
      const updates = { [CLOUD_USER_DATA_KEY]: JSON.stringify(payload) };
      if (currentCloud) {
        try {
          updates[CLOUD_USER_DATA_KEY_PREVIOUS] = JSON.stringify(currentCloud);
        } catch (e) { /* serializeできない場合は履歴なしでpush */ }
      }
      await PlayFabClient.updateUserData(updates);
      this._emitCloudSync('pushed', { timestamp: payload.timestamp });
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Cloud push failed:', e.message || e);
      this._emitCloudSync('error', { phase: 'push', message: e.message });
      // 次回 save 時にリトライされるので pendingPayload を戻しておく
      if (!this._pendingCloudPayload && !this._writeLocked) this._pendingCloudPayload = payload;
      return false;
    }
  }

  /** v1/v2 → 最新バージョンへのマイグレーション */
  static _migrate(data) {
    if (!data) return null;
    if (typeof data.version !== 'number') return null;
    // 将来バージョンはマイグレーション不能。呼び出し側で classifyVersion を使って事前判定するのが前提だが、
    // 万一ここに到達しても不正な上書きが起きないよう null を返す
    if (data.version > SAVE_VERSION) return null;
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
    if (data.version === 3) {
      // v3→v4: equipmentPresets フィールド追加
      data.version = 4;
      data.equipmentPresets = data.equipmentPresets || [];
    }
    if (data.version === 4) {
      // v4→v5: casino フィールド追加（実験的カジノ機能）
      data.version = 5;
      data.casino = data.casino || null;
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
