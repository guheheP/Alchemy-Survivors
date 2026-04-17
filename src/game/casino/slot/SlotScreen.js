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
import { SlotSFX, getCasinoSettings } from './SoundEffects.js';
import { PixelArtDisplay } from './PixelArtDisplay.js';
import { decideYokoku, YOKOKU_DURATION } from './KoyakuManager.js';
import { Rng } from '../util/rng.js';

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
    /** 現在再生中の予告 */
    this._currentYokoku = null;
    /** 前回スピン開始時刻（ゲーム間最小間隔保証用） */
    this._lastSpinStartAt = 0;
    /** クールダウン解除タイマー */
    this._cooldownTimer = null;

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
    this.spinning = true;
    this._stoppedReels = [false, false, false];
    this._pressOrderIndex = 0;
    this._lastSpinStartAt = performance.now();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
    this._setLeverEnabled(false);
    this.renderer.startSpinAll();
    this._updateGainDisplay(null);
    SlotSFX.lever();

    const result = this.machine.spin();
    if (!result.ok) {
      this.spinning = false;
      this._setLeverEnabled(true);
      this._flashMessage(result.error || 'エラー');
      if (done) done();
      return;
    }
    this._pendingResult = result;
    this._pendingDone = done;

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

    // AUTO時は自動STOP
    if (this.auto) {
      const settings = getCasinoSettings();
      const spacing = settings.skipAnimations ? 40 : 400;
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (this.spinning && !this._stoppedReels[i]) this._stopReel(i);
        }, spacing * (i + 1));
      }
    }
  }

  /**
   * 個別リール停止（手動STOP or AUTO発火）
   * @param {number} reelIdx
   */
  _stopReel(reelIdx) {
    if (!this._pendingResult) return;
    if (this._stoppedReels[reelIdx]) return;
    this._stoppedReels[reelIdx] = true;

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
   * 停止完了後の情報パネル更新・演出発火
   * @param {import('./SlotMachine.js').SpinResult} result
   */
  _onSpinFinalized(result) {
    // 残高表示更新（7セグ風）
    const medalsEl = this.el.querySelector('.casino-medals-value');
    if (medalsEl) medalsEl.textContent = this._pad(this.manager.getMedals(), 5);

    // 今回払い出し（7セグ）
    const gain7seg = this.el.querySelector('.casino-slot-gain-7seg');
    if (gain7seg) gain7seg.textContent = this._pad(result.payout || 0, 3);

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

    // phase表示
    const phaseEl = this.el.querySelector('.casino-slot-phase');
    if (phaseEl) {
      phaseEl.dataset.phase = result.phase;
      phaseEl.textContent = this._phaseLabel(result.phase, this.machine.state.bonusKind);
    }

    // 小役成立時の効果音＋当選コマフラッシュ
    // リールが正規位置にsettleするのを待ってからハイライト
    if (result.payout > 0 && result.winCells && result.winCells.length > 0) {
      setTimeout(() => {
        this.renderer.flashWinCells(result.winCells, result.stopIndexes);
      }, 350);
    }

    if (result.flags?.smallFlag === 'bell' && result.payout > 0) SlotSFX.bell();
    else if (result.flags?.smallFlag === 'watermelon' && result.payout > 0) SlotSFX.watermelon();
    else if (result.flags?.smallFlag === 'cherry' && result.payout > 0) SlotSFX.cherry();
    else if (result.flags?.smallFlag === 'replay') SlotSFX.replay();

    // BONUS中: 毎ゲームの強制払い出し
    if (result.phase === 'BONUS' && result.payout > 0) {
      SlotSFX.bonusPayout();
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
      setTimeout(() => {
        if (this.pixelDisplay) this.pixelDisplay.triggerEvent('gasuri_fail');
      }, 100);
    }

    // イベント演出: SFX + ドット絵ディスプレイ（トースト／全画面フラッシュは削除）
    if (result.events) {
      for (const ev of result.events) {
        if (ev.type === 'bonus_standby_start') {
          SlotSFX.bonusInternal();
        } else if (ev.type === 'bonus_start') {
          SlotSFX.bonusStart();
        } else if (ev.type === 'bonus_end') {
          SlotSFX.bonusEnd();
        } else if (ev.type === 'blue7_success') {
          SlotSFX.blue7Success();
          if (this.pixelDisplay) this.pixelDisplay.triggerEvent('blue7_success');
        } else if (ev.type === 'art_start') {
          SlotSFX.artStart();
        } else if (ev.type === 'art_add') {
          SlotSFX.artAdd();
          if (this.pixelDisplay) this.pixelDisplay.triggerEvent('art_add', { amount: ev.amount || 100 });
        } else if (ev.type === 'art_resume') {
          SlotSFX.artResume();
        } else if (ev.type === 'art_end') {
          SlotSFX.artEnd();
        } else if (ev.type === 'zencho_start') {
          SlotSFX.zenchoStart();
        } else if (ev.type === 'zencho_end') {
          if (ev.reason === 'cz') SlotSFX.zenchoEndCz();
          else if (ev.reason === 'bonus_hit') SlotSFX.bonusInternal();
          else SlotSFX.zenchoEndFail();
        } else if (ev.type === 'cz_start') {
          SlotSFX.czStart();
        } else if (ev.type === 'cz_success') {
          SlotSFX.czSuccess();
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
    if (phase === 'ART') return 'ART中';
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
   * @param {string} text
   * @param {string} [variant] - 'bonus' | 'bonus-big' | 'premier' | 'art' | 'cz' | 'zencho' | 'tenjou'
   */
  _flashMessage(text, variant) {
    const layer = this.el.querySelector('.casino-slot-effect-layer');
    if (!layer) return;
    const msg = document.createElement('div');
    msg.className = 'casino-slot-flash';
    if (variant) msg.classList.add(`casino-slot-flash-${variant}`);
    msg.textContent = text;
    layer.appendChild(msg);
    setTimeout(() => msg.classList.add('is-visible'), 10);
    const duration = variant === 'premier' || variant === 'bonus-big' ? 2200 : 1500;
    setTimeout(() => {
      msg.classList.remove('is-visible');
      setTimeout(() => msg.remove(), 300);
    }, duration);
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
    setTimeout(() => flash.remove(), 1200);
  }

  destroy() {
    this._stopAuto();
    if (this._cooldownTimer) { clearTimeout(this._cooldownTimer); this._cooldownTimer = null; }
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
