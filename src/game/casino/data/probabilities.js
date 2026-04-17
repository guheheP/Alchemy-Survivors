/**
 * probabilities.js — 抽選テーブル
 *
 * 分母は 65536（16bit RNG 相当）
 * 6層構成:
 *   1. BONUS_PROB_TABLE: BONUS抽選（BONUS_STANDBY / BONUS 中は走らない）
 *   2. SMALLROLE_PROB_TABLE: 小役抽選（状態別）
 *   3. BLUE7_PROB_TABLE: BONUS中の青7フラグ抽選
 *   4. UPSELL_PROB_TABLE: ART中の上乗せ抽選
 *   5. ZENCHO_TRIGGER_PROB_TABLE: 通常時のレア役からZENCHO突入抽選
 *   6. ZENCHO_RESULT_TABLE: ZENCHO終了時の結果判定（CZ/BONUS/失敗）
 *   7. CZ_SUCCESS_PROB_TABLE: CZ中の成功（ART突入）判定
 */

/** 分母 */
export const PROB_DENOM = 65536;

/**
 * BONUS抽選テーブル
 * @type {Record<1|2|3|4|5|6, {big:number, reg:number, none:number}>}
 */
export const BONUS_PROB_TABLE = {
  1: { big: 258, reg: 170, none: 65108 },
  2: { big: 264, reg: 173, none: 65099 },
  3: { big: 267, reg: 175, none: 65094 },
  4: { big: 268, reg: 176, none: 65092 },
  5: { big: 272, reg: 178, none: 65086 },
  6: { big: 280, reg: 183, none: 65073 },
};

/**
 * BONUS中の青7フラグ抽選テーブル
 * @type {Record<1|2|3|4|5|6, {big:{blue7:number,none:number}, reg:{blue7:number,none:number}}>}
 */
export const BLUE7_PROB_TABLE = {
  1: { big: { blue7: 900,  none: 64636 }, reg: { blue7: 2200, none: 63336 } },
  2: { big: { blue7: 1000, none: 64536 }, reg: { blue7: 2500, none: 63036 } },
  3: { big: { blue7: 1100, none: 64436 }, reg: { blue7: 2700, none: 62836 } },
  4: { big: { blue7: 1200, none: 64336 }, reg: { blue7: 2900, none: 62636 } },
  5: { big: { blue7: 1250, none: 64286 }, reg: { blue7: 3100, none: 62436 } },
  6: { big: { blue7: 1300, none: 64236 }, reg: { blue7: 3300, none: 62236 } },
};

/**
 * 小役抽選テーブル（設定×状態別）
 */
export const SMALLROLE_PROB_TABLE = {
  4: {
    normal: {
      bell: 7500, watermelon: 450, cherry: 350, chance: 300,
      replay: 8000, reachme: 0, none: 48936,
    },
    zencho: {
      // 前兆中: レア役の頻度を若干UP（演出用）。結果抽選はフェーズ終了時に別途
      bell: 7500, watermelon: 700, cherry: 550, chance: 500,
      replay: 8000, reachme: 300, none: 47986,
    },
    cz: {
      // CZ中: レア役頻度UP、チャンス目でART成功チャンス
      bell: 5000, watermelon: 1500, cherry: 1200, chance: 2500,
      replay: 8000, reachme: 0, none: 47336,
    },
    bonus_standby: {
      bell: 7500, watermelon: 1800, cherry: 1400, chance: 1200,
      replay: 8000, reachme: 800, none: 44836,
    },
    bonus: {
      bonus_payout: 65536, none: 0,
    },
    art: {
      bell: 7500, watermelon: 500, cherry: 400, chance: 400,
      replay: 26000, reachme: 0, none: 30736,
    },
    tenjou: {
      // 天井中: レア役頻度UPで早期救済（救済効果演出）
      bell: 7500, watermelon: 900, cherry: 700, chance: 800,
      replay: 8000, reachme: 0, none: 47636,
    },
  },
  1: null, 2: null, 3: null, 5: null, 6: null,
};

