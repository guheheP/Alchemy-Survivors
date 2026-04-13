/**
 * Progression — エリア進行状態管理 + 品質上限
 */

const _defeatedBosses = new Set();
const _purchasedUpgrades = new Set();

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

  clear() {
    _defeatedBosses.clear();
    _purchasedUpgrades.clear();
  },
};
