/**
 * CasinoScreen.js — カジノロビー画面
 *
 * 機能:
 *   - 両替所
 *   - 機種リスト（MVP 1機種）
 *   - 累計統計表示
 *   - 設定モーダル
 *   - 初回チュートリアル
 */

import { EXCHANGE_RATE } from './config.js';
import { SlotScreen } from './slot/SlotScreen.js';
import { SlotSFX, getCasinoSettings, saveCasinoSettings } from './slot/SoundEffects.js';

const TUTORIAL_SEEN_KEY = 'casino_tutorial_seen_v1';

export class CasinoScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('./CasinoManager.js').CasinoManager} manager
   */
  constructor(container, manager) {
    this.container = container;
    this.manager = manager;
    this.el = document.createElement('div');
    this.el.className = 'casino-screen';
    this.currentView = 'lobby';
    this.slotScreen = null;
  }

  render() {
    this.container.appendChild(this.el);
    this._renderLobby();

    // 初回のみチュートリアル
    if (!this._tutorialSeen()) {
      this._showTutorial();
    }
  }

  _tutorialSeen() {
    try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; }
    catch { return true; }
  }
  _markTutorialSeen() {
    try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); }
    catch { /* ignore */ }
  }

  _renderLobby() {
    if (this.slotScreen) {
      this.slotScreen.destroy();
      this.slotScreen = null;
    }
    this.currentView = 'lobby';
    this.el.innerHTML = '';

    const medals = this.manager.getMedals();
    const gold = this.manager.inventory?.gold ?? 0;
    const setting = this.manager.getCurrentSetting();
    const stats = this.manager.state.lifetimeStats;
    const lifetimeKW = stats.totalBet > 0 ? (stats.totalPayout / stats.totalBet * 100) : 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'casino-lobby';
    wrapper.innerHTML = `
      <div class="casino-lobby-header">
        <div>
          <h2 class="casino-lobby-title">🎰 錬金賭博場</h2>
          <p class="casino-lobby-subtitle">実験的機能 — ゲーム本編とは別軸の娯楽</p>
        </div>
        <button type="button" class="casino-btn casino-btn-secondary" data-action="settings">⚙ 設定</button>
      </div>

      <div class="casino-balances">
        <div class="casino-balance-row">
          <span class="casino-balance-label">💰 ゴールド</span>
          <span class="casino-balance-value" id="casino-gold">${gold}G</span>
        </div>
        <div class="casino-balance-row">
          <span class="casino-balance-label">🪙 メダル</span>
          <span class="casino-balance-value" id="casino-medals">${medals}</span>
        </div>
      </div>

      <div class="casino-exchange-panel">
        <h3>両替所</h3>
        <p class="casino-exchange-rate">レート: 1G = ${EXCHANGE_RATE.goldToMedal}メダル（手数料${EXCHANGE_RATE.fee}%、最小${EXCHANGE_RATE.minExchange}単位）</p>
        <div class="casino-exchange-controls">
          <button type="button" class="casino-btn" data-action="gold-to-medals" data-amount="100">+100メダル</button>
          <button type="button" class="casino-btn" data-action="gold-to-medals" data-amount="500">+500メダル</button>
          <button type="button" class="casino-btn" data-action="gold-to-medals" data-amount="1000">+1000メダル</button>
          <button type="button" class="casino-btn casino-btn-secondary" data-action="medals-to-gold" data-amount="100">100メダル→G</button>
          <button type="button" class="casino-btn casino-btn-secondary" data-action="medals-to-gold" data-amount="500">500メダル→G</button>
          <button type="button" class="casino-btn casino-btn-secondary" data-action="medals-to-gold-all">全額戻す</button>
        </div>
      </div>

      <div class="casino-machines-panel">
        <h3>機種</h3>
        <div class="casino-machines-list">
          <button type="button" class="casino-machine-card is-playable" data-action="open-slot">
            <span class="casino-machine-name">🎰 賢者の石を求めて</span>
            <span class="casino-machine-status">A+ART機</span>
          </button>
          <div class="casino-machine-card casino-machine-soon">
            <span class="casino-machine-name">(Coming Soon) 2号機</span>
            <span class="casino-machine-status">未実装</span>
          </div>
        </div>
      </div>

      <div class="casino-stats-panel">
        <h3>累計成績</h3>
        <div class="casino-stats-grid">
          <div class="casino-stat-cell">
            <span class="casino-stat-label">累計BET</span>
            <span class="casino-stat-value">${stats.totalBet.toLocaleString()}枚</span>
          </div>
          <div class="casino-stat-cell">
            <span class="casino-stat-label">累計払出</span>
            <span class="casino-stat-value">${stats.totalPayout.toLocaleString()}枚</span>
          </div>
          <div class="casino-stat-cell">
            <span class="casino-stat-label">機械割</span>
            <span class="casino-stat-value ${lifetimeKW >= 100 ? 'is-positive' : 'is-negative'}">${lifetimeKW.toFixed(1)}%</span>
          </div>
          <div class="casino-stat-cell">
            <span class="casino-stat-label">BIG / REG</span>
            <span class="casino-stat-value">${stats.bigCount} / ${stats.regCount}</span>
          </div>
          <div class="casino-stat-cell">
            <span class="casino-stat-label">ART</span>
            <span class="casino-stat-value">${stats.artCount}回</span>
          </div>
          <div class="casino-stat-cell">
            <span class="casino-stat-label">収支</span>
            <span class="casino-stat-value ${(stats.totalPayout - stats.totalBet) >= 0 ? 'is-positive' : 'is-negative'}">
              ${stats.totalPayout - stats.totalBet >= 0 ? '+' : ''}${(stats.totalPayout - stats.totalBet).toLocaleString()}枚
            </span>
          </div>
        </div>
      </div>

      <p class="casino-debug-note">
        ※ 開発者モード表示中（localStorage.casino_visible or ?casino=1）<br>
        今日の設定: ${setting}（日付ベースで自動決定）
      </p>
    `;
    this.el.appendChild(wrapper);

    wrapper.querySelectorAll('[data-action="gold-to-medals"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = Number(btn.getAttribute('data-amount'));
        if (this.manager.exchangeGoldToMedals(amount)) {
          SlotSFX.exchange();
          this._refreshBalances();
        }
      });
    });

    wrapper.querySelectorAll('[data-action="medals-to-gold"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = Number(btn.getAttribute('data-amount'));
        if (this.manager.exchangeMedalsToGold(amount)) {
          SlotSFX.exchange();
          this._refreshBalances();
        }
      });
    });

    const allBackBtn = wrapper.querySelector('[data-action="medals-to-gold-all"]');
    if (allBackBtn) {
      allBackBtn.addEventListener('click', () => {
        const total = this.manager.getMedals();
        if (total > 0 && this.manager.exchangeMedalsToGold(total)) {
          SlotSFX.exchange();
          this._refreshBalances();
        }
      });
    }

    const openSlot = wrapper.querySelector('[data-action="open-slot"]');
    if (openSlot) {
      openSlot.addEventListener('click', () => this._openSlot());
    }

    const settingsBtn = wrapper.querySelector('[data-action="settings"]');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this._showSettings());
    }
  }

  _openSlot() {
    this.currentView = 'slot';
    this.el.innerHTML = '';
    this.slotScreen = new SlotScreen(this.el, this.manager, () => this._renderLobby());
    this.slotScreen.render();
  }

  _refreshBalances() {
    const goldEl = this.el.querySelector('#casino-gold');
    const medalsEl = this.el.querySelector('#casino-medals');
    if (goldEl) goldEl.textContent = `${this.manager.inventory?.gold ?? 0}G`;
    if (medalsEl) medalsEl.textContent = `${this.manager.getMedals()}`;
  }

  _showSettings() {
    const settings = getCasinoSettings();
    const modal = document.createElement('div');
    modal.className = 'casino-modal-backdrop';
    modal.innerHTML = `
      <div class="casino-modal">
        <h3>カジノ設定</h3>
        <label class="casino-modal-field">
          <input type="checkbox" data-field="soundEnabled" ${settings.soundEnabled ? 'checked' : ''} />
          効果音を有効にする
        </label>
        <label class="casino-modal-field">
          <input type="checkbox" data-field="skipAnimations" ${settings.skipAnimations ? 'checked' : ''} />
          アニメーションスキップ（高速）
        </label>
        <label class="casino-modal-field casino-modal-field-range">
          <span>AUTO速度 (ms間隔)</span>
          <input type="range" min="100" max="2000" step="100" value="${settings.autoDelay}" data-field="autoDelay" />
          <span class="casino-modal-value" data-value="autoDelay">${settings.autoDelay}ms</span>
        </label>
        <div class="casino-modal-actions">
          <button type="button" class="casino-btn" data-action="save">保存</button>
          <button type="button" class="casino-btn casino-btn-secondary" data-action="close">閉じる</button>
        </div>
      </div>
    `;
    this.el.appendChild(modal);

    modal.querySelector('[data-field="autoDelay"]').addEventListener('input', (e) => {
      const val = e.target.value;
      const disp = modal.querySelector('[data-value="autoDelay"]');
      if (disp) disp.textContent = `${val}ms`;
    });

    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const next = { ...settings };
      modal.querySelectorAll('[data-field]').forEach(el => {
        const field = el.getAttribute('data-field');
        if (el.type === 'checkbox') next[field] = el.checked;
        else if (el.type === 'range') next[field] = Number(el.value);
      });
      saveCasinoSettings(next);
      modal.remove();
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  _showTutorial() {
    const modal = document.createElement('div');
    modal.className = 'casino-modal-backdrop';
    modal.innerHTML = `
      <div class="casino-modal casino-tutorial">
        <h3>🎰 錬金賭博場 へようこそ</h3>
        <ol>
          <li>両替所でゴールドをメダルに換えて遊戯を始めます（1G = 1メダル）</li>
          <li>3枚掛け固定で、ボーナスやARTを狙います</li>
          <li>赤7揃い=BIG、赤赤青=REG。ボーナス中に青7が揃うとART確定</li>
          <li>ART中にボーナスを引くと＋100G上乗せで大連チャンのチャンス</li>
          <li>遊戯を止めるときは両替所で全額ゴールドに戻せます</li>
        </ol>
        <p class="casino-tutorial-note">長期的には機械割が100%前後に収束するよう設計されています。本編ゴールドを賭けるかどうかは、あなたの判断で。</p>
        <div class="casino-modal-actions">
          <button type="button" class="casino-btn" data-action="close">わかった</button>
        </div>
      </div>
    `;
    this.el.appendChild(modal);
    modal.querySelector('[data-action="close"]').addEventListener('click', () => {
      this._markTutorialSeen();
      modal.remove();
    });
  }

  destroy() {
    if (this.slotScreen) this.slotScreen.destroy();
    this.el.remove();
  }
}
