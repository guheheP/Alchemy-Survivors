/**
 * 冒険者・ドロップテーブルのマスターデータ定義
 */

// 冒険者の初期定義
export const AdventurerDefs = [
  {
    id: 'adv_knight',
    name: '新人騎士アーサー',
    icon: '🛡️',
    exploreTimeMultiplier: 1.0,
    preset: '/presets/RPG_Characters/Knight.json',
    allowedEquipTypes: ['sword', 'shield', 'armor', 'spear'],
    battle: { maxHp: 120, atk: 22, def: 15, spd: 70 },
  },
  {
    id: 'adv_archer',
    name: '狩人ロビン',
    icon: '🏹',
    exploreTimeMultiplier: 0.85,
    preset: '/presets/RPG_Characters/Archer.json',
    allowedEquipTypes: ['bow', 'dagger', 'robe', "armor"],
    battle: { maxHp: 90, atk: 28, def: 8, spd: 90 },
  },
];

// Rank 2で加入
export const UnlockableAdventurers = [
  {
    id: 'adv_mage',
    name: '見習い魔女リリー',
    icon: '🧙‍♀️',
    exploreTimeMultiplier: 1.1,
    unlockRank: 2,
    preset: '/presets/RPG_Characters/Mage.json',
    allowedEquipTypes: ['staff', 'robe', 'spear'],
    battle: { maxHp: 80, atk: 35, def: 5, spd: 75 },
  },
  {
    id: 'adv_thief',
    name: '盗賊キャット',
    icon: '🐱',
    exploreTimeMultiplier: 0.7,
    unlockRank: 3,
    preset: '/presets/RPG_Characters/Cat.json',
    allowedEquipTypes: ['dagger', 'bow', 'robe'],
    battle: { maxHp: 100, atk: 25, def: 10, spd: 100 },
  },
  {
    id: 'adv_paladin',
    name: '聖騎士セシル',
    icon: '⚜️',
    exploreTimeMultiplier: 1.2,
    unlockRank: 4,
    preset: '/presets/RPG_Characters/King.json',
    allowedEquipTypes: ['sword', 'shield', 'armor', 'spear'],
    battle: { maxHp: 140, atk: 18, def: 20, spd: 60 },
  },
];

// レベルアップに必要な経験値テーブル (累積)
// Lv1-10: 通常成長 / Lv11-30: エンドゲーム（アップグレードでLv上限解放時のみ到達可能）
export const LevelExpTable = [
  0,      // Lv1
  3,      // Lv2
  8,      // Lv3
  15,     // Lv4
  25,     // Lv5
  40,     // Lv6
  60,     // Lv7
  85,     // Lv8
  120,    // Lv9
  170,    // Lv10 — 通常の最大
  260,    // Lv11
  370,    // Lv12
  500,    // Lv13
  650,    // Lv14
  820,    // Lv15 — 覚醒I
  1020,   // Lv16
  1250,   // Lv17
  1520,   // Lv18
  1830,   // Lv19
  2180,   // Lv20 — 覚醒II
  2580,   // Lv21
  3040,   // Lv22
  3560,   // Lv23
  4150,   // Lv24
  4820,   // Lv25 — 覚醒III
  5580,   // Lv26
  6440,   // Lv27
  7410,   // Lv28
  8500,   // Lv29
  9720,   // Lv30 — 覚醒IV（最大）
];

// 絶対最大レベル（全エンドゲームアップグレード購入後）
export const ABSOLUTE_MAX_LEVEL = 30;
// デフォルトレベル上限（アップグレード未購入時）
export const DEFAULT_MAX_LEVEL = 10;

// レベルごとのボーナス（探索系 — Lv1→Lv(N-1) で線形加算）
export const LevelBonuses = {
  qualityBonus: 1,       // レベルごとに品質+1（装備品質がメイン）
  timeReduction: 0.03,   // レベルごとに探索時間-3%（特性がメイン）
  dropBonus: 0.01,       // レベルごとに追加ドロップ確率+1%
  successBonus: 5,       // レベルごとに成功率+5%
};

/**
 * レベルごとの基礎ステータスボーナス（バトル用）
 * Lv1-10:  +5HP, +2ATK, +1DEF, +2SPD per level（通常成長）
 * Lv11-20: +3HP, +1ATK, +1DEF, +1SPD per level（鈍化）
 * Lv21-30: +2HP, +1ATK, +0DEF, +1SPD per level（さらに鈍化）
 */
export function getLevelStatBonus(level) {
  const n = Math.max(0, (level || 1) - 1);
  const t1 = Math.min(n, 9);                         // Lv1-10 range
  const t2 = Math.max(0, Math.min(n - 9, 10));       // Lv11-20 range
  const t3 = Math.max(0, n - 19);                    // Lv21-30 range
  return {
    hp:  t1 * 5 + t2 * 3 + t3 * 2,
    atk: t1 * 2 + t2 * 1 + t3 * 1,
    def: t1 * 1 + t2 * 1 + t3 * 0,
    spd: t1 * 2 + t2 * 1 + t3 * 1,
  };
}

/** アップグレードによる解放量を踏まえた現在のレベル上限 */
export function getCurrentMaxLevel(advMaxLevelBonus = 0) {
  return Math.min(ABSOLUTE_MAX_LEVEL, DEFAULT_MAX_LEVEL + (advMaxLevelBonus || 0));
}
