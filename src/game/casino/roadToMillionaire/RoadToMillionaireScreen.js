/**
 * RoadToMillionaireScreen.js — Road to Millionaire のUI統括
 *
 * 構造は SlotScreen を踏襲するが、BONUS/ZENCHO/CZ を持たず NORMAL/AT_STANDBY/AT/TENJOU
 * の4フェーズのみのため簡略化。既存の SlotRenderer を RTM用のリール/図柄で初期化。
 */

import { RoadToMillionaireMachine } from './RoadToMillionaireMachine.js';
import { computeStopFrame } from './RtmReelController.js';
import { RtmPixelArtDisplay } from './RtmPixelArtDisplay.js';
import { SlotRenderer } from '../slot/SlotRenderer.js';
import { SlotSFX, getCasinoSettings, applyCasinoSeVolume, resetSeVolumeScale } from '../slot/SoundEffects.js';
import { SoundManager } from '../../core/SoundManager.js';
import { BET_PER_GAME } from '../config.js';
import { RTM_REELS, RTM_REEL_LENGTH } from './data/rtmReels.js';
import { RTM_SYMBOLS } from './data/rtmSymbols.js';
import { RTM_AT_CONSTANTS } from './data/rtmPayouts.js';

export class RoadToMillionaireScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../CasinoManager.js').CasinoManager} manager
   * @param {() => void} onExit
   */
  constructor(container, manager, onExit) {
    this.container = container;
    this.manager = manager;
    this.onExit = onExit;

    this.el = document.createElement('div');
    this.el.className = 'casino-slot-screen casino-rtm-screen';

    this.machine = new RoadToMillionaireMachine({
      getMedals: () => this.manager.getMedals(),
      addMedals: (delta) => {
        if (delta < 0 && this.manager.state.medals + delta < 0) return false;
        this.manager.adjustMedals(delta);
        return true;
      },
      getSetting: () => this.manager.getCurrentSetting(),
    });

    this.renderer = null;
    this.pixelDisplay = null;
    this.spinning = false;
    this.auto = false;
    this._autoTimer = null;
    /** AT終了時に遅延反映する mode 切替情報 */
    this._pendingSummaryTimer = null;

    this._pendingResult = null;
    this._pendingStopIndexes = null;
    this._stoppedReels = [false, false, false];
    this._pressOrderIndex = 0;
    this._actualPressOrder = [];
    this._lastSpinStartAt = 0;
    this._cooldownTimer = null;
    this._autoStopTimers = [];
    this._shakeTimer = null;
  }

  render() {
    this.el.innerHTML = `
      <header class="casino-slot-header">
        <button type="button" class="casino-btn casino-btn-secondary" data-action="back">← ロビーへ</button>
        <div class="casino-slot-phase casino-rtm-phase" data-phase="NORMAL">通常時</div>
      </header>

      <main class="casino-slot-main casino-rtm-main">
        <div class="casino-slot-cabinet casino-rtm-cabinet">
          <!-- 上部大型液晶 (ミリオンゴッド風演出) -->
          <div class="casino-rtm-pixel-display">
            <div class="casino-rtm-pixel-frame"></div>
            <div class="casino-rtm-title-overlay">
              <span class="casino-rtm-title">ROAD TO MILLIONAIRE</span>
            </div>
          </div>

          <div class="casino-slot-middle casino-rtm-middle">
            <div class="casino-slot-reels-wrap">
              <div class="casino-slot-reels-frame casino-rtm-reels-frame">
                <div class="casino-slot-reels-area"></div>
                <div class="casino-slot-effect-layer"></div>
                <div class="casino-slot-nav-overlay" hidden>
                  <div class="casino-slot-nav-arrow" data-nav-pos="0"></div>
                  <div class="casino-slot-nav-arrow" data-nav-pos="1"></div>
                  <div class="casino-slot-nav-arrow" data-nav-pos="2"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="casino-slot-status-panel">
            <div class="casino-slot-status-cell">
              <span class="casino-slot-status-label">CREDIT</span>
              <span class="casino-slot-7seg casino-medals-value">${this._pad(this.manager.getMedals(), 5)}</span>
            </div>
            <div class="casino-slot-status-cell">
              <span class="casino-slot-status-label">PAYOUT</span>
              <span class="casino-slot-7seg casino-slot-gain-7seg">000</span>
            </div>
            <div class="casino-slot-status-cell">
              <span class="casino-slot-status-label">GAME</span>
              <span class="casino-slot-7seg casino-slot-game-7seg">0000</span>
            </div>
            <div class="casino-slot-status-cell casino-slot-bet-lamps">
              <span class="casino-slot-status-label">BET</span>
              <div class="casino-slot-bet-lamps-row">
                <div class="casino-slot-bet-lamp is-on"></div>
                <div class="casino-slot-bet-lamp is-on"></div>
                <div class="casino-slot-bet-lamp is-on"></div>
              </div>
            </div>
          </div>

          <div class="casino-slot-controls">
            <div class="casino-slot-control-left">
              <button type="button" class="casino-slot-lever" data-action="spin" aria-label="レバー"></button>
            </div>
            <div class="casino-slot-stop-buttons">
              <button type="button" class="casino-slot-stop-btn" data-action="stop" data-reel="0" disabled aria-label="ストップ 1"></button>
              <button type="button" class="casino-slot-stop-btn" data-action="stop" data-reel="1" disabled aria-label="ストップ 2"></button>
              <button type="button" class="casino-slot-stop-btn" data-action="stop" data-reel="2" disabled aria-label="ストップ 3"></button>
            </div>
            <div class="casino-slot-control-right">
              <label class="casino-slot-auto">
                <input type="checkbox" data-action="auto" />
                <span>AUTO</span>
              </label>
            </div>
          </div>
        </div>

        <aside class="casino-slot-info">
          <div class="casino-slot-info-row casino-rtm-at-row" hidden>
            <span>AT残り</span>
            <span class="casino-rtm-at-left">—</span>
          </div>
          <div class="casino-slot-info-row casino-rtm-stock-row" hidden>
            <span>ストック</span>
            <span class="casino-rtm-stock">0</span>
          </div>
          <div class="casino-slot-info-row casino-rtm-set-row" hidden>
            <span>連荘</span>
            <span class="casino-rtm-set">0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>今回獲得</span>
            <span class="casino-slot-gain">0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>セッション</span>
            <span class="casino-slot-session">±0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>AT回数</span>
            <span class="casino-rtm-at-count">0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>天井</span>
            <span class="casino-rtm-tenjou">0 / 1500</span>
          </div>
        </aside>
      </main>
    `;
    this.container.appendChild(this.el);

    SoundManager.setSeNodeBudget?.(20);
    applyCasinoSeVolume();

    const reelsArea = this.el.querySelector('.casino-slot-reels-area');
    this.renderer = new SlotRenderer(reelsArea, {
      reels: RTM_REELS,
      reelLength: RTM_REEL_LENGTH,
      symbols: RTM_SYMBOLS,
      className: 'casino-slot-reels casino-rtm-reels',
    });
    this.renderer.render();

    // 上部大型液晶の初期化
    const pixelFrame = this.el.querySelector('.casino-rtm-pixel-frame');
    if (pixelFrame) {
      this.pixelDisplay = new RtmPixelArtDisplay(pixelFrame);
      this.pixelDisplay.setStats({
        normalGameCount: this.machine.state.normalGameCount,
        tenjouGames: RTM_AT_CONSTANTS.TENJOU_GAMES,
      });
      this.pixelDisplay.start();
    }

    this.el.querySelector('[data-action="back"]').addEventListener('click', () => {
      this._stopAuto();
      // finalizeSession は destroy() 側で1度だけ呼ぶ (二重集計を避ける)
      if (this.onExit) this.onExit();
    });
    this.el.querySelector('[data-action="spin"]').addEventListener('click', () => this._onSpinClick());
    this.el.querySelectorAll('[data-action="stop"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const reelIdx = Number(btn.getAttribute('data-reel'));
        this._onStopClick(reelIdx);
      });
    });
    this.el.querySelector('[data-action="auto"]').addEventListener('change', (e) => {
      const on = e.target.checked;
      if (on) this._startAuto();
      else this._stopAuto();
    });

    this._keyHandler = (e) => this._onKeyDown(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  _onKeyDown(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    if (!this.el.isConnected) return;
    if (e.repeat) return;

    const now = performance.now();
    const MIN_KEY_INTERVAL = 120;
    if (this._lastKeyAt && now - this._lastKeyAt < MIN_KEY_INTERVAL) return;

    let handled = false;
    const key = e.key;
    const lk = key.toLowerCase();

    if (e.code === 'Space') {
      if (!this.spinning) {
        this._onSpinClick();
        this._pressButton('[data-action="spin"]');
      } else {
        while (this._pressOrderIndex < 3 && this._stoppedReels[this._pressOrderIndex]) {
          this._pressOrderIndex++;
        }
        if (this._pressOrderIndex < 3) {
          const idx = this._pressOrderIndex;
          this._onStopClick(idx);
          this._pressButton(`[data-action="stop"][data-reel="${idx}"]`);
          this._pressOrderIndex++;
        }
      }
      handled = true;
    } else if (key === 'ArrowUp') {
      if (!this.spinning) {
        this._onSpinClick();
        this._pressButton('[data-action="spin"]');
      }
      handled = true;
    } else if (key === 'ArrowLeft') {
      if (this.spinning) {
        this._onStopClick(0);
        this._pressButton('[data-action="stop"][data-reel="0"]');
      }
      handled = true;
    } else if (key === 'ArrowDown') {
      if (this.spinning) {
        this._onStopClick(1);
        this._pressButton('[data-action="stop"][data-reel="1"]');
      }
      handled = true;
    } else if (key === 'ArrowRight') {
      if (this.spinning) {
        this._onStopClick(2);
        this._pressButton('[data-action="stop"][data-reel="2"]');
      }
      handled = true;
    } else if (lk === 'a') {
      const cb = this.el.querySelector('[data-action="auto"]');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      handled = true;
    }
    if (handled) {
      this._lastKeyAt = now;
      e.preventDefault();
    }
  }

  _pressButton(selector) {
    const btn = this.el.querySelector(selector);
    if (!btn) return;
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 120);
  }

  _setStopButtonsEnabled(enabled) {
    this.el.querySelectorAll('[data-action="stop"]').forEach(btn => {
      btn.disabled = !enabled;
    });
  }

  _setLeverEnabled(enabled) {
    const lever = this.el.querySelector('[data-action="spin"]');
    if (lever) lever.disabled = !enabled;
  }

  _onSpinClick() {
    if (this.spinning) return;
    if (this._cooldownRemaining() > 0) return;
    this._spinStart();
  }

  _cooldownRemaining() {
    const MIN_GAME_INTERVAL = 1500;
    if (!this._lastSpinStartAt) return 0;
    const elapsed = performance.now() - this._lastSpinStartAt;
    return Math.max(0, MIN_GAME_INTERVAL - elapsed);
  }

  _onStopClick(reelIdx) {
    if (!this.spinning) return;
    if (this._stoppedReels[reelIdx]) return;
    this._stopReel(reelIdx);
  }

  _startAuto() {
    this.auto = true;
    this._autoLoop();
  }

  _stopAuto() {
    this.auto = false;
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
    this._clearAutoStopTimers();
  }

  async _autoLoop() {
    if (!this.auto) return;
    if (this.manager.getMedals() < BET_PER_GAME) {
      this._stopAuto();
      const autoCb = this.el.querySelector('[data-action="auto"]');
      if (autoCb) autoCb.checked = false;
      return;
    }
    // 長尺演出中は完了まで待つ
    if (this.pixelDisplay?.isBusy()) {
      const remaining = this.pixelDisplay.remainingMs();
      if (remaining > 0) {
        await new Promise(r => setTimeout(r, remaining + 100));
        if (!this.auto) return;
      }
    }
    const cooldown = this._cooldownRemaining();
    if (cooldown > 0) {
      await new Promise(r => setTimeout(r, cooldown));
      if (!this.auto) return;
    }
    this._spinStart(() => {
      if (this.auto) {
        const delay = getCasinoSettings().autoDelay;
        this._autoTimer = setTimeout(() => this._autoLoop(), delay);
      }
    });
  }

  _spinStart(done) {
    this.spinning = true;
    this._stoppedReels = [false, false, false];
    this._pressOrderIndex = 0;
    this._actualPressOrder = [];
    this._hideNavOverlay();
    this._lastSpinStartAt = performance.now();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
    this._setLeverEnabled(false);
    this.renderer.startSpinAll();
    this._updateGainDisplay(null);
    SlotSFX.lever();

    // transition前のphaseを保存 (UI側で停止形を決めるために必要)
    const phaseAtSpin = this.machine.state.phase;
    // at_end 演出用に、AT初当りから今までの連荘累計を記録
    if (phaseAtSpin === 'AT') {
      this._atSetCountAtAtStart = this._atSetCountAtAtStart ?? 0;
    } else {
      this._atSetCountAtAtStart = this.machine.state.stats.atSetCount;
    }
    this._lastAtSetCountBefore = this._atSetCountAtAtStart;

    const result = this.machine.spin();
    if (!result.ok) {
      this.spinning = false;
      this._setLeverEnabled(true);
      if (done) done();
      return;
    }

    // UI側で停止位置を計算 (Machine は計算しないため)
    const stopResult = computeStopFrame(result.flags, phaseAtSpin, this.machine.rng);

    this._pendingResult = result;
    this._pendingStopIndexes = stopResult.stopIndexes;
    this._pendingDone = done;

    this._setStopButtonsEnabled(true);

    if (result.navOrder) this._showNavOverlay(result.navOrder);

    if (this.auto) {
      const settings = getCasinoSettings();
      const spacing = settings.skipAnimations ? 40 : 400;
      const order = result.navOrder || [0, 1, 2];
      this._clearAutoStopTimers();
      for (let i = 0; i < 3; i++) {
        const reelIdx = order[i];
        const tid = setTimeout(() => {
          if (this.spinning && !this._stoppedReels[reelIdx]) this._stopReel(reelIdx);
        }, spacing * (i + 1));
        this._autoStopTimers.push(tid);
      }
    }
  }

  _clearAutoStopTimers() {
    for (const tid of this._autoStopTimers) clearTimeout(tid);
    this._autoStopTimers.length = 0;
  }

  _stopReel(reelIdx) {
    if (!this._pendingResult) return;
    if (this._stoppedReels[reelIdx]) return;
    this._stoppedReels[reelIdx] = true;
    this._actualPressOrder.push(reelIdx);
    this._advanceNavOverlay(this._actualPressOrder.length);

    const stopIndexes = this._pendingStopIndexes;
    if (stopIndexes && stopIndexes.length === 3) {
      this.renderer.stopReelAtIndex(reelIdx, stopIndexes[reelIdx]);
    }
    SlotSFX.reelStop();

    const btn = this.el.querySelector(`[data-action="stop"][data-reel="${reelIdx}"]`);
    if (btn) btn.disabled = true;

    if (this._stoppedReels.every(Boolean)) {
      const settings = getCasinoSettings();
      setTimeout(() => this._onAllReelsStopped(), settings.skipAnimations ? 30 : 150);
    }
  }

  _onAllReelsStopped() {
    const result = this._pendingResult;
    this._pendingResult = null;
    this._pendingStopIndexes = null;
    const done = this._pendingDone;
    this._pendingDone = null;
    if (!result) return;

    if (result.navOrder) {
      const nav = this.machine.finalizeNav(result, this._actualPressOrder);
      if (!nav.matched) {
        result.navMissed = true;
        result.navRefund = nav.refund;
        result.payout = Math.max(0, (result.payout || 0) - nav.refund);
      }
    }
    this._hideNavOverlay();

    this._onSpinFinalized(result);
    this.spinning = false;
    this._setStopButtonsEnabled(false);

    const remaining = this._cooldownRemaining();
    if (remaining > 0) {
      this._cooldownTimer = setTimeout(() => {
        this._setLeverEnabled(true);
        this._cooldownTimer = null;
        if (done) done();
      }, remaining);
    } else {
      this._setLeverEnabled(true);
      if (done) done();
    }
  }

  _pad(n, w) {
    return String(n).padStart(w, '0');
  }

  _onSpinFinalized(result) {
    const medalsEl = this.el.querySelector('.casino-medals-value');
    if (medalsEl) medalsEl.textContent = this._pad(this.manager.getMedals(), 5);

    const gainEl = this.el.querySelector('.casino-slot-gain-7seg');
    if (gainEl) gainEl.textContent = this._pad(result.payout || 0, 3);

    const game7seg = this.el.querySelector('.casino-slot-game-7seg');
    if (game7seg) game7seg.textContent = this._pad(this.machine.state.stats.gamesPlayed, 4);

    const netGain = (result.payout || 0) - BET_PER_GAME;
    this._updateGainDisplay(netGain);

    const sess = this.machine.state.stats.totalPayout - this.machine.state.stats.totalBet;
    const sessEl = this.el.querySelector('.casino-slot-session');
    if (sessEl) {
      sessEl.textContent = (sess >= 0 ? '+' : '') + sess;
      sessEl.classList.toggle('is-positive', sess > 0);
      sessEl.classList.toggle('is-negative', sess < 0);
    }

    const atCountEl = this.el.querySelector('.casino-rtm-at-count');
    if (atCountEl) atCountEl.textContent = String(this.machine.state.stats.atCount);

    const atRow = this.el.querySelector('.casino-rtm-at-row');
    const atLeftEl = this.el.querySelector('.casino-rtm-at-left');
    const showAt = result.phase === 'AT' || this.machine.state.atGamesRemaining > 0;
    if (atRow) atRow.hidden = !showAt;
    if (atLeftEl) atLeftEl.textContent = `${this.machine.state.atGamesRemaining}G`;

    const stockRow = this.el.querySelector('.casino-rtm-stock-row');
    const stockEl = this.el.querySelector('.casino-rtm-stock');
    const stocks = this.machine.state.atStocks;
    if (stockRow) stockRow.hidden = stocks <= 0;
    if (stockEl) stockEl.textContent = String(stocks);

    const setRow = this.el.querySelector('.casino-rtm-set-row');
    const setEl = this.el.querySelector('.casino-rtm-set');
    const setCount = this.machine.state.atSetCount;
    if (setRow) setRow.hidden = setCount <= 0;
    if (setEl) setEl.textContent = String(setCount);

    const tenjouEl = this.el.querySelector('.casino-rtm-tenjou');
    if (tenjouEl) tenjouEl.textContent = `${this.machine.state.normalGameCount} / 1500`;

    const phaseEl = this.el.querySelector('.casino-rtm-phase');
    if (phaseEl) {
      phaseEl.dataset.phase = result.phase;
      phaseEl.textContent = this._phaseLabel(result.phase);
    }

    const cabinet = this.el.querySelector('.casino-rtm-cabinet');
    if (cabinet) cabinet.dataset.phase = result.phase;
    const reelsFrame = this.el.querySelector('.casino-rtm-reels-frame');
    if (reelsFrame) reelsFrame.dataset.phase = result.phase;

    // 液晶に現在の stats を反映
    if (this.pixelDisplay) {
      this.pixelDisplay.setStats({
        atRemaining: this.machine.state.atGamesRemaining,
        atStocks: this.machine.state.atStocks,
        atSetCount: this.machine.state.atSetCount,
        atGainTotal: this.machine.state.atGainTotal,
        normalGameCount: this.machine.state.normalGameCount,
      });
      // フェーズに応じて液晶モードを更新 (at_end時は遅延、詳細は events 処理側で)
      const pendingSummary = (result.events || []).some(e => e.type === 'at_end');
      if (!pendingSummary) {
        this._updateLcdMode(result.phase);
      }
    }

    // レア役でのデジット演出 (AT当選がない場合のみ)
    if (this.pixelDisplay && (result.flags?.smallFlag === 'cherry' ||
        result.flags?.smallFlag === 'watermelon' ||
        result.flags?.smallFlag === 'chance')) {
      const hasBigEvent = (result.events || []).some(e =>
        e.type === 'at_standby_start' || e.type === 'tenjou_hit');
      if (!hasBigEvent) {
        this.pixelDisplay.triggerEvent('rare_reaction', {
          kind: result.flags.smallFlag, priority: 'low',
        });
        // モードupped時は mode_hint と digit_roll
        if (result.flags?.modeUpped) {
          const level = this._modeUpLevel(result.flags.newMode);
          this.pixelDisplay.triggerEvent('mode_hint', { level, priority: 'low' });
          this.pixelDisplay.triggerEvent('digit_roll', {
            finalValues: this._pickDigitHintForMode(result.flags.newMode),
            color: '#ffe040', priority: 'low',
          });
        } else if (result.flags?.smallFlag === 'chance') {
          // chance目はhazureでも "333" 回転演出
          this.pixelDisplay.triggerEvent('digit_roll', {
            finalValues: ['3', '3', '3'], color: '#ff8040', priority: 'low',
          });
        }
      }
    }

    if (result.flags?.smallFlag === 'bell' && result.payout > 0) SlotSFX.bell();
    else if (result.flags?.smallFlag === 'watermelon' && result.payout > 0) SlotSFX.watermelon();
    else if (result.flags?.smallFlag === 'cherry' && result.payout > 0) SlotSFX.cherry();
    else if (result.flags?.smallFlag === 'replay') SlotSFX.replay();
    else if (result.flags?.smallFlag === 'chance' && result.payout === 0) SlotSFX.chanceMoku();

    if (result.navMissed) SlotSFX.czFail();

    if (result.events) {
      for (const ev of result.events) {
        if (ev.type === 'at_standby_start') {
          SlotSFX.bonusInternal('blue7');
          this._shakeCabinet();
          if (this.pixelDisplay) {
            this.pixelDisplay.cancelEvents();
            this.pixelDisplay.setMode('at_standby');
            this.pixelDisplay.triggerEvent('god_arrival', { priority: 'critical' });
            this.pixelDisplay.triggerEvent('digit_preset', {
              values: ['7', '7', '7'], color: '#ffe040', priority: 'high',
            });
          }
        } else if (ev.type === 'at_start') {
          SlotSFX.artStart();
          SoundManager.startCasinoBGM?.('art');
          if (this.pixelDisplay) this.pixelDisplay.setMode('at');
        } else if (ev.type === 'at_stock_consume') {
          SlotSFX.artStockConsume();
          if (this.pixelDisplay) {
            this.pixelDisplay.triggerEvent('battle_continue', {
              stocksRemaining: ev.stocksRemaining ?? 0, priority: 'medium',
            });
          }
        } else if (ev.type === 'at_upsell_stock') {
          SlotSFX.artAdd();
          if (this.pixelDisplay) {
            this.pixelDisplay.triggerEvent('stock_plus', {
              amount: ev.amount ?? 1, priority: 'medium',
            });
            // 大量上乗せ時は "888" digit_preset
            if ((ev.amount ?? 0) >= 5) {
              this.pixelDisplay.triggerEvent('digit_preset', {
                values: ['8', '8', '8'], color: '#ffe040', priority: 'medium',
              });
            }
          }
        } else if (ev.type === 'at_end') {
          SlotSFX.artEnd();
          SoundManager.stopCasinoBGM?.();
          if (this.pixelDisplay) {
            const totalGain = this.machine.state.atGainTotal;
            const setCount = this.machine.state.stats.atSetCount -
              (this._lastAtSetCountBefore || 0);
            this.pixelDisplay.triggerEvent('at_summary', {
              totalGain, setCount: Math.max(1, setCount), priority: 'high',
            });
            // summary終了後に mode を normal へ
            if (this._pendingSummaryTimer) clearTimeout(this._pendingSummaryTimer);
            this._pendingSummaryTimer = setTimeout(() => {
              if (this.pixelDisplay) this.pixelDisplay.setMode('normal');
              this._pendingSummaryTimer = null;
            }, 3600);
          }
        } else if (ev.type === 'tenjou_start') {
          SlotSFX.tenjouStart();
          if (this.pixelDisplay) {
            this.pixelDisplay.setMode('tenjou');
            this.pixelDisplay.triggerEvent('tenjou_warning', { priority: 'medium' });
          }
        } else if (ev.type === 'tenjou_hit') {
          SlotSFX.tenjouHit();
          this._shakeCabinet();
          if (this.pixelDisplay) {
            this.pixelDisplay.triggerEvent('tenjou_rescue', { priority: 'high' });
            this.pixelDisplay.triggerEvent('digit_preset', {
              values: ['7', '7', '7'], color: '#ffe040', priority: 'high',
            });
          }
        } else if (ev.type === 'mode_up' && this.pixelDisplay) {
          // mode_up 単独イベント (レア役チェックとは別経路の冗長)
          const level = this._modeUpLevel(ev.mode);
          this.pixelDisplay.triggerEvent('mode_hint', { level, priority: 'low' });
        }
      }
    }
  }

  /** AT初当り前の連荘カウントを保存して at_summary 用に使う */
  _lastAtSetCountBefore = 0;

  /** 内部モードを示唆レベルに変換 (内部名は外に漏らさない) */
  _modeUpLevel(mode) {
    switch (mode) {
      case 'chance':       return 1;
      case 'heaven':       return 2;
      case 'super_heaven': return 3;
      default:             return 0;
    }
  }

  /** モード到達時にデジットで示唆する数字 */
  _pickDigitHintForMode(mode) {
    switch (mode) {
      case 'chance':       return ['3', '3', '3'];
      case 'heaven':       return ['5', '5', '5'];
      case 'super_heaven': return ['9', '9', '9'];
      default:             return ['1', '1', '1'];
    }
  }

  /** RTM phase → 液晶 mode に変換 */
  _updateLcdMode(phase) {
    if (!this.pixelDisplay) return;
    switch (phase) {
      case 'NORMAL':     this.pixelDisplay.setMode('normal'); break;
      case 'AT_STANDBY': this.pixelDisplay.setMode('at_standby'); break;
      case 'AT':         this.pixelDisplay.setMode('at'); break;
      case 'TENJOU':     this.pixelDisplay.setMode('tenjou'); break;
    }
  }

  _phaseLabel(phase) {
    if (phase === 'NORMAL')     return '通常時';
    if (phase === 'AT_STANDBY') return 'AT確定';
    if (phase === 'AT')         return 'ミリオンAT';
    if (phase === 'TENJOU')     return '天井待機';
    return phase;
  }

  _updateGainDisplay(gain) {
    const el = this.el.querySelector('.casino-slot-gain');
    if (!el) return;
    if (gain === null) {
      el.textContent = '...';
      el.classList.remove('is-positive', 'is-negative');
    } else {
      el.textContent = (gain >= 0 ? '+' : '') + gain;
      el.classList.toggle('is-positive', gain > 0);
      el.classList.toggle('is-negative', gain < 0);
    }
  }

  _showNavOverlay(order) {
    const overlay = this.el.querySelector('.casino-slot-nav-overlay');
    if (!overlay || !order) return;
    overlay.hidden = false;
    const arrows = overlay.querySelectorAll('.casino-slot-nav-arrow');
    arrows.forEach(a => { a.textContent = ''; a.classList.remove('is-active', 'is-done'); });
    for (let seq = 0; seq < order.length; seq++) {
      const reelIdx = order[seq];
      const arrow = arrows[reelIdx];
      if (!arrow) continue;
      arrow.textContent = String(seq + 1);
      if (seq === 0) arrow.classList.add('is-active');
    }
  }

  _advanceNavOverlay(stepCount) {
    const overlay = this.el.querySelector('.casino-slot-nav-overlay');
    if (!overlay || overlay.hidden) return;
    const arrows = overlay.querySelectorAll('.casino-slot-nav-arrow');
    arrows.forEach(a => {
      const seq = Number(a.textContent);
      if (!seq) return;
      if (seq <= stepCount) {
        a.classList.remove('is-active');
        a.classList.add('is-done');
      } else if (seq === stepCount + 1) {
        a.classList.add('is-active');
      }
    });
  }

  _hideNavOverlay() {
    const overlay = this.el.querySelector('.casino-slot-nav-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.querySelectorAll('.casino-slot-nav-arrow').forEach(a => {
      a.textContent = '';
      a.classList.remove('is-active', 'is-done');
    });
  }

  _shakeCabinet() {
    const cabinet = this.el.querySelector('.casino-rtm-cabinet');
    if (!cabinet) return;
    cabinet.classList.remove('is-shaking');
    void cabinet.offsetHeight;
    cabinet.classList.add('is-shaking');
    if (this._shakeTimer) clearTimeout(this._shakeTimer);
    this._shakeTimer = setTimeout(() => {
      cabinet.classList.remove('is-shaking');
      this._shakeTimer = null;
    }, 600);
  }

  destroy() {
    this._stopAuto();
    SoundManager.setSeNodeBudget?.(12);
    resetSeVolumeScale();
    SoundManager.drainCasinoBGM?.();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
    if (this._shakeTimer) { clearTimeout(this._shakeTimer); this._shakeTimer = null; }
    if (this._pendingSummaryTimer) { clearTimeout(this._pendingSummaryTimer); this._pendingSummaryTimer = null; }
    if (this.pixelDisplay) { this.pixelDisplay.destroy(); this.pixelDisplay = null; }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.machine?.state) {
      this.manager.finalizeSession(this.machine.state);
    }
    if (this.renderer) this.renderer.destroy();
    this.el.remove();
  }
}
