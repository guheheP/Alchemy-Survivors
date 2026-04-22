/**
 * CasinoManager.js — カジノ機能全体のライフサイクル管理
 *
 * シングルトン。main.js から init/serialize/hydrate、HubManager から mountLobby が呼ばれる。
 * ゴールドの入出金のみが本体との接点（InventorySystem.addGold / spendGold 経由）。
 */

import { CasinoState } from './state/CasinoState.js';
import { pickRunSetting } from './util/dailySetting.js';
import { CasinoScreen } from './CasinoScreen.js';
import { EXCHANGE_RATE } from './config.js';
import { eventBus } from '../core/EventBus.js';

/**
 * @typedef {import('../InventorySystem.js').InventorySystem} InventorySystem
 */

export class CasinoManager {
  /** @type {CasinoManager|null} */
  static _instance = null;

  static getInstance() {
    if (!this._instance) this._instance = new CasinoManager();
    return this._instance;
  }

  constructor() {
    /** @type {InventorySystem|null} */
    this.inventory = null;
    this.state = new CasinoState();
    /** @type {CasinoScreen|null} */
    this.screen = null;
    this._initialized = false;
  }

  /**
   * 本体から呼ばれる初期化。inventoryへの参照を受け取る。
   * @param {InventorySystem} inventory
   */
  init(inventory) {
    this.inventory = inventory;
    this._initialized = true;
    // ラン完了毎に設定を再抽選
    if (!this._unsubRunComplete) {
      this._unsubRunComplete = eventBus.on('run:complete', () => this._pickNewSetting());
    }
  }

  /**
   * 設定を新規抽選してsave要求を発火する
   */
  _pickNewSetting() {
    this.state.currentSetting = pickRunSetting();
    this._requestSave();
  }

  /**
   * セーブ用のシリアライズ
   * @returns {object|null}
   */
  serialize() {
    if (!this._initialized) return null;
    return this.state.toJSON();
  }

  /**
   * セーブデータから状態を復元
   * @param {object|null|undefined} data
   */
  hydrate(data) {
    this.state.fromJSON(data);
  }

  /**
   * 拠点タブからカジノロビー画面をマウント
   * @param {HTMLElement} container
   * @param {InventorySystem} inventory
   */
  mountLobby(container, inventory) {
    if (!this.inventory) this.inventory = inventory;
    if (this.screen) this.screen.destroy();
    this.screen = new CasinoScreen(container, this);
    this.screen.render();
  }

  // --- 両替API（スロット画面から呼ばれる） ---

  /**
   * ゴールドをメダルに両替（20G = 1メダル、端数のゴールドは消費されない）
   * @param {number} goldAmount - 投入したいゴールド量
   * @returns {boolean} 成功したか
   */
  exchangeGoldToMedals(goldAmount) {
    if (!this.inventory) return false;
    if (!Number.isFinite(goldAmount) || goldAmount <= 0) return false;
    const rate = EXCHANGE_RATE.medalToGold; // 1メダル当たりのゴールド (=20)
    const medalsOut = Math.floor(goldAmount / rate);
    if (medalsOut <= 0) return false;
    const cost = medalsOut * rate;
    if (!this.inventory.spendGold(cost)) return false;
    this.state.medals += medalsOut;
    this._requestSave();
    return true;
  }

  /**
   * メダルをゴールドに両替（1メダル = 20G）
   * @param {number} medalAmount - 払い戻したいメダル数
   * @returns {boolean} 成功したか
   */
  exchangeMedalsToGold(medalAmount) {
    if (!this.inventory) return false;
    if (!Number.isFinite(medalAmount) || medalAmount <= 0) return false;
    const intAmount = Math.floor(medalAmount);
    if (intAmount <= 0) return false;
    if (this.state.medals < intAmount) return false;
    this.state.medals -= intAmount;
    this.inventory.addGold(intAmount * EXCHANGE_RATE.medalToGold);
    this._requestSave();
    return true;
  }

  /**
   * スロット遊技による残高変動（SlotScreen から呼ばれる）
   * @param {number} delta
   */
  adjustMedals(delta) {
    if (!Number.isFinite(delta)) return;
    this.state.medals = Math.max(0, this.state.medals + delta);
  }

  /** 自動セーブ要求を本体に発火 */
  _requestSave() {
    try { eventBus.emit('save:request'); } catch (e) { /* ignore */ }
  }

  /**
   * スロット/RTM 退出時（ロビーへ戻る）に呼ばれる
   * セッション統計をlifetimeStatsに集計してセーブ要求
   * @param {import('./state/SlotSessionState.js').SlotSessionState | import('./roadToMillionaire/state/RtmSessionState.js').RtmSessionState} session
   */
  finalizeSession(session) {
    if (!session) return;
    this.state.lifetimeStats.totalBet += session.stats.totalBet;
    this.state.lifetimeStats.totalPayout += session.stats.totalPayout;

    if (session.machineType === 'roadToMillionaire') {
      // Road to Millionaire: 機種別カウンタへ加算 (BIG/REG は存在しない)
      this.state.lifetimeStats.rtmTotalBet =
        (this.state.lifetimeStats.rtmTotalBet || 0) + session.stats.totalBet;
      this.state.lifetimeStats.rtmTotalPayout =
        (this.state.lifetimeStats.rtmTotalPayout || 0) + session.stats.totalPayout;
      this.state.lifetimeStats.rtmAtCount =
        (this.state.lifetimeStats.rtmAtCount || 0) + (session.stats.atCount || 0);
      this.state.lifetimeStats.rtmAtSetCount =
        (this.state.lifetimeStats.rtmAtSetCount || 0) + (session.stats.atSetCount || 0);
      this.state.lifetimeStats.rtmTenjouCount =
        (this.state.lifetimeStats.rtmTenjouCount || 0) + (session.stats.tenjouCount || 0);
    } else {
      // 既存スロット (machineType 未設定 or 'slot')
      this.state.lifetimeStats.bigCount += session.stats.bigCount || 0;
      this.state.lifetimeStats.regCount += session.stats.regCount || 0;
      this.state.lifetimeStats.artCount += session.stats.artCount || 0;
    }
    this._requestSave();
  }

  /** @returns {number} */
  getMedals() {
    return this.state.medals;
  }

  /** @returns {1|2|3|4|5|6} */
  getCurrentSetting() {
    return this.state.currentSetting;
  }
}
