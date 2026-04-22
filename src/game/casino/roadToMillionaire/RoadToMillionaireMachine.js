/**
 * RoadToMillionaireMachine.js — Road to Millionaire 機械全体の統括
 *
 * 1スピンの処理:
 *   1. BET消費
 *   2. 内部抽選 (RtmEngine.drawFlags — 小役+モード昇格+AT抽選+上乗せを一括)
 *   3. 払い戻し判定 (phase別: 通常=RTM_PAYOUTS, AT=RTM_AT_PAYOUTS)
 *   4. 状態遷移 (RtmStateMachine.transition)
 *
 * UI/停止制御 (computeStopFrame相当) は RoadToMillionaireScreen 側に委譲する。
 */

import { drawFlags } from './RtmEngine.js';
import { transition } from './RtmStateMachine.js';
import { RtmModeManager } from './RtmModeManager.js';
import { RtmSessionState } from './state/RtmSessionState.js';
import { RTM_PAYOUTS, RTM_AT_PAYOUTS } from './data/rtmPayouts.js';
import { BET_PER_GAME } from '../config.js';
import { Rng } from '../util/rng.js';
import { isNavRole, pickNavOrder, isOrderMatched } from '../data/navigation.js';

/**
 * @typedef {Object} RtmSpinResult
 * @property {boolean} ok
 * @property {import('./RtmEngine.js').RtmDrawResult} [flags]
 * @property {number} [payout]
 * @property {number[]|null} [navOrder]    - AT中のナビ押し順 (0=左/1=中/2=右)
 * @property {import('./RtmStateMachine.js').RtmTransitionEvent[]} [events]
 * @property {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} [phase]
 * @property {boolean} [navMissed]         - ナビ取りこぼし (UI層で finalizeNav 呼び出し後に設定)
 * @property {number} [navRefund]
 * @property {string} [error]
 */

export class RoadToMillionaireMachine {
  /**
   * @param {object} opts
   * @param {() => number} opts.getMedals
   * @param {(delta: number) => boolean} opts.addMedals
   * @param {() => (1|2|3|4|5|6)} opts.getSetting
   * @param {Rng} [opts.rng]
   */
  constructor({ getMedals, addMedals, getSetting, rng }) {
    this.getMedals = getMedals;
    this.addMedals = addMedals;
    this.getSetting = getSetting;
    this.rng = rng || new Rng();
    this.state = new RtmSessionState();
    this.modeManager = new RtmModeManager({ rng: this.rng, getSetting });
  }

  /** @returns {RtmSpinResult} */
  spin() {
    if (this.getMedals() < BET_PER_GAME) {
      return { ok: false, error: 'メダル不足' };
    }

    this.addMedals(-BET_PER_GAME);
    this.state.stats.totalBet += BET_PER_GAME;
    this.state.stats.gamesPlayed++;

    const setting = this.getSetting();
    const phaseAtSpin = this.state.phase;
    const flags = drawFlags(phaseAtSpin, this.state.mode, setting, this.rng, this.modeManager);

    // 押し順ナビ (AT中のBELL/REPLAY)
    let navOrder = null;
    if (phaseAtSpin === 'AT' && isNavRole(flags.smallFlag)) {
      navOrder = pickNavOrder(this.rng);
    }

    // 払い戻し (ナビ対象役は「ナビ通り押した」想定で先払い。外した分は finalizeNav で減額)
    const payout = this._calculatePayout(flags, phaseAtSpin);
    if (payout > 0) {
      this.addMedals(payout);
      this.state.stats.totalPayout += payout;
    }
    if (phaseAtSpin === 'AT') {
      this.state.atGainTotal += (payout - BET_PER_GAME);
    }

    // 状態遷移
    const events = transition(
      this.state,
      { flags, modeManager: this.modeManager },
      this.rng,
    );

    return {
      ok: true,
      flags,
      payout,
      navOrder,
      events,
      phase: this.state.phase,
    };
  }

  /**
   * AT中ナビの成否を反映。外していたら差分を没収する。
   * @param {RtmSpinResult} result
   * @param {number[]} actualOrder
   * @returns {{ matched: boolean, refund: number }}
   */
  finalizeNav(result, actualOrder) {
    if (!result || !result.navOrder || !actualOrder) return { matched: true, refund: 0 };
    const matched = isOrderMatched(result.navOrder, actualOrder);
    if (matched) return { matched: true, refund: 0 };

    const flag = result.flags?.smallFlag;
    const atPay =
      flag === 'bell' ? RTM_AT_PAYOUTS.BELL :
      flag === 'replay' ? RTM_AT_PAYOUTS.REPLAY : 0;
    const basePay =
      flag === 'bell' ? RTM_PAYOUTS.BELL :
      flag === 'replay' ? RTM_PAYOUTS.REPLAY : 0;
    const refund = atPay - basePay;
    if (refund > 0) {
      // addMedals が不足時に拒否する可能性があるため、差分を回収できなかった場合は
      // stats側の減算もスキップする。totalPayout が負値にならないように clamp。
      const deducted = this.addMedals(-refund);
      if (deducted !== false) {
        this.state.stats.totalPayout = Math.max(0, this.state.stats.totalPayout - refund);
      }
    }
    return { matched: false, refund };
  }

  /**
   * @param {import('./RtmEngine.js').RtmDrawResult} flags
   * @param {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} phase
   * @returns {number}
   */
  _calculatePayout(flags, phase) {
    const table = (phase === 'AT') ? RTM_AT_PAYOUTS : RTM_PAYOUTS;
    switch (flags.smallFlag) {
      case 'bell':       return table.BELL;
      case 'watermelon': return table.WATERMELON;
      case 'cherry':     return table.CHERRY;
      case 'replay':     return table.REPLAY;
      case 'chance':     return 0;
      case 'none':
      default:           return 0;
    }
  }
}
