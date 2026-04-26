/**
 * SlotScreen.js — スロット画面のUI統括
 *
 * ロビーから遷移する。BET/START/STOP ボタンや情報パネルを持ち、
 * SlotMachine（ロジック）と SlotRenderer（描画）を接続する。
 *
 * Phase 1 の簡易仕様:
 *   - STOP1/2/3 はシーケンシャルに押される想定だが、Phase 1 では「START」1つで全リール自動停止
 *   - 順次停止演出（時間差で各リール停止）を段階的に追加していく
 */

import { SlotMachine } from './SlotMachine.js';
import { SlotRenderer } from './SlotRenderer.js';
import { BET_PER_GAME } from '../config.js';
import { SlotSFX, getCasinoSettings, applyCasinoSeVolume, resetSeVolumeScale } from './SoundEffects.js';
import { SoundManager } from '../../core/SoundManager.js';
import { PixelArtDisplay } from './PixelArtDisplay.js';
import { decideYokoku, YOKOKU_DURATION } from './KoyakuManager.js';
import { Rng } from '../util/rng.js';
import { formatOrder } from '../data/navigation.js';

export class SlotScreen {
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
    this.el.className = 'casino-slot-screen';

    this.machine = new SlotMachine({
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

    // 手動停止対応の状態
    /** 現在のspin結果（spin開始時にセット、全リール停止で finalize） */
    this._pendingResult = null;
    /** 各リール停止済みフラグ [0,0,0] → [1,1,1] で finalize */
    this._stoppedReels = [false, false, false];
    /** スペースキー用の押し順カウンタ（0=左, 1=中, 2=右） */
    this._pressOrderIndex = 0;
    /** 今スピンの実際の押し順（reelIdxの配列） */
    this._actualPressOrder = [];
    /** 現在再生中の予告 */
    this._currentYokoku = null;
    /** 前回スピン開始時刻（ゲーム間最小間隔保証用） */
    this._lastSpinStartAt = 0;
    /** クールダウン解除タイマー */
    this._cooldownTimer = null;
    /** AUTO時のリール自動停止タイマー群 */
    this._autoStopTimers = [];
    /** _triggerScreenFlash が発行する setTimeout 群 */
    this._screenFlashTimers = [];
    /** gasuri_fail の deferred タイマー */
    this._gasuriTimer = null;
    /** payout ロール完了後のクリーンアップタイマー */
    this._payoutCleanupTimer = null;
    /** payout ロール中RAF id */
    this._payoutRollRaf = 0;
    /** 筐体シェイクのクリアタイマー */
    this._shakeTimer = null;
    /** ZENCHO 突入時の総G数 (温度上昇正規化用) */
    this._zenchoTotal = 0;
    /** CZ前兆の演出ランク (1=静か / 2=中 / 3=激アツ) — zencho_startで抽選 */
    this._zenchoRank = 1;

    // 予告抽選用RNG（内部抽選とは別系列）
    this._yokokuRng = new Rng(Date.now() & 0xffffffff);
  }

  render() {
    this.el.innerHTML = `
      <header class="casino-slot-header">
        <button type="button" class="casino-btn casino-btn-secondary" data-action="back">← ロビーへ</button>
        <div class="casino-slot-phase" data-phase="NORMAL">通常時</div>
      </header>

      <main class="casino-slot-main">
        <!-- 筐体 -->
        <div class="casino-slot-cabinet">
          <!-- 大きな演出ディスプレイ（ドット絵） -->
          <div class="casino-slot-pixel-display">
            <div class="casino-slot-pixel-frame"></div>
          </div>

          <!-- 中央: リール窓 -->
          <div class="casino-slot-middle">
            <div class="casino-slot-reels-wrap">
              <div class="casino-slot-reels-frame">
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

          <!-- 下部: ステータスパネル -->
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

          <!-- コントロール（実機風: 左=レバー, 中央=STOP×3, 右=AUTO） -->
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

        <!-- セッション情報パネル（筐体外） -->
        <aside class="casino-slot-info">
          <div class="casino-slot-info-row casino-slot-art-row" hidden>
            <span>ART残り</span>
            <span class="casino-slot-art-left">—</span>
          </div>
          <div class="casino-slot-info-row casino-slot-art-stock-row" hidden>
            <span>ARTストック</span>
            <span class="casino-slot-art-stock">0</span>
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
            <span>BIG</span>
            <span class="casino-slot-big-count">0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>REG</span>
            <span class="casino-slot-reg-count">0</span>
          </div>
          <div class="casino-slot-info-row">
            <span>ART</span>
            <span class="casino-slot-art-count">0</span>
          </div>
        </aside>
      </main>
    `;
    this.container.appendChild(this.el);

    // スロット画面中はSE同時発音数を拡張 (AUTO連打でも欠落しないように)
    SoundManager.setSeNodeBudget?.(20);
    // カジノSE音量スケールを適用
    applyCasinoSeVolume();

    const reelsArea = this.el.querySelector('.casino-slot-reels-area');
    this.renderer = new SlotRenderer(reelsArea);
    this.renderer.render();

    // ドット絵演出ディスプレイ
    const pixelFrame = this.el.querySelector('.casino-slot-pixel-frame');
    if (pixelFrame) {
      this.pixelDisplay = new PixelArtDisplay(pixelFrame);
      this.pixelDisplay.start();
    }

    this.el.querySelector('[data-action="back"]').addEventListener('click', () => {
      this._stopAuto();
      this.manager.finalizeSession(this.machine.state);
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
      const on = /** @type {HTMLInputElement} */ (e.target).checked;
      if (on) this._startAuto();
      else this._stopAuto();
    });

    // キーボード操作
    this._keyHandler = (e) => this._onKeyDown(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  /**
   * キーボード入力処理
   * Space    = スマートボタン: 停止中ならレバー、回転中なら押し順停止
   * ↑        = レバー（START）
   * ←        = STOP1（左リール）
   * ↓        = STOP2（中リール）
   * →        = STOP3（右リール）
   * A        = AUTO トグル
   *
   * 長押し（e.repeat）と最小入力間隔(120ms)で連打・高速消化を抑止
   */
  _onKeyDown(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    if (!this.el.isConnected) return;

    // 長押しによる自動リピート抑止
    if (e.repeat) return;

    // 最小入力間隔（どのキーでも一定時間はブロック）
    const now = performance.now();
    const MIN_KEY_INTERVAL = 120;
    if (this._lastKeyAt && now - this._lastKeyAt < MIN_KEY_INTERVAL) return;

    let handled = false;
    const key = e.key;
    const lk = key.toLowerCase();

    if (e.code === 'Space') {
      // スマート: 停止中 → レバー / 回転中 → 押し順停止（左→中→右）
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
      // スタート
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

  /** ボタンを一瞬 is-pressed にして押下感を出す */
  _pressButton(selector) {
    const btn = this.el.querySelector(selector);
    if (!btn) return;
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 120);
  }

  /** STOPボタンの有効/無効を切り替え */
  _setStopButtonsEnabled(enabled, perReel = null) {
    this.el.querySelectorAll('[data-action="stop"]').forEach(btn => {
      const reelIdx = Number(btn.getAttribute('data-reel'));
      if (perReel) {
        btn.disabled = !perReel[reelIdx];
      } else {
        btn.disabled = !enabled;
      }
    });
  }

  /** レバーボタンの有効/無効 */
  _setLeverEnabled(enabled) {
    const lever = this.el.querySelector('[data-action="spin"]');
    if (lever) lever.disabled = !enabled;
  }

  _onSpinClick() {
    if (this.spinning) return;
    // ゲーム間クールダウンチェック
    const remaining = this._cooldownRemaining();
    if (remaining > 0) return; // レバー無効、何もしない
    // メダル不足: そもそも回転開始しない
    if (this.manager.getMedals() < BET_PER_GAME) return;
    // 再生中の演出があればキャンセル
    if (this.pixelDisplay?.isBusy()) {
      this.pixelDisplay.cancelEvents();
    }
    this._spinStart();
  }

  /** ゲーム間クールダウンの残り時間(ms)を返す */
  _cooldownRemaining() {
    const MIN_GAME_INTERVAL = 1500;
    if (!this._lastSpinStartAt) return 0;
    const elapsed = performance.now() - this._lastSpinStartAt;
    return Math.max(0, MIN_GAME_INTERVAL - elapsed);
  }

  /** STOPボタンクリック */
  _onStopClick(reelIdx) {
    if (!this.spinning) return;
    if (this._stoppedReels[reelIdx]) return; // 既に停止済み
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
    // 演出中は完了まで待つ
    if (this.pixelDisplay?.isBusy()) {
      const remaining = this.pixelDisplay.remainingMs();
      await new Promise(r => setTimeout(r, remaining + 100));
      if (!this.auto) return;
    }
    // ゲーム間クールダウンを尊重（1.5s最小間隔）
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

  /**
   * スピン開始（レバーON）
   * @param {() => void} [done] 全リール停止＋finalizeまで
   */
  _spinStart(done) {
    // メダル不足時はそもそも回転開始しない (上位 _onSpinClick / _autoLoop でも事前チェック済み)
    if (this.manager.getMedals() < BET_PER_GAME) {
      if (done) done();
      return;
    }

    this.spinning = true;
    this._stoppedReels = [false, false, false];
    this._pressOrderIndex = 0;
    this._actualPressOrder = [];
    this._hideNavOverlay();
    this._lastSpinStartAt = performance.now();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
    this._setLeverEnabled(false);

    // BET消費を先に行い、結果を確定してからリール回転を開始
    const result = this.machine.spin();
    if (!result.ok) {
      // 上記のメダルチェックを通った後はここに来ないが、安全網として
      this.spinning = false;
      this._setLeverEnabled(true);
      if (done) done();
      return;
    }
    this._pendingResult = result;
    this._pendingDone = done;

    // メダル表示を即時更新 (BET差し引き反映 — リール回転開始前に見える)
    const medalsEl = this.el.querySelector('.casino-medals-value');
    if (medalsEl) medalsEl.textContent = this._pad(this.manager.getMedals(), 5);
    this._updateGainDisplay(null);

    // リール回転開始 + レバーSFX
    this.renderer.startSpinAll();
    SlotSFX.lever();

    // リール消灯演出 — 1=リプレイ以上, 2=レア役以上(CZ可能性), 3=BONUS確定
    const dimCount = this._decideReelDimCount(result.flags);
    if (dimCount > 0) this._triggerReelDim(dimCount);

    // 予告抽選 + 発火
    const yokoku = decideYokoku(result, this._yokokuRng);
    if (yokoku && this.pixelDisplay) {
      this._currentYokoku = yokoku;
      this.pixelDisplay.triggerEvent(yokoku.type, yokoku.opts).then(() => {
        this._currentYokoku = null;
      });
    }

    // STOPボタンを有効化（すぐ全部押せる）
    this._setStopButtonsEnabled(true);

    // 押し順ナビ表示
    if (result.navOrder) this._showNavOverlay(result.navOrder);

    // AUTO時は自動STOP（ナビがあればその順で、無ければ左→中→右）
    if (this.auto) {
      const settings = getCasinoSettings();
      const spacing = settings.skipAnimations ? 40 : 400;
      const order = result.navOrder || [0, 1, 2];
      // 前スピンの残りタイマーが残っていれば掃除
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

  /**
   * 個別リール停止（手動STOP or AUTO発火）
   * @param {number} reelIdx
   */
  _stopReel(reelIdx) {
    if (!this._pendingResult) return;
    if (this._stoppedReels[reelIdx]) return;
    this._stoppedReels[reelIdx] = true;
    this._actualPressOrder.push(reelIdx);
    this._advanceNavOverlay(this._actualPressOrder.length);

    const stopIndexes = this._pendingResult.stopIndexes;
    if (stopIndexes && stopIndexes.length === 3) {
      this.renderer.stopReelAtIndex(reelIdx, stopIndexes[reelIdx]);
    } else if (this._pendingResult.frame) {
      const reels = [this._pendingResult.frame.left, this._pendingResult.frame.center, this._pendingResult.frame.right];
      this.renderer.renderSingleReelStop(reelIdx, reels[reelIdx]);
    }
    SlotSFX.reelStop();

    // このリールのSTOPボタン無効化
    const btn = this.el.querySelector(`[data-action="stop"][data-reel="${reelIdx}"]`);
    if (btn) btn.disabled = true;

    // 2リール停止時にテンパイ判定 → 3リール目停止前にリーチSE
    // reachme (リーチ目) / 内部成立 / 青7 で段階的に音を変える
    const stoppedCount = this._stoppedReels.filter(Boolean).length;
    if (stoppedCount === 2) {
      const flags = this._pendingResult?.flags;
      if (flags) {
        /** @type {1|2|3} */
        let level = 0;
        if (flags.blue7Flag === 'blue7') level = 3;
        else if (flags.bonusFlag && flags.bonusFlag !== 'none') level = 2;
        else if (flags.smallFlag === 'reachme') level = 1;
        if (level > 0) {
          if (this._tenpaiTimer) clearTimeout(this._tenpaiTimer);
          this._tenpaiTimer = setTimeout(() => {
            this._tenpaiTimer = null;
            SlotSFX.tenpai(level);
          }, 120);
        }
      }
    }

    // 全リール停止チェック
    if (this._stoppedReels.every(Boolean)) {
      const settings = getCasinoSettings();
      setTimeout(() => this._onAllReelsStopped(), settings.skipAnimations ? 30 : 150);
    }
  }

  _onAllReelsStopped() {
    const result = this._pendingResult;
    this._pendingResult = null;
    const done = this._pendingDone;
    this._pendingDone = null;
    if (!result) return;

    // ナビ成否を反映（外していたら差分を返金方向に没収）
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

    // ゲーム間クールダウン（1.5秒）の残りを確認してからレバー再有効化
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

  /** 0詰め文字列化 */
  _pad(n, w) {
    return String(n).padStart(w, '0');
  }

  /**
   * 払い出し7セグをカウントアップ風に表示
   * @param {number} target
   */
  _rollPayoutDisplay(target) {
    const el = this.el.querySelector('.casino-slot-gain-7seg');
    if (!el) return;
    if (this._payoutRollRaf) {
      cancelAnimationFrame(this._payoutRollRaf);
      this._payoutRollRaf = 0;
    }
    if (this._payoutCleanupTimer) {
      clearTimeout(this._payoutCleanupTimer);
      this._payoutCleanupTimer = null;
    }
    if (target <= 0) {
      el.textContent = this._pad(0, 3);
      el.classList.remove('is-rolling', 'is-payout-big');
      return;
    }
    const durationMs = target >= 100 ? 900 : target >= 30 ? 650 : 420;
    const start = performance.now();
    el.classList.add('is-rolling');
    if (target >= 50) el.classList.add('is-payout-big');
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const shown = Math.floor(eased * target);
      el.textContent = this._pad(shown, 3);
      if (t < 1) {
        this._payoutRollRaf = requestAnimationFrame(step);
      } else {
        el.textContent = this._pad(target, 3);
        this._payoutRollRaf = 0;
        this._payoutCleanupTimer = setTimeout(() => {
          el.classList.remove('is-rolling', 'is-payout-big');
          this._payoutCleanupTimer = null;
        }, 500);
      }
    };
    this._payoutRollRaf = requestAnimationFrame(step);
  }

  /**
   * 停止完了後の情報パネル更新・演出発火
   * @param {import('./SlotMachine.js').SpinResult} result
   */
  _onSpinFinalized(result) {
    // リール消灯を解除
    this._clearReelDim();

    // 残高表示更新（7セグ風）
    const medalsEl = this.el.querySelector('.casino-medals-value');
    if (medalsEl) medalsEl.textContent = this._pad(this.manager.getMedals(), 5);

    // 今回払い出し（7セグ、カウントアップ演出）
    this._rollPayoutDisplay(result.payout || 0);

    // GAMEカウンタ
    const game7seg = this.el.querySelector('.casino-slot-game-7seg');
    if (game7seg) game7seg.textContent = this._pad(this.machine.state.stats.gamesPlayed, 4);

    // 獲得枚数（BETを差し引いたnet）
    const netGain = (result.payout || 0) - BET_PER_GAME;
    this._updateGainDisplay(netGain);

    // サブ液晶更新
    this._updateSubDisplay(result.phase, this.machine.state.bonusKind);

    // セッション累計
    const sess = this.machine.state.stats.totalPayout - this.machine.state.stats.totalBet;
    const sessEl = this.el.querySelector('.casino-slot-session');
    if (sessEl) {
      sessEl.textContent = (sess >= 0 ? '+' : '') + sess;
      sessEl.classList.toggle('is-positive', sess > 0);
      sessEl.classList.toggle('is-negative', sess < 0);
    }

    // BIG/REG/ART カウンタ
    const bigEl = this.el.querySelector('.casino-slot-big-count');
    const regEl = this.el.querySelector('.casino-slot-reg-count');
    const artCountEl = this.el.querySelector('.casino-slot-art-count');
    if (bigEl) bigEl.textContent = String(this.machine.state.stats.bigCount);
    if (regEl) regEl.textContent = String(this.machine.state.stats.regCount);
    if (artCountEl) artCountEl.textContent = String(this.machine.state.stats.artCount);

    // ART残りG数表示
    const artRow = this.el.querySelector('.casino-slot-art-row');
    const artLeftEl = this.el.querySelector('.casino-slot-art-left');
    const showArt = result.phase === 'ART' || this.machine.state.artGamesRemaining > 0;
    if (artRow) artRow.hidden = !showArt;
    if (artLeftEl) artLeftEl.textContent = `${this.machine.state.artGamesRemaining}G`;

    // ARTストック表示
    const stockRow = this.el.querySelector('.casino-slot-art-stock-row');
    const stockEl = this.el.querySelector('.casino-slot-art-stock');
    const stocks = this.machine.state.artStocks;
    if (stockRow) stockRow.hidden = stocks <= 0;
    if (stockEl) stockEl.textContent = String(stocks);

    // phase表示
    const phaseEl = this.el.querySelector('.casino-slot-phase');
    if (phaseEl) {
      phaseEl.dataset.phase = result.phase;
      phaseEl.textContent = this._phaseLabel(result.phase, this.machine.state.bonusKind);
    }

    // 筐体・リールフレームにphaseを伝播（アンビエント光用）
    const cabinet = this.el.querySelector('.casino-slot-cabinet');
    if (cabinet) cabinet.dataset.phase = result.phase;
    const reelsFrame = this.el.querySelector('.casino-slot-reels-frame');
    if (reelsFrame) reelsFrame.dataset.phase = result.phase;

    // 小役成立時の効果音＋当選コマフラッシュ
    // リールが正規位置にsettleするのを待ってからハイライト
    if (result.payout > 0 && result.winCells && result.winCells.length > 0) {
      setTimeout(() => {
        this.renderer.flashWinCells(result.winCells, result.stopIndexes);
      }, 350);
    }

    const isStrong = result.flags?.rareStrength === 'strong';
    const isStrongChance = isStrong && result.flags?.smallFlag === 'chance';
    if (result.flags?.smallFlag === 'bell' && result.payout > 0) SlotSFX.bell();
    else if (result.flags?.smallFlag === 'watermelon' && result.payout > 0) {
      if (isStrong) SlotSFX.watermelonStrong(); else SlotSFX.watermelon();
    }
    else if (result.flags?.smallFlag === 'cherry' && result.payout > 0) {
      if (isStrong) SlotSFX.cherryStrong(); else SlotSFX.cherry();
    }
    else if (result.flags?.smallFlag === 'replay') SlotSFX.replay();
    else if (result.flags?.smallFlag === 'chance') {
      if (isStrong) SlotSFX.chanceStrong(); else SlotSFX.chanceMoku();
    }

    // 強レア役の瞬間演出: 強チェリー/強スイカは控えめのフラッシュ、強チャンス目はプレミア級
    if (isStrong) {
      if (isStrongChance) {
        this._triggerScreenFlash('premier');
        this._shakeCabinet();
      } else {
        this._triggerScreenFlash('rare-strong');
      }
    }

    // ナビ取りこぼし（SFXのみ、トースト表示はしない）
    if (result.navMissed) {
      SlotSFX.czFail();
    }

    // BONUS中: 毎ゲームの強制払い出し
    if (result.phase === 'BONUS' && result.payout > 0) {
      SlotSFX.bonusPayout();
      if (this.pixelDisplay) {
        this.pixelDisplay.triggerEvent('bonus_payout', { amount: result.payout });
      }
    }

    // BIG中: 旧「ビタ押しチャンス」の代替として一定確率で演出領域フラッシュ
    if (result.phase === 'BONUS' && this.machine.state.bonusKind === 'big' && this.pixelDisplay) {
      if (Math.random() < 0.18) {
        this.pixelDisplay.triggerEvent('bonus_flash');
      }
    }

    // 演出領域に区間別ステータスを反映
    if (this.pixelDisplay) {
      this.pixelDisplay.setStats({
        bonusRemaining:  this.machine.state.bonusGamesRemaining,
        bonusGain:       this.machine.state.bonusGainTotal,
        artRemaining:    this.machine.state.artGamesRemaining,
        artGain:         this.machine.state.artGainTotal,
        zenchoRemaining: this.machine.state.zenchoGamesRemaining,
        zenchoTotal:     this._zenchoTotal,
        pendingResult:   this.machine.state.pendingResult,
        zenchoRank:      this._zenchoRank,
      });
    }

    // 上乗せ演出（ドット絵ディスプレイのみ）
    if (result.upsellGames && result.upsellGames > 0) {
      SlotSFX.upsell();
      if (this.pixelDisplay) this.pixelDisplay.triggerEvent('upsell', { amount: result.upsellGames });
    }

    // 当選時のピクセル演出
    if (result.payout > 0 && result.winCells && result.winCells.length > 0 && this.pixelDisplay) {
      this.pixelDisplay.triggerEvent('win_burst', { smallFlag: result.flags?.smallFlag });
    }

    // ガセ予告発火後に当たりじゃなかった場合
    if (this._currentYokoku && !this._currentYokoku.willHit && result.payout === 0 &&
        result.flags?.bonusFlag === 'none' && this.pixelDisplay) {
      // ガセ演出を重ねて発火（予告終了後）
      if (this._gasuriTimer) clearTimeout(this._gasuriTimer);
      this._gasuriTimer = setTimeout(() => {
        this._gasuriTimer = null;
        if (this.pixelDisplay) this.pixelDisplay.triggerEvent('gasuri_fail');
      }, 100);
    }

    // イベント演出: SFX + ドット絵ディスプレイ（トースト／全画面フラッシュは削除）
    if (result.events) {
      for (const ev of result.events) {
        if (ev.type === 'bonus_standby_start') {
          SlotSFX.bonusInternal(ev.bonusKind || 'big');
        } else if (ev.type === 'bonus_start') {
          SlotSFX.bonusStart();
          this._triggerScreenFlash('bonus-start');
          this._shakeCabinet();
          // ボーナス専用BGMに切替 (スタックで保存、bonus_endで復元)
          SoundManager.startCasinoBGM?.(ev.bonusKind === 'reg' ? 'reg' : 'big');
        } else if (ev.type === 'bonus_end') {
          SlotSFX.bonusEnd();
          SoundManager.stopCasinoBGM?.();
        } else if (ev.type === 'blue7_success') {
          // プレミア演出: フリーズ (0.8秒) → 既存のblue7ファンファーレを後追いで重ねる
          SlotSFX.freeze();
          if (this._blue7Timer) clearTimeout(this._blue7Timer);
          this._blue7Timer = setTimeout(() => {
            this._blue7Timer = null;
            SlotSFX.blue7Success();
          }, 400);
          if (this.pixelDisplay) this.pixelDisplay.triggerEvent('blue7_success');
          this._triggerScreenFlash('premier');
          this._shakeCabinet();
        } else if (ev.type === 'art_start') {
          SlotSFX.artStart();
          this._triggerScreenFlash('art');
          this._onArtEnter();
        } else if (ev.type === 'art_add') {
          SlotSFX.artAdd();
          if (this.pixelDisplay) this.pixelDisplay.triggerEvent('art_add', { amount: ev.amount || 100 });
        } else if (ev.type === 'art_stock_consume') {
          SlotSFX.artStockConsume();
          if (this.pixelDisplay) this.pixelDisplay.triggerEvent('art_add', { amount: ev.amount || 50 });
        } else if (ev.type === 'art_resume') {
          SlotSFX.artResume();
        } else if (ev.type === 'art_end') {
          SlotSFX.artEnd();
          this._onArtExit();
        } else if (ev.type === 'zencho_start') {
          if (ev.reason === 'bonus') SlotSFX.zenchoStartBonus();
          else SlotSFX.zenchoStart();
          // 前兆温度上昇の正規化用に総G数を保存
          this._zenchoTotal = ev.amount || 1;
          // CZ前兆の演出ランクを抽選 (30:40:30 = 静か:中:激アツ)
          if (ev.reason === 'cz') {
            const r = Math.random();
            this._zenchoRank = r < 0.30 ? 1 : r < 0.70 ? 2 : 3;
          } else {
            this._zenchoRank = 1;
          }
        } else if (ev.type === 'zencho_end') {
          if (ev.reason === 'cz') SlotSFX.zenchoEndCz();
          else if (ev.reason === 'bonus') SlotSFX.zenchoEndBonus();
          else SlotSFX.zenchoEndFail();
          this._zenchoTotal = 0;
          this._zenchoRank = 1;
        } else if (ev.type === 'cz_start') {
          SlotSFX.czStart();
          this._triggerScreenFlash('cz');
        } else if (ev.type === 'cz_success') {
          SlotSFX.czSuccess();
          this._triggerScreenFlash('bonus');
        } else if (ev.type === 'cz_fail') {
          SlotSFX.czFail();
        } else if (ev.type === 'tenjou_start') {
          SlotSFX.tenjouStart();
        } else if (ev.type === 'tenjou_hit') {
          SlotSFX.tenjouHit();
        }
      }
    }
  }

  /**
   * @param {string} phase
   * @param {string|null} bonusKind
   */
  /**
   * サブ液晶（演出表示）の更新 - ドット絵ディスプレイに phase を反映
   */
  _updateSubDisplay(phase, bonusKind) {
    let modeAttr = 'normal';
    switch (phase) {
      case 'NORMAL':        modeAttr = 'normal'; break;
      case 'ZENCHO':        modeAttr = 'zencho'; break;
      case 'CZ':            modeAttr = 'cz'; break;
      case 'BONUS_STANDBY': modeAttr = 'bonus_standby'; break;
      case 'BONUS':         modeAttr = 'bonus'; break;
      case 'ART':           modeAttr = 'art'; break;
      case 'TENJOU':        modeAttr = 'tenjou'; break;
    }
    if (this.pixelDisplay) {
      this.pixelDisplay.setMode(modeAttr, bonusKind);
    }
  }

  _phaseLabel(phase, bonusKind) {
    if (phase === 'NORMAL') return '通常時';
    if (phase === 'ZENCHO') return '前兆中';
    if (phase === 'CZ') return 'CZチャンス';
    if (phase === 'BONUS_STANDBY') return 'ボーナス内部成立中';
    if (phase === 'BONUS') return bonusKind === 'big' ? 'BIG中' : 'REG中';
    if (phase === 'ART') return '錬金チャンス';
    if (phase === 'TENJOU') return '天井待機';
    return phase;
  }

  /** @param {number|null} gain */
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

  /**
   * 押し順ナビを表示: 各リール窓上に番号1/2/3を表示
   * @param {number[]} order - reelIdx の配列（押す順番で並んでいる）
   */
  _showNavOverlay(order) {
    const overlay = this.el.querySelector('.casino-slot-nav-overlay');
    if (!overlay || !order) return;
    overlay.hidden = false;
    const arrows = overlay.querySelectorAll('.casino-slot-nav-arrow');
    // order[seq] = reelIdx: seq番目に押すリールindex
    // arrows[reelIdx]に「seq+1」を表示
    arrows.forEach(a => { a.textContent = ''; a.classList.remove('is-active', 'is-done'); });
    for (let seq = 0; seq < order.length; seq++) {
      const reelIdx = order[seq];
      const arrow = arrows[reelIdx];
      if (!arrow) continue;
      arrow.textContent = String(seq + 1);
      if (seq === 0) arrow.classList.add('is-active');
    }
  }

  /**
   * ナビの進捗更新: stepCount番目までの矢印を消化済みにして次をactiveに
   * @param {number} stepCount - 押した回数（1..3）
   */
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

  /**
   * 全画面フラッシュ演出
   * @param {string} variant - 'bonus' | 'bonus-start' | 'premier' | 'art' | 'cz'
   */
  _triggerScreenFlash(variant) {
    const flash = document.createElement('div');
    flash.className = `casino-screen-flash casino-screen-flash-${variant}`;
    this.el.appendChild(flash);
    requestAnimationFrame(() => flash.classList.add('is-active'));
    const tid = setTimeout(() => flash.remove(), 1200);
    this._screenFlashTimers.push(tid);
  }

  _clearScreenFlashes() {
    for (const tid of this._screenFlashTimers) clearTimeout(tid);
    this._screenFlashTimers.length = 0;
    this.el.querySelectorAll('.casino-screen-flash').forEach(n => n.remove());
  }

  /** ART突入時のBGM切替 → ART.mp3 */
  _onArtEnter() {
    SoundManager.startCasinoBGM?.('art');
  }

  /** ART終了時のBGM復元 */
  _onArtExit() {
    SoundManager.stopCasinoBGM?.();
  }

  /**
   * リール消灯枚数を決定
   *   3消灯 = BONUS確定 (BIG/REG内部成立時のみ)
   *   2消灯 = レア役以上 (CZ突入の可能性)
   *   1消灯 = リプレイ以上
   * @param {import('./SlotEngine.js').DrawResult} flags
   * @returns {0|1|2|3}
   */
  _decideReelDimCount(flags) {
    if (!flags) return 0;
    const r = this._yokokuRng.nextInt(1000);
    const isBonus = flags.bonusFlag && flags.bonusFlag !== 'none';
    const isStrongRare = flags.rareStrength === 'strong';
    const isWeakRare = flags.rareStrength === 'weak';
    const isCz = flags.czTriggered === true;
    const sf = flags.smallFlag;

    // BIG/REG 内部成立: 3消灯30% / 2消灯35% / 1消灯20% / なし15%
    if (isBonus) {
      if (r < 150) return 0;
      if (r < 350) return 1;
      if (r < 700) return 2;
      return 3;
    }
    // 強レア役 + CZ当選: 2消灯40% / 1消灯30% / なし30% (3消灯はBONUS限定)
    if (isStrongRare && isCz) {
      if (r < 300) return 0;
      if (r < 600) return 1;
      return 2;
    }
    // 強レア役: 2消灯20% / 1消灯30% / なし50%
    if (isStrongRare) {
      if (r < 500) return 0;
      if (r < 800) return 1;
      return 2;
    }
    // 弱レア役 + CZ当選: 2消灯15% / 1消灯35% / なし50%
    if (isWeakRare && isCz) {
      if (r < 500) return 0;
      if (r < 850) return 1;
      return 2;
    }
    // 弱レア役: 1消灯25% / 2消灯3% / なし72%
    if (isWeakRare) {
      if (r < 720) return 0;
      if (r < 970) return 1;
      return 2;
    }
    // リプレイ: 1消灯3%
    if (sf === 'replay') {
      return r < 970 ? 0 : 1;
    }
    // ベル: 1消灯1% (非常に稀)
    if (sf === 'bell') {
      return r < 990 ? 0 : 1;
    }
    return 0;
  }

  /**
   * 左から `count` 個のリールを消灯 (filter で暗くする)
   * @param {number} count
   */
  _triggerReelDim(count) {
    const reels = this.el.querySelectorAll('.casino-slot-reel');
    for (let i = 0; i < Math.min(count, reels.length); i++) {
      reels[i].classList.add('is-dimmed');
    }
  }

  /** 全リールの消灯を解除 */
  _clearReelDim() {
    this.el.querySelectorAll('.casino-slot-reel.is-dimmed').forEach((r) => {
      r.classList.remove('is-dimmed');
    });
  }

  /** 筐体シェイク（大当たり突入時など） */
  _shakeCabinet() {
    const cabinet = this.el.querySelector('.casino-slot-cabinet');
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
    // SE同時発音数をデフォルトに復元
    SoundManager.setSeNodeBudget?.(12);
    // SEスケールを通常に戻す
    resetSeVolumeScale();
    // 画面内で起動した遅延SEタイマーをクリア (離脱中に鳴らないように)
    if (this._tenpaiTimer) { clearTimeout(this._tenpaiTimer); this._tenpaiTimer = null; }
    if (this._blue7Timer) { clearTimeout(this._blue7Timer); this._blue7Timer = null; }
    // カジノBGMを通常BGMへ戻す (ART/BONUS途中離脱時の後始末)
    SoundManager.drainCasinoBGM?.();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
    if (this._payoutRollRaf) { cancelAnimationFrame(this._payoutRollRaf); this._payoutRollRaf = 0; }
    if (this._payoutCleanupTimer) { clearTimeout(this._payoutCleanupTimer); this._payoutCleanupTimer = null; }
    if (this._gasuriTimer) { clearTimeout(this._gasuriTimer); this._gasuriTimer = null; }
    if (this._shakeTimer) { clearTimeout(this._shakeTimer); this._shakeTimer = null; }
    this._clearScreenFlashes();
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.machine?.state) {
      this.manager.finalizeSession(this.machine.state);
      this.machine.state.stats = { gamesPlayed: 0, totalBet: 0, totalPayout: 0, bigCount: 0, regCount: 0 };
    }
    if (this.pixelDisplay) { this.pixelDisplay.destroy(); this.pixelDisplay = null; }
    if (this.renderer) this.renderer.destroy();
    this.el.remove();
  }
}
