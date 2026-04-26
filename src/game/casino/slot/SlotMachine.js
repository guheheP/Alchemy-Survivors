/**
 * SlotMachine.js — スロット機械全体の統括
 *
 * 1スピンの処理:
 *   1. BET消費
 *   2. 内部抽選（SlotEngine.drawFlags）
 *   3. リール停止形計算（ReelController.computeStopFrame）
 *   4. 払い戻し判定
 *   5. ART中のレア小役で上乗せ抽選
 *   6. 状態遷移（StateMachine.transition）
 */

import { drawFlags, drawUpsell } from './SlotEngine.js';
import { computeStopFrame } from './ReelController.js';
import { transition } from './StateMachine.js';
import { PAYOUTS, ART_PAYOUTS, BONUS_PAYOUT_PER_GAME } from '../data/payouts.js';
import { BET_PER_GAME } from '../config.js';
import { Rng } from '../util/rng.js';
import { SlotSessionState } from '../state/SlotSessionState.js';
import { isNavRole, pickNavOrder, isOrderMatched } from '../data/navigation.js';

/**
 * @typedef {Object} SpinResult
 * @property {boolean} ok
 * @property {import('./ReelController.js').StopFrame} [frame]
 * @property {number[]} [stopIndexes]
 * @property {import('./ReelController.js').Payline|null} [winLine]
 * @property {{col:number,row:number}[]} [winCells]
 * @property {number} [payout]
 * @property {number} [upsellGames]
 * @property {import('./SlotEngine.js').DrawResult} [flags]
 * @property {import('./StateMachine.js').TransitionEvent[]} [events]
 * @property {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} [phase]
 * @property {number[]|null} [navOrder] - ART中の押し順ナビ（左=0/中=1/右=2）。該当なしはnull
 * @property {string} [error]
 */

export class SlotMachine {
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
    this.state = new SlotSessionState();
  }

  /** @returns {SpinResult} */
  spin() {
    if (this.getMedals() < BET_PER_GAME) {
      return { ok: false, error: 'メダル不足' };
    }

    this.addMedals(-BET_PER_GAME);
    this.state.stats.totalBet += BET_PER_GAME;
    this.state.stats.gamesPlayed++;

    const setting = this.getSetting();
    const flags = drawFlags(
      this.state.phase,
      this.state.standbyBonusKind,
      this.state.bonusKind,
      setting,
      this.rng,
    );
    const stopResult = computeStopFrame(
      flags,
      this.state.phase,
      this.state.standbyBonusKind,
      this.rng,
    );
    const { frame, stopIndexes, winLine, winCells, bonusSymbolsAligned, blue7Aligned } = stopResult;

    // 押し順ナビ: ART中のベル/リプレイで抽選
    let navOrder = null;
    if (this.state.phase === 'ART' && isNavRole(flags.smallFlag)) {
      navOrder = pickNavOrder(this.rng);
    }

    // 払い戻し（ART中ナビ対象役は「ナビ通り押した想定」で先払い。
    // 外した場合は finalizeSpin で差分を返金方向に調整）
    const payout = this._calculatePayout(flags, this.state.phase);
    if (payout > 0) {
      this.addMedals(payout);
      this.state.stats.totalPayout += payout;
    }

    // 演出表示用の区間別獲得トラッキング
    if (this.state.phase === 'BONUS') {
      this.state.bonusGainTotal += payout;
    }
    // ART区間 (ART本編 + ART中に発生したBONUS_STANDBY/BONUS) の差枚 (払い出し - 投入)
    const inArtSession = (
      this.state.phase === 'ART' ||
      ((this.state.phase === 'BONUS' || this.state.phase === 'BONUS_STANDBY') &&
        this.state.resumePhase === 'ART')
    );
    if (inArtSession) {
      this.state.artGainTotal += (payout - BET_PER_GAME);
    }

    // ART中のレア小役で上乗せ抽選
    let upsellGames = 0;
    if (this.state.phase === 'ART' && (flags.smallFlag === 'watermelon' || flags.smallFlag === 'cherry' || flags.smallFlag === 'chance')) {
      upsellGames = drawUpsell(flags.smallFlag, this.rng);
      if (upsellGames > 0) {
        this.state.artGamesRemaining += upsellGames;
      }
    }

    // 状態遷移 — ZENCHO の結果は突入時に確定済 (state.pendingResult)
    const events = transition(this.state, { flags, bonusSymbolsAligned, blue7Aligned }, this.rng);

    return {
      ok: true,
      frame,
      stopIndexes,
      winLine,
      winCells,
      payout,
      upsellGames,
      flags,
      events,
      phase: this.state.phase,
      navOrder,
    };
  }


  /**
   * ARTナビ成否の後処理: プレイヤーの実際の押し順と期待順を比較し、
   * 外していたら ART_PAYOUTS → PAYOUTS の差分を没収（取りこぼし扱い）。
   * @param {SpinResult} result
   * @param {number[]} actualOrder - 実際の押し順
   * @returns {{ matched: boolean, refund: number }}
   */
  finalizeNav(result, actualOrder) {
    if (!result || !result.navOrder || !actualOrder) return { matched: true, refund: 0 };
    const matched = isOrderMatched(result.navOrder, actualOrder);
    if (matched) return { matched: true, refund: 0 };

    // 外した場合: ART_PAYOUTS と PAYOUTS の差分を没収
    const flag = result.flags?.smallFlag;
    const artPay = flag === 'bell' ? ART_PAYOUTS.BELL : (flag === 'replay' ? ART_PAYOUTS.REPLAY : 0);
    const basePay = flag === 'bell' ? PAYOUTS.BELL : (flag === 'replay' ? PAYOUTS.REPLAY : 0);
    const refund = artPay - basePay;
    if (refund > 0) {
      this.addMedals(-refund);
      this.state.stats.totalPayout -= refund;
    }
    return { matched: false, refund };
  }

  /**
   * @param {import('./SlotEngine.js').DrawResult} flags
   * @param {'NORMAL'|'BONUS_STANDBY'|'BONUS'|'ART'} phase
   * @returns {number}
   */
  _calculatePayout(flags, phase) {
    if (phase === 'BONUS') {
      const kind = this.state.bonusKind;
      if (kind === 'big') return BONUS_PAYOUT_PER_GAME.BIG;
      if (kind === 'reg') return BONUS_PAYOUT_PER_GAME.REG;
      return 0;
    }

    // BONUS_STANDBY中はボーナス図柄を強制表示するため、小役払い出しはしない
    if (phase === 'BONUS_STANDBY') return 0;

    const table = phase === 'ART' ? ART_PAYOUTS : PAYOUTS;
    switch (flags.smallFlag) {
      case 'bell':       return table.BELL;
      case 'watermelon': return table.WATERMELON;
      case 'cherry':     return table.CHERRY;
      case 'replay':     return table.REPLAY;
      case 'chance':     return 0;
      case 'reachme':    return 0;
      default:           return 0;
    }
  }
}
