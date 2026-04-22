/**
 * rtmProbabilities.js — Road to Millionaire の抽選テーブル
 *
 * 分母 65536（16bit RNG 相当）。
 *
 * 構成:
 *   1. RTM_SMALLROLE_PROB_TABLE:       小役抽選（phase × setting）
 *   2. RTM_MODE_UP_TABLE:              レア役成立時のモード昇格抽選（setting × 役別）
 *   3. RTM_AT_DRAW_TABLE:              AT当選抽選（mode × 役別）※setting共通
 *   4. RTM_AT_STOCK_ON_HIT_TABLE:      AT当選時のストック個数抽選（mode別）
 *   5. RTM_AT_UPSELL_STOCK_TABLE:      AT中レア役でのストック上乗せ抽選（役別）
 *   6. RTM_MODE_TRANSITION_ON_AT_END_TABLE: AT終了時のモード移行抽選（setting別）
 *   7. RTM_TENJOU_STOCK_RANGE:         天井到達時に確定するストック個数範囲
 *
 * 設計目標:
 *   - 設定1: AT初当り≒1/900, 平均連≒2.0, 機械割≒91%
 *   - 設定6: AT初当り≒1/500, 平均連≒2.6, 機械割≒114%
 *   - 設定差は主にRTM_MODE_UP_TABLEで付け、AT抽選テーブルは共通化
 */

export const RTM_PROB_DENOM = 65536;

/** @typedef {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} RtmPhase */
/** @typedef {'normal'|'chance'|'heaven'|'super_heaven'} RtmMode */
/** @typedef {'bell'|'watermelon'|'cherry'|'chance'|'replay'|'none'} RtmSmallFlag */

/**
 * 小役抽選テーブル（phase別、全設定共通）
 *
 * normal平均払い出し 1.70枚/G → 吸込 -1.30枚/G
 * at平均払い出し 8.43枚/G → 純増 +5.43枚/G
 */
const SMALLROLE_COMMON = {
  normal: {
    bell: 8000, watermelon: 400, cherry: 300, chance: 250, replay: 9000, none: 47586,
  },
  at_standby: {
    bell: 5000, watermelon: 300, cherry: 200, chance: 0, replay: 10000, none: 50036,
  },
  at: {
    bell: 21800, watermelon: 500, cherry: 400, chance: 300, replay: 18000, none: 24536,
  },
  tenjou: {
    // 天井中は通常と同じ小役頻度（天井到達時は StateMachine 側で即 AT_STANDBY 遷移）
    bell: 8000, watermelon: 400, cherry: 300, chance: 250, replay: 9000, none: 47586,
  },
};

/** @type {Record<1|2|3|4|5|6, typeof SMALLROLE_COMMON>} */
export const RTM_SMALLROLE_PROB_TABLE = {
  1: SMALLROLE_COMMON, 2: SMALLROLE_COMMON, 3: SMALLROLE_COMMON,
  4: SMALLROLE_COMMON, 5: SMALLROLE_COMMON, 6: SMALLROLE_COMMON,
};

/**
 * モード昇格抽選テーブル（設定別、レア役別、分母65536）
 *
 * up1/up2/up3 = 現モードから +1/+2/+3 段階上昇。
 * SUPER_HEAVEN 到達時は天井（それ以上は上がらない）。
 * stay = 維持。4値の合計 = 65536。
 */
export const RTM_MODE_UP_TABLE = {
  1: {
    cherry:     { up1: 2000, up2: 300,  up3: 50,   stay: 63186 },
    watermelon: { up1: 4000, up2: 800,  up3: 100,  stay: 60636 },
    chance:     { up1: 10000, up2: 2500, up3: 400, stay: 52636 },
  },
  2: {
    cherry:     { up1: 2800, up2: 600,  up3: 150,  stay: 61986 },
    watermelon: { up1: 5500, up2: 1500, up3: 250,  stay: 58286 },
    chance:     { up1: 13000, up2: 4000, up3: 800, stay: 47736 },
  },
  3: {
    cherry:     { up1: 3600, up2: 1000, up3: 250,  stay: 60686 },
    watermelon: { up1: 7000, up2: 2200, up3: 400,  stay: 55936 },
    chance:     { up1: 15500, up2: 5500, up3: 1300, stay: 43236 },
  },
  4: {
    cherry:     { up1: 4500, up2: 1400, up3: 400,  stay: 59236 },
    watermelon: { up1: 8500, up2: 3000, up3: 600,  stay: 53436 },
    chance:     { up1: 18000, up2: 7000, up3: 1800, stay: 38736 },
  },
  5: {
    cherry:     { up1: 5500, up2: 2000, up3: 550,  stay: 57486 },
    watermelon: { up1: 10000, up2: 4000, up3: 900, stay: 50636 },
    chance:     { up1: 20000, up2: 8500, up3: 2400, stay: 34636 },
  },
  6: {
    cherry:     { up1: 6500, up2: 2500, up3: 700,  stay: 55836 },
    watermelon: { up1: 11500, up2: 5000, up3: 1200, stay: 47836 },
    chance:     { up1: 22000, up2: 10000, up3: 3000, stay: 30536 },
  },
};

