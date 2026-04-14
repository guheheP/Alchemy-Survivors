/**
 * Progression — エリア進行状態管理 + 品質上限
 */

const _defeatedBosses = new Set();
const _purchasedUpgrades = new Set();
let _warehouseLevel = 0;
const _statLevels = { hp: 0, atk: 0, def: 0 };
const STAT_MAX_LEVEL = 100;

/** ボス撃破数 → 品質上限のマッピング */
const QUALITY_CAP_TABLE = {
  0: 100,   // 初期
  1: 200,   // 1体撃破
  2: 300,   // 2体撃破
  3: 400,   // 3体撃破
  4: 500,   // 4体撃破
  5: 650,   // 5体撃破
  6: 800,   // 6体撃破
  7: 999,   // 7体撃破（全ボス）
};

export const Progression = {
  markBossDefeated(bossId) {
    _defeatedBosses.add(bossId);
  },

  isBossDefeated(bossId) {
    return _defeatedBosses.has(bossId);
  },

  getDefeatedBosses() {
    return [..._defeatedBosses];
  },

  getDefeatedCount() {
    return _defeatedBosses.size;
  },

  getQualityCap() {
    const count = _defeatedBosses.size;
    return QUALITY_CAP_TABLE[count] || 999;
  },

  loadDefeatedBosses(bossIds) {
    _defeatedBosses.clear();
    for (const id of (bossIds || [])) {
      _defeatedBosses.add(id);
    }
  },

  addPurchasedUpgrade(id) {
    _purchasedUpgrades.add(id);
  },

  getPurchasedUpgrades() {
    return _purchasedUpgrades;
  },

  hasPurchasedUpgrade(id) {
    return _purchasedUpgrades.has(id);
  },

  getUpgradeBonus(type) {
    let total = 0;
    // Import not needed -- just check the set against known upgrade IDs
    return total;
  },

  loadPurchasedUpgrades(ids) {
    _purchasedUpgrades.clear();
    for (const id of (ids || [])) {
      _purchasedUpgrades.add(id);
    }
  },

  // ── 倉庫拡張レベル ──
  getWarehouseLevel() { return _warehouseLevel; },
  setWarehouseLevel(lv) { _warehouseLevel = Math.max(0, lv | 0); },
  incrementWarehouseLevel() { _warehouseLevel++; return _warehouseLevel; },

  /** 旧capacity_1/2/3購入履歴からマイグレーション（初回ロード時に1度だけ呼ぶ） */
  migrateLegacyCapacityUpgrades() {
    let migrated = 0;
    if (_purchasedUpgrades.has('capacity_1')) migrated = Math.max(migrated, 1);
    if (_purchasedUpgrades.has('capacity_2')) migrated = Math.max(migrated, 2);
    if (_purchasedUpgrades.has('capacity_3')) migrated = Math.max(migrated, 3);
    if (migrated > _warehouseLevel) _warehouseLevel = migrated;
    // 旧IDは不要なので除去（再購入防止のため残してもよいが、UIから消すため除去）
    _purchasedUpgrades.delete('capacity_1');
    _purchasedUpgrades.delete('capacity_2');
    _purchasedUpgrades.delete('capacity_3');
    return migrated;
  },

  // ── 永続ステータスアップグレード（HP/ATK/DEF, 0..100 Lv = +Lv%） ──
  STAT_MAX_LEVEL,
  getStatLevel(stat) { return _statLevels[stat] || 0; },
  setStatLevel(stat, lv) {
    if (!(stat in _statLevels)) return;
    _statLevels[stat] = Math.max(0, Math.min(STAT_MAX_LEVEL, lv | 0));
  },
  incrementStatLevel(stat) {
    if (!(stat in _statLevels)) return 0;
    if (_statLevels[stat] >= STAT_MAX_LEVEL) return _statLevels[stat];
    _statLevels[stat]++;
    return _statLevels[stat];
  },
  getStatBonusPercent(stat) { return (_statLevels[stat] || 0) / 100; },
  getStatLevels() { return { ..._statLevels }; },
  loadStatLevels(obj) {
    for (const k of Object.keys(_statLevels)) _statLevels[k] = 0;
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (k in _statLevels) _statLevels[k] = Math.max(0, Math.min(STAT_MAX_LEVEL, v | 0));
    }
  },

  clear() {
    _defeatedBosses.clear();
    _purchasedUpgrades.clear();
    _warehouseLevel = 0;
    for (const k of Object.keys(_statLevels)) _statLevels[k] = 0;
  },
};
