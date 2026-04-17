/**
 * SlotEngine.js — 抽選・役判定の中核
 *
 * 純粋関数に近いロジック層。RNG・確率テーブル・現phaseを入力として、
 * 1ゲーム分のフラグ成立結果を返す。
 */

import {
  BONUS_PROB_TABLE,
  SMALLROLE_PROB_TABLE,
  BLUE7_PROB_TABLE,
  UPSELL_PROB_TABLE,
  ZENCHO_TRIGGER_PROB_TABLE,
  ZENCHO_RESULT_TABLE,
  CZ_SUCCESS_ON_CHANCE_TABLE,
  PROB_DENOM,
} from '../data/probabilities.js';
import { drawFromDistribution } from '../util/rng.js';

/**
 * @typedef {'big'|'reg'|'none'} BonusFlag
 * @typedef {'bell'|'watermelon'|'cherry'|'chance'|'replay'|'reachme'|'bonus_payout'|'none'} SmallFlag
 * @typedef {'blue7'|'none'} Blue7Flag
 */

/**
 * @typedef {Object} DrawResult
 * @property {BonusFlag} bonusFlag
 * @property {SmallFlag} smallFlag
 * @property {Blue7Flag} blue7Flag
 * @property {BonusFlag} standbyKind
 * @property {boolean} zenchoTriggered    - NORMAL中のレア役からZENCHO突入したか
 * @property {boolean} czSuccess          - CZ中にART成功したか
 * @property {boolean} tenjouForceBonus   - TENJOU中にレア役で強制BONUS成立したか（種別はbonusFlagで返す）
 */

/**
 * 1ゲーム分の内部抽選を実行
 * @param {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} phase
 * @param {'big'|'reg'|null} standbyKind
 * @param {'big'|'reg'|null} bonusKind
 * @param {1|2|3|4|5|6} setting
 * @param {import('../util/rng.js').Rng} rng
 * @returns {DrawResult}
 */
export function drawFlags(phase, standbyKind, bonusKind, setting, rng) {
  /** @type {BonusFlag} */
  let bonusFlag = 'none';
  /** @type {Blue7Flag} */
  let blue7Flag = 'none';

  // (A) BONUS抽選: BONUS_STANDBY / BONUS 中はスキップ
  if (phase !== 'BONUS_STANDBY' && phase !== 'BONUS') {
    const bonusTable = BONUS_PROB_TABLE[setting];
    const result = drawFromDistribution(bonusTable, PROB_DENOM, rng);
    if (result !== 'none') bonusFlag = /** @type {BonusFlag} */ (result);
  }

  // (B) BONUS中のみ: 青7チャレンジ抽選
  if (phase === 'BONUS' && bonusKind) {
    const blue7Table = BLUE7_PROB_TABLE[setting][bonusKind];
    if (blue7Table) {
      const result = drawFromDistribution(blue7Table, PROB_DENOM, rng);
      if (result === 'blue7') blue7Flag = 'blue7';
    }
  }

  // (C) 小役抽選
  const phaseKey = phaseToTableKey(phase);
  const smallTable = SMALLROLE_PROB_TABLE[setting][phaseKey];
  const smallFlag = /** @type {SmallFlag} */ (drawFromDistribution(smallTable, PROB_DENOM, rng));

  // (D) NORMAL中のレア役からZENCHO突入抽選
  let zenchoTriggered = false;
  if (phase === 'NORMAL' && (smallFlag === 'watermelon' || smallFlag === 'cherry' || smallFlag === 'chance')) {
    const trigger = ZENCHO_TRIGGER_PROB_TABLE[setting][smallFlag] || 0;
    if (rng.nextInt(PROB_DENOM) < trigger) zenchoTriggered = true;
  }

  // (E) CZ中: チャンス目フラグ成立時にART成功判定
  let czSuccess = false;
  if (phase === 'CZ' && smallFlag === 'chance') {
    const threshold = CZ_SUCCESS_ON_CHANCE_TABLE[setting] || 0;
    if (rng.nextInt(PROB_DENOM) < threshold) czSuccess = true;
  }

  // (F) TENJOU中: レア役で強制BONUS当選
  let tenjouForceBonus = false;
  if (phase === 'TENJOU' && bonusFlag === 'none') {
    // レア役（watermelon/cherry/chance）で強制BONUS（BIGを優先）
    if (smallFlag === 'watermelon' || smallFlag === 'cherry' || smallFlag === 'chance') {
      // BIG:REG = 7:3 で強制当選
      bonusFlag = rng.nextInt(10) < 7 ? 'big' : 'reg';
      tenjouForceBonus = true;
    }
  }

  return {
    bonusFlag,
    smallFlag,
    blue7Flag,
    standbyKind: bonusFlag !== 'none' ? bonusFlag : (standbyKind || 'none'),
    zenchoTriggered,
    czSuccess,
    tenjouForceBonus,
  };
}

/**
 * ZENCHO結果抽選（ZENCHO終了ゲーム時に呼ばれる）
 * @param {1|2|3|4|5|6} setting
 * @param {import('../util/rng.js').Rng} rng
 * @returns {'cz'|'bonus_hit'|'fail'}
 */
export function drawZenchoResult(setting, rng) {
  const table = ZENCHO_RESULT_TABLE[setting];
  return /** @type {'cz'|'bonus_hit'|'fail'} */ (drawFromDistribution(table, PROB_DENOM, rng));
}

/**
 * ART中のレア小役成立時、上乗せG数を抽選
 */
export function drawUpsell(flag, rng) {
  const table = UPSELL_PROB_TABLE[flag];
  if (!table) return 0;
  const totalWeight = table.weights.reduce((a, b) => a + b, 0);
  const r = rng.nextInt(totalWeight);
  let cum = 0;
  for (let i = 0; i < table.weights.length; i++) {
    cum += table.weights[i];
    if (r < cum) return table.upsell[i];
  }
  return table.upsell[0];
}

function phaseToTableKey(phase) {
  switch (phase) {
    case 'NORMAL':        return 'normal';
    case 'ZENCHO':        return 'zencho';
    case 'CZ':            return 'cz';
    case 'BONUS_STANDBY': return 'bonus_standby';
    case 'BONUS':         return 'bonus';
    case 'ART':           return 'art';
    case 'TENJOU':        return 'tenjou';
    default:              return 'normal';
  }
}
