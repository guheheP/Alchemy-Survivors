/**
 * SlotEngine.js — 抽選・役判定の中核
 *
 * 純粋関数に近いロジック層。RNG・確率テーブル・現phaseを入力として、
 * 1ゲーム分のフラグ成立結果を返す。
 *
 * 抽選フロー (NORMAL/ART/TENJOU):
 *   1. 小役抽選 (smallFlag)
 *   2. レア役なら RARE_STRENGTH_TABLE で弱/強を決定
 *   3. レア役強弱別 RARE_BONUS_TABLE で BONUS抽選 (設定差ココ)
 *   4. BONUS外れで NORMAL/TENJOU なら RARE_CZ_TABLE で CZ抽選
 *   5. レア役なし時のみ BONUS_DIRECT_PROB_TABLE で直撃保険抽選
 *   6. TENJOU中: レア役なら強制BONUS当選
 *
 * 抽選フロー (CZ):
 *   - 引いた役 (ハズレ含む全役) を CZ_REROLL_TABLE で照合し ART成功抽選
 */

import {
  RARE_STRENGTH_TABLE,
  RARE_BONUS_TABLE,
  RARE_CZ_TABLE,
  BONUS_DIRECT_PROB_TABLE,
  CZ_REROLL_TABLE,
  SMALLROLE_PROB_TABLE,
  BLUE7_PROB_TABLE,
  UPSELL_PROB_TABLE,
  PROB_DENOM,
} from '../data/probabilities.js';
import { drawFromDistribution } from '../util/rng.js';

/**
 * @typedef {'big'|'reg'|'none'} BonusFlag
 * @typedef {'bell'|'watermelon'|'cherry'|'chance'|'replay'|'reachme'|'bonus_payout'|'none'} SmallFlag
 * @typedef {'blue7'|'none'} Blue7Flag
 * @typedef {'weak'|'strong'|null} RareStrength
 */

/**
 * @typedef {Object} DrawResult
 * @property {BonusFlag} bonusFlag
 * @property {SmallFlag} smallFlag
 * @property {Blue7Flag} blue7Flag
 * @property {BonusFlag} standbyKind
 * @property {RareStrength} rareStrength    - レア役の強弱 (レア役以外は null)
 * @property {boolean} czTriggered          - レア役からCZ前兆へ移行したか
 * @property {boolean} czSuccess            - CZ中にART成功したか
 * @property {boolean} tenjouForceBonus     - TENJOU中にレア役で強制BONUS成立したか
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

  // (A) 小役抽選
  const phaseKey = phaseToTableKey(phase);
  const smallTable = SMALLROLE_PROB_TABLE[setting][phaseKey];
  const smallFlag = /** @type {SmallFlag} */ (drawFromDistribution(smallTable, PROB_DENOM, rng));

  // (B) レア役の強弱判定
  /** @type {RareStrength} */
  let rareStrength = null;
  if (smallFlag === 'cherry' || smallFlag === 'watermelon' || smallFlag === 'chance') {
    const strongThreshold = RARE_STRENGTH_TABLE[smallFlag] || 0;
    rareStrength = rng.nextInt(PROB_DENOM) < strongThreshold ? 'strong' : 'weak';
  }

  // (C) BONUS中の青7チャレンジ
  if (phase === 'BONUS' && bonusKind) {
    const blue7Table = BLUE7_PROB_TABLE[setting][bonusKind];
    if (blue7Table) {
      const result = drawFromDistribution(blue7Table, PROB_DENOM, rng);
      if (result === 'blue7') blue7Flag = 'blue7';
    }
  }

  // BONUS_STANDBY/BONUS 中は当選系抽選なし
  if (phase === 'BONUS_STANDBY' || phase === 'BONUS') {
    return {
      bonusFlag,
      smallFlag,
      blue7Flag,
      standbyKind: standbyKind || 'none',
      rareStrength,
      czTriggered: false,
      czSuccess: false,
      tenjouForceBonus: false,
    };
  }

  // (D) レア役強弱別 BONUS 抽選
  let czTriggered = false;
  if (rareStrength !== null) {
    const key = `${smallFlag}_${rareStrength}`;
    const bonusTable = RARE_BONUS_TABLE[key]?.[setting];
    if (bonusTable) {
      const result = drawFromDistribution(bonusTable, PROB_DENOM, rng);
      if (result !== 'none') bonusFlag = /** @type {BonusFlag} */ (result);
    }

    // (E) BONUS外れ かつ NORMAL/TENJOU で CZ抽選 (ART中は除外)
    if (bonusFlag === 'none' && (phase === 'NORMAL' || phase === 'TENJOU')) {
      const czProb = RARE_CZ_TABLE[key] || 0;
      if (rng.nextInt(PROB_DENOM) < czProb) czTriggered = true;
    }
  } else if (phase === 'NORMAL' || phase === 'ART' || phase === 'TENJOU') {
    // (F) レア役なし: 直撃保険抽選
    const directTable = BONUS_DIRECT_PROB_TABLE[setting];
    if (directTable) {
      const result = drawFromDistribution(directTable, PROB_DENOM, rng);
      if (result !== 'none') bonusFlag = /** @type {BonusFlag} */ (result);
    }
  }

  // (G) CZ中: 引いた役で ART成功抽選 (ハズレ含む全役)
  let czSuccess = false;
  if (phase === 'CZ') {
    const rerollTable = CZ_REROLL_TABLE[setting];
    if (rerollTable) {
      const key = rareStrength !== null ? `${smallFlag}_${rareStrength}` : smallFlag;
      const prob = rerollTable[key] ?? rerollTable.none ?? 0;
      if (rng.nextInt(PROB_DENOM) < prob) czSuccess = true;
    }
  }

  // (H) TENJOU中: レア役で強制BONUS当選 (BONUS抽選で外れた場合の救済)
  let tenjouForceBonus = false;
  if (phase === 'TENJOU' && bonusFlag === 'none' && rareStrength !== null) {
    bonusFlag = rng.nextInt(10) < 7 ? 'big' : 'reg';
    tenjouForceBonus = true;
  }

  return {
    bonusFlag,
    smallFlag,
    blue7Flag,
    standbyKind: bonusFlag !== 'none' ? bonusFlag : (standbyKind || 'none'),
    rareStrength,
    czTriggered,
    czSuccess,
    tenjouForceBonus,
  };
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