/**
 * AT当選抽選テーブル（mode × rare flag、分母65536）
 *
 * 設定共通。設定差はRTM_MODE_UP_TABLEでモード滞在率を変えることで吸収。
 * super_heaven でのchanceは 60000/65536 ≈ 91.5% でほぼ確定。
 */
export const RTM_AT_DRAW_TABLE = {
  normal: {
    cherry: 200, watermelon: 500, chance: 2500, bell: 0, replay: 0,
  },
  chance: {
    cherry: 700, watermelon: 2500, chance: 10000, bell: 0, replay: 0,
  },
  heaven: {
    cherry: 3500, watermelon: 10000, chance: 28000, bell: 0, replay: 500,
  },
  super_heaven: {
    cherry: 15000, watermelon: 35000, chance: 60000, bell: 100, replay: 2000,
  },
};

/**
 * AT当選時のストック個数抽選（当選直後、mode別）
 *
 * stocks = initial set 以外に追加で付与されるセット数。
 * 合計連数 = 1 (initial) + stocks。
 *
 * 期待値:
 *   normal:       E[stocks] = 0.30 → 1.30連
 *   chance:       E[stocks] = 0.48 → 1.48連
 *   heaven:       E[stocks] = 1.29 → 2.29連
 *   super_heaven: E[stocks] = 2.21 → 3.21連
 *
 * 備考: AT中の上乗せストック (RTM_AT_UPSELL_STOCK_TABLE) でさらに +0.3〜0.5 連程度
 * 加算されるため、最終平均連数は設定6で 2.6-2.8 連を目標に調整。
 */
export const RTM_AT_STOCK_ON_HIT_TABLE = {
  normal: {
    stocks:  [0, 1, 2],
    weights: [750, 200, 50],
  },
  chance: {
    stocks:  [0, 1, 2, 3],
    weights: [550, 330, 100, 20],
  },
  heaven: {
    stocks:  [0, 1, 2, 3, 5],
    weights: [300, 500, 150, 40, 10],
  },
  super_heaven: {
    stocks:  [1, 2, 3, 5, 10],
    weights: [500, 300, 150, 40, 10],
  },
};

/**
 * AT中レア役でのストック上乗せ抽選（役別）
 *
 * AT消化中、各レア役成立時に追加で引くテーブル。期待ストック増:
 *   cherry:     0.03
 *   watermelon: 0.08
 *   chance:     0.235
 */
export const RTM_AT_UPSELL_STOCK_TABLE = {
  cherry: {
    stocks:  [0, 1],
    weights: [970, 30],
  },
  watermelon: {
    stocks:  [0, 1, 2],
    weights: [930, 60, 10],
  },
  chance: {
    stocks:  [0, 1, 2, 5],
    weights: [800, 170, 25, 5],
  },
};

/**
 * AT終了時のモード移行抽選（設定別、分母65536）
 *
 * 次のAT開始までのモードを決定。合計 = 65536。
 */
export const RTM_MODE_TRANSITION_ON_AT_END_TABLE = {
  1: { normal: 52000, chance: 12000, heaven: 1400, super_heaven: 136 },
  2: { normal: 50000, chance: 13500, heaven: 1800, super_heaven: 236 },
  3: { normal: 48000, chance: 14800, heaven: 2400, super_heaven: 336 },
  4: { normal: 45000, chance: 16500, heaven: 3500, super_heaven: 536 },
  5: { normal: 42000, chance: 18500, heaven: 4200, super_heaven: 836 },
  6: { normal: 40000, chance: 20000, heaven: 4400, super_heaven: 1136 },
};

/**
 * 天井救済時のストック個数範囲（一様乱数で [min, max] 範囲を抽選）
 * 仕様: 1500Gで AT当選 + ストック1〜8個確定
 */
export const RTM_TENJOU_STOCK_RANGE = { min: 1, max: 8 };

/**
 * 分布の合計値チェック。テスト・シミュレータから呼ぶ。
 * @param {Record<string, number>} dist
 * @returns {boolean}
 */
export function validateDistribution(dist) {
  const sum = Object.values(dist).reduce((a, b) => a + b, 0);
  return sum === RTM_PROB_DENOM;
}

/**
 * 重み配列の合計が有効か（weightsは独立なので分母=sum(weights)）
 * @param {number[]} weights
 * @returns {boolean}
 */
export function validateWeights(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return false;
  return weights.every(w => Number.isInteger(w) && w >= 0) && weights.some(w => w > 0);
}
