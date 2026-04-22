/**
 * RtmStateMachine.js — Road to Millionaire のフェーズ遷移
 *
 * フェーズ: NORMAL / AT_STANDBY / AT / TENJOU
 *
 * 遷移ルール要約:
 *   - NORMAL中のAT当選 → AT_STANDBY (initial set 1 + stocks)
 *   - NORMAL中のnormalGameCount >= TENJOU_GAMES → TENJOU (救済待機)
 *   - TENJOU中のAT当選/強制当選 → AT_STANDBY (+天井ストック付与)
 *   - AT_STANDBY 1〜AT_STANDBY_MAX_GAMES 経過後 → AT (initial set 消化開始)
 *   - AT中 atGamesRemaining <= 0:
 *       stocks > 0 → 次セット開始 (stocks--, atSetCount++)
 *       stocks = 0 → AT終了 → モード移行抽選 → NORMAL
 */

import { RTM_AT_CONSTANTS } from './data/rtmPayouts.js';
import { RTM_TENJOU_STOCK_RANGE } from './data/rtmProbabilities.js';

/** @typedef {import('./state/RtmSessionState.js').RtmSessionState} RtmSessionState */
/** @typedef {import('./RtmEngine.js').RtmDrawResult} RtmDrawResult */

/**
 * @typedef {Object} RtmTransitionEvent
 * @property {'at_standby_start'|'at_set_start'|'at_start'|'at_end'|'at_stock_consume'|'at_upsell_stock'|'mode_up'|'tenjou_start'|'tenjou_hit'} type
 * @property {number} [amount]             - stocks/games delta
 * @property {number} [stocksRemaining]    - 残ストック数
 * @property {string} [mode]               - 昇格後のモード名
 * @property {string} [reason]
 */

/**
 * @typedef {Object} RtmTransitionInput
 * @property {RtmDrawResult} flags
 * @property {import('./RtmModeManager.js').RtmModeManager} modeManager
 */

/**
 * 1ゲーム終了時の状態遷移を実行。
 *
 * @param {RtmSessionState} state
 * @param {RtmTransitionInput} input
 * @param {import('../util/rng.js').Rng} rng
 * @returns {RtmTransitionEvent[]}
 */
export function transition(state, input, rng) {
  /** @type {RtmTransitionEvent[]} */
  const events = [];
  const { flags, modeManager } = input;

  // モード昇格イベントの記録 (演出・デバッグ用)
  if (flags.modeUpped && state.mode !== flags.newMode) {
    events.push({ type: 'mode_up', mode: flags.newMode });
  }
  state.mode = flags.newMode;

  // AT中の上乗せストック
  if (state.phase === 'AT' && flags.atUpsellStocks > 0) {
    state.atStocks += flags.atUpsellStocks;
    events.push({
      type: 'at_upsell_stock',
      amount: flags.atUpsellStocks,
      stocksRemaining: state.atStocks,
    });
  }

  // フェーズ別の遷移処理
  switch (state.phase) {
    case 'NORMAL':
      return handleNormal(state, flags, events);
    case 'TENJOU':
      return handleTenjou(state, flags, events, rng);
    case 'AT_STANDBY':
      return handleAtStandby(state, events);
    case 'AT':
      return handleAt(state, events, modeManager);
    default:
      return events;
  }
}

/**
 * @param {RtmSessionState} state
 * @param {RtmDrawResult} flags
 * @param {RtmTransitionEvent[]} events
 */
function handleNormal(state, flags, events) {
  state.normalGameCount++;

  // AT当選 → AT_STANDBY
  if (flags.atHit) {
    beginAtStandby(state, flags.atStocksOnHit, events);
    return events;
  }

  // 天井到達 → TENJOU に遷移 (救済待機)
  if (state.normalGameCount >= RTM_AT_CONSTANTS.TENJOU_GAMES) {
    state.phase = 'TENJOU';
    state.stats.tenjouCount++;
    events.push({ type: 'tenjou_start' });
  }
  return events;
}

/**
 * TENJOU: このフェーズに入ったら次ゲームで強制AT当選 + 1-8ストック付与。
 * engine側のAT抽選で既に当選していればそのストック数を優先、
 * そうでなければ天井ストックで救済。
 *
 * @param {RtmSessionState} state
 * @param {RtmDrawResult} flags
 * @param {RtmTransitionEvent[]} events
 * @param {import('../util/rng.js').Rng} rng
 */
function handleTenjou(state, flags, events, rng) {
  const tenjouStocks = RTM_TENJOU_STOCK_RANGE.min +
    rng.nextInt(RTM_TENJOU_STOCK_RANGE.max - RTM_TENJOU_STOCK_RANGE.min + 1);

  let totalStocks = tenjouStocks;
  if (flags.atHit && flags.atStocksOnHit > tenjouStocks) {
    totalStocks = flags.atStocksOnHit;
  }
  events.push({ type: 'tenjou_hit', amount: totalStocks });
  beginAtStandby(state, totalStocks, events);
  return events;
}

/**
 * @param {RtmSessionState} state
 * @param {RtmTransitionEvent[]} events
 */
function handleAtStandby(state, events) {
  state.atStandbyGamesRemaining--;

  // GOD揃い想定 (renderer側で引き込み) → AT消化開始
  // 簡略化: AT_STANDBYに入って1G経過で即ATへ遷移
  if (state.atStandbyGamesRemaining <= 0) {
    state.phase = 'AT';
    state.atGamesRemaining = RTM_AT_CONSTANTS.SET_GAMES;
    state.atSetCount = 1;
    state.atGainTotal = 0;
    state.stats.atCount++;
    state.stats.atSetCount++;
    events.push({ type: 'at_start', amount: RTM_AT_CONSTANTS.SET_GAMES });
  }
  return events;
}

/**
 * @param {RtmSessionState} state
 * @param {RtmTransitionEvent[]} events
 * @param {import('./RtmModeManager.js').RtmModeManager} modeManager
 */
function handleAt(state, events, modeManager) {
  state.atGamesRemaining--;

  if (state.atGamesRemaining > 0) return events;

  // 1セット終了: ストックあれば次セット開始、なければAT終了
  if (state.atStocks > 0) {
    state.atStocks--;
    state.atGamesRemaining = RTM_AT_CONSTANTS.SET_GAMES;
    state.atSetCount++;
    state.stats.atSetCount++;
    events.push({
      type: 'at_stock_consume',
      amount: RTM_AT_CONSTANTS.SET_GAMES,
      stocksRemaining: state.atStocks,
    });
    return events;
  }

  // AT完全終了
  state.phase = 'NORMAL';
  state.atGamesRemaining = 0;
  state.atSetCount = 0;
  state.normalGameCount = 0; // 天井カウンタリセット
  state.mode = modeManager.transitionOnAtEnd();
  events.push({ type: 'at_end', mode: state.mode });
  return events;
}

/**
 * AT_STANDBY開始処理 (NORMAL→AT_STANDBY / TENJOU→AT_STANDBY 共通)
 * @param {RtmSessionState} state
 * @param {number} stocksOnHit
 * @param {RtmTransitionEvent[]} events
 */
function beginAtStandby(state, stocksOnHit, events) {
  state.phase = 'AT_STANDBY';
  state.atStandbyGamesRemaining = 1; // 1Gで揃う想定
  state.atStocks = stocksOnHit;
  state.atSetCount = 0;
  state.atGainTotal = 0;
  events.push({
    type: 'at_standby_start',
    amount: 1 + stocksOnHit,
    stocksRemaining: stocksOnHit,
  });
}
