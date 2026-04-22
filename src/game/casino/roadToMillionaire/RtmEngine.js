/**
 * RtmEngine.js — Road to Millionaire の抽選コア
 *
 * 1スピン内の処理順序:
 *   1. 小役抽選 (phase別、setting共通)
 *   2. レア役成立なら ModeManager でモード昇格抽選
 *   3. 新モード × レア役で AT当選抽選
 *   4. AT当選なら ストック個数抽選
 *   5. phase===AT中のレア役なら 上乗せストック抽選
 */

import {
  RTM_SMALLROLE_PROB_TABLE,
  RTM_AT_DRAW_TABLE,
  RTM_AT_STOCK_ON_HIT_TABLE,
  RTM_AT_UPSELL_STOCK_TABLE,
  RTM_PROB_DENOM,
} from './data/rtmProbabilities.js';
import { drawFromDistribution } from '../util/rng.js';

/** @typedef {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} RtmPhase */
/** @typedef {'normal'|'chance'|'heaven'|'super_heaven'} RtmMode */
/** @typedef {'bell'|'watermelon'|'cherry'|'chance'|'replay'|'none'} RtmSmallFlag */

/**
 * @typedef {Object} RtmDrawResult
 * @property {RtmSmallFlag} smallFlag
 * @property {RtmMode} newMode             - 昇格抽選後の新モード (変化なしは同じ)
 * @property {boolean} modeUpped            - モードが上がったか
 * @property {boolean} atHit                - AT当選したか
 * @property {number} atStocksOnHit         - AT当選時付与ストック数 (0〜10)
 * @property {number} atUpsellStocks        - AT中レア役で得た追加ストック (0〜5)
 */

/** @type {Record<RtmPhase, string>} */
const PHASE_TO_TABLE_KEY = {
  NORMAL:     'normal',
  AT_STANDBY: 'at_standby',
  AT:         'at',
  TENJOU:     'tenjou',
};

/**
 * weight配列からアイテムを1つ抽選する汎用ヘルパ。
 * @param {number[]} values
 * @param {number[]} weights
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number}
 */
function drawFromWeights(values, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return values[0];
  const r = rng.nextInt(total);
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r < cum) return values[i];
  }
  return values[values.length - 1];
}

/**
 * 1ゲーム分の内部抽選を実行。モード昇格抽選まで含めて完結させる。
 *
 * @param {RtmPhase} phase
 * @param {RtmMode} currentMode
 * @param {1|2|3|4|5|6} setting
 * @param {import('../util/rng.js').Rng} rng
 * @param {import('./RtmModeManager.js').RtmModeManager} modeManager
 * @returns {RtmDrawResult}
 */
export function drawFlags(phase, currentMode, setting, rng, modeManager) {
  // (1) 小役抽選
  const phaseKey = PHASE_TO_TABLE_KEY[phase] || 'normal';
  const smallTable = RTM_SMALLROLE_PROB_TABLE[setting][phaseKey];
  const smallFlag = /** @type {RtmSmallFlag} */ (drawFromDistribution(smallTable, RTM_PROB_DENOM, rng));

  // (2) レア役ならモード昇格抽選
  let newMode = currentMode;
  let modeUpped = false;
  const isRare = (smallFlag === 'cherry' || smallFlag === 'watermelon' || smallFlag === 'chance');
  // NORMAL/TENJOU/AT_STANDBY中のみモード昇格。AT中はmodeは意味を持たない（AT中は上乗せに集中）
  if (isRare && (phase === 'NORMAL' || phase === 'TENJOU' || phase === 'AT_STANDBY')) {
    newMode = modeManager.drawModeUp(currentMode, /** @type {'cherry'|'watermelon'|'chance'} */ (smallFlag));
    modeUpped = newMode !== currentMode;
  }

  // (3) AT当選抽選 (NORMAL/TENJOU中のみ。AT_STANDBY/AT中は抽選しない)
  //
  // 重要: AT抽選は「現モード」(currentMode)で行う。昇格後の新モードで即AT判定する
  // と「レア1回で正体→天国→AT確定」のコンボが成立して出玉が暴走する。
  // ミリオンゴッド実機と同じく、モード昇格は未来のスピンへの仕込み、AT当選判定は
  // 今のモードで、という分離を守る。
  let atHit = false;
  let atStocksOnHit = 0;
  if (phase === 'NORMAL' || phase === 'TENJOU') {
    const atTable = RTM_AT_DRAW_TABLE[currentMode];
    if (atTable) {
      const threshold = atTable[smallFlag] || 0;
      if (threshold > 0 && rng.nextInt(RTM_PROB_DENOM) < threshold) {
        atHit = true;
        const stockTable = RTM_AT_STOCK_ON_HIT_TABLE[currentMode];
        if (stockTable) {
          atStocksOnHit = drawFromWeights(stockTable.stocks, stockTable.weights, rng);
        }
      }
    }
  }

  // (4) AT中レア役で上乗せストック抽選
  let atUpsellStocks = 0;
  if (phase === 'AT' && isRare) {
    const upsellTable = RTM_AT_UPSELL_STOCK_TABLE[/** @type {'cherry'|'watermelon'|'chance'} */ (smallFlag)];
    if (upsellTable) {
      atUpsellStocks = drawFromWeights(upsellTable.stocks, upsellTable.weights, rng);
    }
  }

  return {
    smallFlag,
    newMode,
    modeUpped,
    atHit,
    atStocksOnHit,
    atUpsellStocks,
  };
}
