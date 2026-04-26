/**
 * SlotSessionState.js — 1スロットセッション中のephemeral state
 *
 * セーブしない（セッション終了で破棄）。
 */

/** @typedef {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} Phase */
/** @typedef {'big'|'reg'|null} BonusKind */

export class SlotSessionState {
  constructor() {
    /** @type {Phase} */
    this.phase = 'NORMAL';

    /** 通常時（NORMAL）からのゲーム数（天井判定用） */
    this.normalGameCount = 0;

    /** BONUS内部成立後、揃える待ちのBONUS種別 */
    /** @type {BonusKind} */
    this.standbyBonusKind = null;

    /** BONUS消化中のBONUS種別 */
    /** @type {BonusKind} */
    this.bonusKind = null;

    /** BONUS残りゲーム数 */
    this.bonusGamesRemaining = 0;

    /** BONUS中に青7揃いが成立したか */
    this.blue7Succeeded = false;

    /** BONUS突入直前のphase（復帰判定用） */
    /** @type {Phase|null} */
    this.resumePhase = null;

    /** ART残りゲーム数 */
    this.artGamesRemaining = 0;

    /** ARTストック数 */
    this.artStocks = 0;

    /** ZENCHO（前兆）残りゲーム数 */
    this.zenchoGamesRemaining = 0;

    /** ZENCHO突入時に確定済の当選種別 — 前兆消化終了後の遷移先 */
    /** @type {'bonus'|'cz'|null} */
    this.pendingResult = null;

    /** ZENCHO中に確定済のBONUS種別 (pendingResult==='bonus' のとき) */
    /** @type {'big'|'reg'|null} */
    this.pendingBonusKind = null;

    /** CZ（チャンスゾーン）残りゲーム数 */
    this.czGamesRemaining = 0;

    /** 現BONUSの累計払い出し枚数（bonus_start でリセット、BONUS終了後も次回開始までは前回値を保持） */
    this.bonusGainTotal = 0;

    /** 現ART区間の累計純増枚数（art_start でリセット、ストック消化や復帰では維持） */
    this.artGainTotal = 0;

    /** 統計用カウンタ（セッション中のみ） */
    this.stats = {
      gamesPlayed: 0,
      totalBet: 0,
      totalPayout: 0,
      bigCount: 0,
      regCount: 0,
      artCount: 0,
      zenchoCount: 0,
      czCount: 0,
      tenjouCount: 0,
    };
  }

  getKikaiwari() {
    if (this.stats.totalBet === 0) return 0;
    return (this.stats.totalPayout / this.stats.totalBet) * 100;
  }
}
