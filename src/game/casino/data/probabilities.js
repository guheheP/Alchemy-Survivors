/**
 * probabilities.js — 抽選テーブル
 *
 * 分母は 65536（16bit RNG 相当）
 *
 * 設計方針 (ART機, レア役複合方式):
 *   レア役 (cherry/watermelon/chance) を「弱/強」に分岐させ、
 *   強弱別にボーナス/CZ当選を抽選する。
 *   レア役なし時のごく稀な直撃用に BONUS_DIRECT_PROB_TABLE を残す。
 *   ZENCHO は当選種別 (BONUS or CZ) で前兆G数を分岐。
 *
 * 抽選テーブル:
 *   1. RARE_STRENGTH_TABLE      : レア役成立時の弱/強判定
 *   2. RARE_BONUS_TABLE         : レア役強弱別 BONUS当選 (設定差)
 *   3. RARE_CZ_TABLE            : レア役強弱別 CZ当選 (BONUS外れ時のみ)
 *   4. BONUS_DIRECT_PROB_TABLE  : レア役なし時の直撃保険 (設定差)
 *   5. CZ_REROLL_TABLE          : CZ中の役別 ART成功抽選 (ハズレ含む全役)
 *   6. SMALLROLE_PROB_TABLE     : 小役抽選 (状態別)
 *   7. BLUE7_PROB_TABLE         : BONUS中の青7フラグ抽選
 *   8. UPSELL_PROB_TABLE        : ART中の上乗せ抽選
 */

/** 分母 */
export const PROB_DENOM = 65536;

/**
 * レア役成立時の強弱判定 (分母65536)
 * 値は「強」になる確率。残りは「弱」。
 * @type {Record<'cherry'|'watermelon'|'chance', number>}
 */
export const RARE_STRENGTH_TABLE = {
  cherry:     13107,  // 20%  (弱:強 = 8:2)
  watermelon: 19660,  // 30%  (弱:強 = 7:3)
  chance:     26214,  // 40%  (弱:強 = 6:4)
};

/**
 * レア役強弱別 BONUS 当選テーブル (設定差ココで付ける)
 * 値は分母65536の {big, reg, none}。
 *
 * 設計目標:
 *   - 弱レア役 → ほぼハズレ (0.2〜5%)
 *   - 強レア役 → 高確率で当選 (33〜55%)
 *
 * @type {Record<string, Record<1|2|3|4|5|6, {big:number, reg:number, none:number}>>}
 */
export const RARE_BONUS_TABLE = {
  cherry_weak: {
    1: { big:   400, reg:   500, none: 64636 },  //  1.37%
    2: { big:   430, reg:   530, none: 64576 },
    3: { big:   460, reg:   560, none: 64516 },
    4: { big:   500, reg:   600, none: 64436 },  //  1.68%
    5: { big:   550, reg:   650, none: 64336 },
    6: { big:   620, reg:   700, none: 64216 },  //  2.01%
  },
  cherry_strong: {
    // BIG偏重 (ART機: BIGからのART突入が出玉源)
    1: { big: 26000, reg:  7000, none: 32536 },  // 50.4%
    2: { big: 27500, reg:  6700, none: 31336 },
    3: { big: 29000, reg:  6400, none: 30136 },
    4: { big: 30500, reg:  6100, none: 28936 },  // 55.9%
    5: { big: 32200, reg:  5900, none: 27436 },
    6: { big: 34100, reg:  5700, none: 25736 },  // 60.7%
  },
  watermelon_weak: {
    1: { big:   850, reg:  1000, none: 63686 },  //  2.82%
    2: { big:   900, reg:  1050, none: 63586 },
    3: { big:   950, reg:  1100, none: 63486 },
    4: { big:  1000, reg:  1150, none: 63386 },  //  3.28%
    5: { big:  1080, reg:  1230, none: 63226 },
    6: { big:  1200, reg:  1350, none: 62986 },  //  3.89%
  },
  watermelon_strong: {
    // BIG偏重
    1: { big: 30500, reg:  7000, none: 28036 },  // 57.2%
    2: { big: 31900, reg:  6700, none: 26936 },
    3: { big: 33400, reg:  6400, none: 25736 },
    4: { big: 34900, reg:  6100, none: 24536 },  // 62.6%
    5: { big: 36400, reg:  5900, none: 23236 },
    6: { big: 38300, reg:  5700, none: 21536 },  // 67.2%
  },
  chance_weak: {
    1: { big:  2000, reg:  3500, none: 60036 },  //  8.39%
    2: { big:  2150, reg:  3700, none: 59686 },
    3: { big:  2300, reg:  3900, none: 59336 },
    4: { big:  2450, reg:  4100, none: 58986 },  //  9.99%
    5: { big:  2700, reg:  4350, none: 58486 },
    6: { big:  3000, reg:  4600, none: 57936 },  // 11.59%
  },
  chance_strong: {
    // BIG偏重: 強チャンス目はBIG確定級
    1: { big: 36000, reg:  8000, none: 21536 },  // 67.1%
    2: { big: 37500, reg:  8000, none: 20036 },
    3: { big: 39000, reg:  8000, none: 18536 },
    4: { big: 40500, reg:  8000, none: 17036 },  // 74.0%
    5: { big: 41500, reg:  8000, none: 16036 },
    6: { big: 42500, reg:  8000, none: 15036 },  // 77.0% (微調整: 設定6を控えめに)
  },
};

