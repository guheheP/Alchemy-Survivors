/**
 * CasinoManager.js — カジノ機能全体のライフサイクル管理
 *
 * シングルトン。main.js から init/serialize/hydrate、HubManager から mountLobby が呼ばれる。
 * ゴールドの入出金のみが本体との接点（InventorySystem.addGold / spendGold 経由）。
 */

import { CasinoState } from './state/CasinoState.js';
import { pickDailySetting, getTodayString } from './util/dailySetting.js';
import { CasinoScreen } from './CasinoScreen.js';
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
    // 設定を日付で確定（まだ未決定の場合のみ）
    this._refreshDailySetting();
  }

  /**
   * 日付が変わっていたら設定を再抽選
   */
  _refreshDailySetting() {
    const today = getTodayString();
    if (this.state.lastSettingDate !== today) {
      this.state.currentSetting = pickDailySetting(today);
      this.state.lastSettingDate = today;
    }
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
    // ロード後も日付チェック
    this._refreshDailySetting();
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
   * ゴールドをメダルに両替
   * @param {number} goldAmount
   * @returns {boolean} 成功したか
   */
  exchangeGoldToMedals(goldAmount) {
    if (!this.inventory) return false;
    if (!Number.isFinite(goldAmount) || goldAmount <= 0) return false;
    if (!this.inventory.spendGold(goldAmount)) return false;
    this.state.medals += goldAmount;
    this._requestSave();
    return true;
  }

  /**
   * メダルをゴールドに両替
   * @param {number} medalAmount
   * @returns {boolean} 成功したか
   */
  exchangeMedalsToGold(medalAmount) {
    if (!this.inventory) return false;
    if (!Number.isFinite(medalAmount) || medalAmount <= 0) return false;
    if (this.state.medals < medalAmount) return false;
    this.state.medals -= medalAmount;
    this.inventory.addGold(medalAmount);
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
   * スロット退出時（ロビーへ戻る）に呼ばれる
   * セッション統計をlifetimeStatsに集計してセーブ要求
   * @param {import('./state/SlotSessionState.js').SlotSessionState} session
   */
  finalizeSession(session) {
    if (!session) return;
    this.state.lifetimeStats.totalBet += session.stats.totalBet;
    this.state.lifetimeStats.totalPayout += session.stats.totalPayout;
    this.state.lifetimeStats.bigCount += session.stats.bigCount;
    this.state.lifetimeStats.regCount += session.stats.regCount;
    this.state.lifetimeStats.artCount += session.stats.artCount || 0;
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