// 設定4のテーブルを他設定にコピー
for (const setting of [1, 2, 3, 5, 6]) {
  SMALLROLE_PROB_TABLE[setting] = {
    normal:        { ...SMALLROLE_PROB_TABLE[4].normal },
    zencho:        { ...SMALLROLE_PROB_TABLE[4].zencho },
    cz:            { ...SMALLROLE_PROB_TABLE[4].cz },
    bonus_standby: { ...SMALLROLE_PROB_TABLE[4].bonus_standby },
    bonus:         { ...SMALLROLE_PROB_TABLE[4].bonus },
    art:           { ...SMALLROLE_PROB_TABLE[4].art },
    tenjou:        { ...SMALLROLE_PROB_TABLE[4].tenjou },
  };
}

/**
 * 上乗せ抽選（ART中のレア小役で抽選）
 */
export const UPSELL_PROB_TABLE = {
  watermelon: { upsell: [5, 10, 30],  weights: [900, 90, 10] },
  cherry:     { upsell: [3, 10, 30],  weights: [950, 40, 10] },
  chance:     { upsell: [10, 30, 100], weights: [700, 250, 50] },
};

/**
 * ZENCHO突入抽選テーブル
 * NORMAL中のレア役フラグ成立時に抽選（各フラグが独立テーブル）
 * 目標: 全設定で約 1/200〜1/150G程度のZENCHO発生
 * @type {Record<1|2|3|4|5|6, Record<'watermelon'|'cherry'|'chance', number>>}
 * 値は「レア役成立時にZENCHOへ移行する確率(分母=65536)」
 */
export const ZENCHO_TRIGGER_PROB_TABLE = {
  1: { watermelon: 4500,  cherry: 3000,  chance: 13000 },
  2: { watermelon: 4800,  cherry: 3200,  chance: 14000 },
  3: { watermelon: 5000,  cherry: 3300,  chance: 14500 },
  4: { watermelon: 5200,  cherry: 3400,  chance: 15000 },
  5: { watermelon: 5500,  cherry: 3500,  chance: 15500 },
  6: { watermelon: 5800,  cherry: 3700,  chance: 16500 },
};

/**
 * ZENCHO結果抽選（ZENCHO消化終了時）
 * 合計 65536
 * @type {Record<1|2|3|4|5|6, {cz:number, bonus_hit:number, fail:number}>}
 */
export const ZENCHO_RESULT_TABLE = {
  1: { cz: 28000, bonus_hit: 4000, fail: 33536 }, // CZ 43% / 直撃 6% / 失敗 51%
  2: { cz: 30000, bonus_hit: 4500, fail: 31036 },
  3: { cz: 32000, bonus_hit: 5000, fail: 28536 },
  4: { cz: 34000, bonus_hit: 5500, fail: 26036 }, // CZ 52% / 直撃 8% / 失敗 40%
  5: { cz: 36000, bonus_hit: 6000, fail: 23536 },
  6: { cz: 38000, bonus_hit: 6500, fail: 21036 }, // CZ 58% / 直撃 10% / 失敗 32%
};

/**
 * CZ成功抽選（CZ中のチャンス目フラグ成立時にチェック）
 * チャンス目フラグ成立時、下記確率でART突入が確定
 * @type {Record<1|2|3|4|5|6, number>} 分母65536
 */
export const CZ_SUCCESS_ON_CHANCE_TABLE = {
  1: 11000,
  2: 13000,
  3: 15000,
  4: 16000,
  5: 18000,
  6: 22000,
};

/**
 * ZENCHO持続ゲーム数（ランダム範囲）
 */
export const ZENCHO_GAMES = { min: 5, max: 15 };

/**
 * CZ持続ゲーム数
 */
export const CZ_GAMES = 10;

/**
 * 天井到達ゲーム数
 */
export const TENJOU_GAMES = 1200;

/**
 * 合計値チェック
 */
export function validateDistribution(dist) {
  const sum = Object.values(dist).reduce((a, b) => a + b, 0);
  return sum === PROB_DENOM;
}
