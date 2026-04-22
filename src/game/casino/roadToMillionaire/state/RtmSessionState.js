/**
 * RtmSessionState.js — Road to Millionaire の1セッション中 ephemeral state
 *
 * セーブしない（セッション終了で破棄）。統計のみ finalizeSession で lifetimeStats に集計される。
 */

/** @typedef {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} RtmPhase */
/** @typedef {'normal'|'chance'|'heaven'|'super_heaven'} RtmMode */

export class RtmSessionState {
  constructor() {
    /** @type {'roadToMillionaire'} 機種識別子 (CasinoManager.finalizeSession分岐用) */
    this.machineType = 'roadToMillionaire';

    /** @type {RtmPhase} 現在のフェーズ */
    this.phase = 'NORMAL';

    /** @type {RtmMode} 現在の内部モード (プレイヤー非可視) */
    this.mode = 'normal';

    /** NORMAL中のゲーム数 (天井判定用、AT終了時にリセット) */
    this.normalGameCount = 0;

    /** AT_STANDBY 残りゲーム数 */
    this.atStandbyGamesRemaining = 0;

    /** AT残りゲーム数 (現セット内) */
    this.atGamesRemaining = 0;

    /** ATストック数 (次セット以降の権利) */
    this.atStocks = 0;

    /** 現AT区間の累計セット数 (initial含む、表示用) */
    this.atSetCount = 0;

    /** 現AT区間の累計純増枚数 */
    this.atGainTotal = 0;

    /** 天井救済でAT_STANDBY突入する際、初期ストックとして付与される個数 */
    this.tenjouPendingStocks = 0;

    /** 統計用カウンタ (セッション中のみ、finalizeSessionで集計される) */
    this.stats = {
      gamesPlayed: 0,
      totalBet: 0,
      totalPayout: 0,
      /** AT初当り回数 (天井到達含む) */
      atCount: 0,
      /** ATセット消化合計 (連数含む) */
      atSetCount: 0,
      /** 天井到達回数 */
      tenjouCount: 0,
    };
  }

  /** @returns {number} 機械割(%) */
  getKikaiwari() {
    if (this.stats.totalBet === 0) return 0;
    return (this.stats.totalPayout / this.stats.totalBet) * 100;
  }
}