/**
 * レア役強弱別 CZ 当選テーブル (BONUS抽選外れ時のみ抽選)
 * 値は分母65536のCZ当選確率。設定差なし(全設定共通)。
 * @type {Record<string, number>}
 */
export const RARE_CZ_TABLE = {
  cherry_weak:        8000,  // 12.2%
  cherry_strong:     16500,  // 25.2%
  watermelon_weak:   12000,  // 18.3%
  watermelon_strong: 19500,  // 29.8%
  chance_weak:       20000,  // 30.5%
  chance_strong:     26500,  // 40.4%
};

/**
 * レア役なし時の直撃 BONUS (保険) — 設定差付き
 * NORMAL/ART/TENJOU で抽選。ZENCHO/CZ/BONUS_STANDBY/BONUS では走らない。
 * @type {Record<1|2|3|4|5|6, {big:number, reg:number, none:number}>}
 */
export const BONUS_DIRECT_PROB_TABLE = {
  // NORMAL/ART/TENJOU で抽選。コイン持ち切下げ分の機械割補正用。
  1: { big: 70, reg: 23, none: 65443 },  // 約 1/704
  2: { big: 60, reg: 20, none: 65456 },  // 約 1/819
  3: { big: 50, reg: 15, none: 65471 },  // 約 1/1009
  4: { big: 50, reg: 14, none: 65472 },  // 約 1/1024
  5: { big: 38, reg: 11, none: 65487 },  // 約 1/1338
  6: { big: 30, reg:  8, none: 65498 },  // 約 1/1724
};

/**
 * CZ中の役別 ART成功抽選テーブル (ハズレ含む全役)
 * CZ中は引いた役ごとにART突入抽選を引き、勝てば即CZ_SUCCESS。
 * 値は分母65536のART成功確率。
 * @type {Record<1|2|3|4|5|6, Record<string, number>>}
 */
export const CZ_REROLL_TABLE = {
  1: {
    none: 1500, bell: 2500, replay: 2500, reachme: 8000,
    cherry_weak: 4000, cherry_strong: 22000,
    watermelon_weak: 5000, watermelon_strong: 28000,
    chance_weak: 12000, chance_strong: 38000,
  },
  2: {
    none: 1700, bell: 2800, replay: 2800, reachme: 9000,
    cherry_weak: 4500, cherry_strong: 24000,
    watermelon_weak: 5500, watermelon_strong: 30000,
    chance_weak: 13000, chance_strong: 40000,
  },
  3: {
    none: 2000, bell: 3000, replay: 3000, reachme: 10000,
    cherry_weak: 5000, cherry_strong: 26000,
    watermelon_weak: 6000, watermelon_strong: 32000,
    chance_weak: 14000, chance_strong: 42000,
  },
  4: {
    none: 2300, bell: 3300, replay: 3300, reachme: 11000,
    cherry_weak: 5500, cherry_strong: 28000,
    watermelon_weak: 6500, watermelon_strong: 34000,
    chance_weak: 15000, chance_strong: 44000,
  },
  5: {
    none: 2700, bell: 3800, replay: 3800, reachme: 12500,
    cherry_weak: 6200, cherry_strong: 31000,
    watermelon_weak: 7300, watermelon_strong: 37000,
    chance_weak: 16500, chance_strong: 47000,
  },
  6: {
    none: 3200, bell: 4500, replay: 4500, reachme: 14000,
    cherry_weak: 7000, cherry_strong: 34000,
    watermelon_weak: 8200, watermelon_strong: 40000,
    chance_weak: 18000, chance_strong: 50000,
  },
};

/**
 * BONUS中の青7フラグ抽選テーブル
 * 目標: 1ボーナスあたりのART期待度を設定1〜6で 12〜28% に抑え、
 *       ARTストック消化（STOCK_BONUS_ADD=20G）を考慮して機械割を仕様値に収める。
 * @type {Record<1|2|3|4|5|6, {big:{blue7:number,none:number}, reg:{blue7:number,none:number}}>}
 */
export const BLUE7_PROB_TABLE = {
  // ART per BONUS 目標: 設定1=25% / 設定6=50% (NORMALコイン持ち厳しめでもBONUS経由のARTで補填)
  1: { big: { blue7: 1500, none: 64036 }, reg: { blue7: 2800, none: 62736 } },
  2: { big: { blue7: 1700, none: 63836 }, reg: { blue7: 3100, none: 62436 } },
  3: { big: { blue7: 1900, none: 63636 }, reg: { blue7: 3400, none: 62136 } },
  4: { big: { blue7: 2200, none: 63336 }, reg: { blue7: 3800, none: 61736 } },
  5: { big: { blue7: 2600, none: 62936 }, reg: { blue7: 4200, none: 61336 } },
  6: { big: { blue7: 3100, none: 62436 }, reg: { blue7: 4800, none: 60736 } },
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
      // 実機準拠: ハズレ少なめ・リプレイ多め(吸い込まない)・ベル多め(ナビ純増+12)
      // 純増 ~+2.0枚/G ターゲット
      bell: 15500, watermelon: 500, cherry: 400, chance: 400,
      replay: 30500, reachme: 0, none: 18236,
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
 * 前兆 (ZENCHO) 持続ゲーム数 — 当選種別で分岐
 *  BONUS当選: 1〜3G (短い前兆)
 *  CZ当選   : 10〜15G (じっくり煽り)
 */
export const ZENCHO_BONUS_GAMES = { min: 1, max: 3 };
export const ZENCHO_CZ_GAMES    = { min: 10, max: 15 };

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
