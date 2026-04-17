/**
 * CasinoState.js — カジノ機能の永続state
 *
 * 所持メダル、今日の設定、累計統計を保持する。
 * ART残G数等のエフェメラルな状態はここには含めない（SlotSessionState 側で管理）。
 */

import { CASINO_VERSION } from '../config.js';

/**
 * @typedef {Object} LifetimeStats
 * @property {number} totalBet
 * @property {number} totalPayout
 * @property {number} bigCount
 * @property {number} regCount
 * @property {number} artCount
 */

/**
 * @typedef {Object} CasinoSaveState
 * @property {number} version
 * @property {number} medals
 * @property {string} lastSettingDate
 * @property {1|2|3|4|5|6} currentSetting
 * @property {LifetimeStats} lifetimeStats
 */

const DEFAULT_LIFETIME_STATS = {
  totalBet: 0,
  totalPayout: 0,
  bigCount: 0,
  regCount: 0,
  artCount: 0,
};

export class CasinoState {
  constructor() {
    this.version = CASINO_VERSION;
    this.medals = 0;
    this.lastSettingDate = '';
    /** @type {1|2|3|4|5|6} */
    this.currentSetting = 4;
    this.lifetimeStats = { ...DEFAULT_LIFETIME_STATS };
  }

  /** @returns {CasinoSaveState} */
  toJSON() {
    return {
      version: this.version,
      medals: this.medals,
      lastSettingDate: this.lastSettingDate,
      currentSetting: this.currentSetting,
      lifetimeStats: { ...this.lifetimeStats },
    };
  }

  /**
   * セーブデータから状態を復元
   * @param {Partial<CasinoSaveState>|null|undefined} data
   */
  fromJSON(data) {
    if (!data) return;
    this.version = data.version || CASINO_VERSION;
    this.medals = Number.isFinite(data.medals) ? data.medals : 0;
    this.lastSettingDate = data.lastSettingDate || '';
    this.currentSetting = /** @type {1|2|3|4|5|6} */ (data.currentSetting || 4);
    this.lifetimeStats = {
      ...DEFAULT_LIFETIME_STATS,
      ...(data.lifetimeStats || {}),
    };
  }
}
