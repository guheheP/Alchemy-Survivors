/**
 * SlotRenderer.js — スロットリールの軽量実装
 *
 * 回転は CSS keyframe アニメーションで描画（JSタイマーで60FPS更新しない）。
 * 停止時のみ JSで現在位置を取得→目標位置へ transition でスナップ。
 *
 * DOM:
 *   .casino-slot-reels
 *     .casino-slot-reel (×3)
 *       .casino-slot-reel-strip  ← 21×2コマ並べて、CSSで translate-infinite 回転
 *         .casino-slot-cell × 42
 */

import { SYMBOLS } from '../data/symbols.js';
import { REELS, REEL_LENGTH } from '../data/reels.js';

const SYMBOL_HEIGHT = 64;
const SYMBOL_WIDTH = 140;
const STRIP_LAPS = 3;

export class SlotRenderer {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'casino-slot-reels';
    /** @type {Array<{reel: HTMLElement, strip: HTMLElement}>} */
    this.reelEls = [];
    /** 停止スナップ/バウンスの setTimeout 群 */
    this._stopTimers = [];
  }

  render() {
    this.el.innerHTML = '';
    this.reelEls = [];

    for (let i = 0; i < 3; i++) {
      const reelWrap = document.createElement('div');
      reelWrap.className = 'casino-slot-reel';
      reelWrap.dataset.reel = String(i);

      const strip = document.createElement('div');
      strip.className = 'casino-slot-reel-strip';
      const reelData = REELS[i];
      // 3周分並べる: stopIdx=20 のとき下段(strip[22+20]=strip[42])のセルが必要
      for (let pass = 0; pass < STRIP_LAPS; pass++) {
        for (let j = 0; j < REEL_LENGTH; j++) {
          const cell = document.createElement('div');
          cell.className = 'casino-slot-cell';
          const symId = reelData[j];
          const sym = SYMBOLS[symId];
          if (sym) {
            cell.innerHTML = `<img class="casino-slot-symbol" src="${sym.image}" alt="${sym.label}" draggable="false" />`;
          } else {
            cell.textContent = symId;
          }
          strip.appendChild(cell);
        }
      }
      reelWrap.appendChild(strip);
      this.el.appendChild(reelWrap);
      this.reelEls.push({ reel: reelWrap, strip });
    }

    // 配当ラインSVGは表示しない（当選コマのフラッシュのみで視認する）

    // 当選コマフラッシュ用オーバーレイ
    const winOverlay = document.createElement('div');
    winOverlay.className = 'casino-slot-win-overlay';
    this.el.appendChild(winOverlay);
    this.winOverlay = winOverlay;

    this.container.appendChild(this.el);

    // 初期位置: 全リール index=0 を中段に
    this._snapToIndex(0, 0);
    this._snapToIndex(1, 0);
    this._snapToIndex(2, 0);
  }

  /** 全リール回転開始 — CSSアニメ発動のみ */
  startSpinAll() {
    for (let i = 0; i < 3; i++) this.startSpinReel(i);
  }

  /**
   * 1リール回転開始（CSS animation）
   * @param {number} reelIndex
   */
  startSpinReel(reelIndex) {
    const target = this.reelEls[reelIndex];
    if (!target) return;
    if (target.reel.classList.contains('is-spinning')) return;

    // アニメ開始前に transform をリセットしてアニメ起点にする
    target.strip.style.transition = 'none';
    target.strip.style.transform = '';
    // reflowを強制してからアニメをアタッチ
    void target.strip.offsetHeight;
    target.reel.classList.add('is-spinning');
  }

  /**
   * 指定リールを指定indexで停止（中段にreel[index]が来る）
   * @param {number} reelIndex
   * @param {number} targetIndex
   */
  stopReelAt(reelIndex, targetIndex) {
    const target = this.reelEls[reelIndex];
    if (!target) return;

    // CSSアニメの現在値を取得
    const computed = window.getComputedStyle(target.strip);
    const matrix = new DOMMatrixReadOnly(computed.transform);
    const currentY = matrix.m42 || 0;

    // CSSアニメを止めて現在位置で固定
    target.reel.classList.remove('is-spinning');
    target.strip.style.transition = 'none';
    target.strip.style.transform = `translateY(${currentY}px)`;
    void target.strip.offsetHeight;

    // 下方向に継続して目標位置に滑り込む
    // スピンは translateY が増加する方向（絵柄が下へ流れる）
    // stop でも finalOffset は currentY より大きくする
    const oneLap = SYMBOL_HEIGHT * REEL_LENGTH;
    const normalizedOffset = this._offsetForIndex(targetIndex);
    const minTravel = 2 * SYMBOL_HEIGHT;
    let finalOffset = normalizedOffset;
    while (finalOffset <= currentY + minTravel) {
      finalOffset += oneLap;
    }

    // 上端 0 を超えると空白領域になるので、その場合は即スナップ
    if (finalOffset > 0) {
      target.strip.style.transition = 'none';
      target.strip.style.transform = `translateY(${normalizedOffset}px)`;
      void target.strip.offsetHeight;
      return;
    }

    target.strip.style.transition = 'transform 0.28s cubic-bezier(.25, 0.85, .3, 1)';
    target.strip.style.transform = `translateY(${finalOffset}px)`;

    // 300ms後、正規位置にスナップ（コンテンツ同一なので視覚的に変化なし）
    const snapTid = setTimeout(() => {
      if (!target.reel.isConnected) return;
      target.strip.style.transition = 'none';
      target.strip.style.transform = `translateY(${normalizedOffset}px)`;
      void target.strip.offsetHeight;
      // リール筐体にバウンスを発火
      target.reel.classList.remove('is-stopped-bounce');
      void target.reel.offsetHeight;
      target.reel.classList.add('is-stopped-bounce');
      const bounceTid = setTimeout(() => {
        if (target.reel.isConnected) target.reel.classList.remove('is-stopped-bounce');
      }, 240);
      this._stopTimers.push(bounceTid);
    }, 320);
    this._stopTimers.push(snapTid);
  }

  /**
   * stopIndex 指定で停止（推奨API）
   * @param {number} reelIndex
   * @param {number} targetIndex
   */
  stopReelAtIndex(reelIndex, targetIndex) {
    this.stopReelAt(reelIndex, targetIndex);
  }

  /**
   * フレーム指定停止（互換）: [上,中,下]に合致する位置を探して停止
   * @param {number} reelIndex
   * @param {import('../data/symbols.js').SymbolId[]} symbols
   */
  renderSingleReelStop(reelIndex, symbols) {
    const reelData = REELS[reelIndex];
    let targetIndex = -1;
    for (let i = 0; i < REEL_LENGTH; i++) {
      const up = reelData[(i - 1 + REEL_LENGTH) % REEL_LENGTH];
      const mid = reelData[i];
      const down = reelData[(i + 1) % REEL_LENGTH];
      if (up === symbols[0] && mid === symbols[1] && down === symbols[2]) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex < 0) {
      for (let i = 0; i < REEL_LENGTH; i++) {
        if (reelData[i] === symbols[1]) { targetIndex = i; break; }
      }
    }
    if (targetIndex < 0) targetIndex = 0;
    this.stopReelAt(reelIndex, targetIndex);
  }

  /**
   * 当選コマをフラッシュ表示
   * strip 内の実際の .casino-slot-cell に is-winning クラスを付ける方式
   * 非当選コマはリール側の has-win クラス経由でディム表示される
   * @param {{col:number,row:number}[]} cells
   * @param {number[]} stopIndexes - 各リールの停止index（中段のreelインデックス）
   */
  flashWinCells(cells, stopIndexes) {
    if (!cells || cells.length === 0) return;
    // 既存のwinningクラスをクリア
    this._clearWinHighlights();
    if (this._winCleanupTimer) {
      clearTimeout(this._winCleanupTimer);
      this._winCleanupTimer = 0;
    }

    if (!stopIndexes || stopIndexes.length !== 3) return;

    let marked = 0;
    for (const { col, row } of cells) {
      const target = this.reelEls[col];
      if (!target || !target.strip) continue;
      const stopIdx = stopIndexes[col];
      // 3周並び: 中央ラップ(strip[21-41])が normalize 位置。rowに対応するstripセル:
      //   top=20+stopIdx, mid=21+stopIdx, bot=22+stopIdx
      const stripIdx = 21 + stopIdx + (row - 1);
      const total = STRIP_LAPS * REEL_LENGTH;
      const normalized = ((stripIdx % total) + total) % total;
      const cellEl = target.strip.children[normalized];
      if (cellEl) {
        cellEl.classList.add('is-winning');
        marked++;
      }
    }

    // 親リール群に has-win を付けて周囲をディム
    if (marked > 0) this.el.classList.add('has-win');

    this._winCleanupTimer = setTimeout(() => {
      this._clearWinHighlights();
      this._winCleanupTimer = 0;
    }, 1800);
  }

  _clearWinHighlights() {
    for (const target of this.reelEls) {
      if (!target || !target.strip) continue;
      target.strip.querySelectorAll('.casino-slot-cell.is-winning').forEach(c => {
        c.classList.remove('is-winning');
      });
    }
    this.el.classList.remove('has-win');
  }

  /** 互換: 一括停止 */
  renderFrame(frame) {
    const reels = [frame.left, frame.center, frame.right];
    for (let i = 0; i < 3; i++) this.renderSingleReelStop(i, reels[i]);
  }

  _snapToIndex(reelIndex, targetIndex) {
    const target = this.reelEls[reelIndex];
    if (!target) return;
    const offset = this._offsetForIndex(targetIndex);
    target.strip.style.transition = 'none';
    target.strip.style.transform = `translateY(${offset}px)`;
    void target.strip.offsetHeight;
  }

  /**
   * ストリップのoffset位置計算
   * 2周分の配列なので、2周目の index i セルを中段に合わせる
   * 中段 = window top + 1コマ下
   */
  _offsetForIndex(i) {
    const cellRow = REEL_LENGTH + i;
    return -cellRow * SYMBOL_HEIGHT + SYMBOL_HEIGHT;
  }

  destroy() {
    if (this._winCleanupTimer) {
      clearTimeout(this._winCleanupTimer);
      this._winCleanupTimer = 0;
    }
    for (const tid of this._stopTimers) clearTimeout(tid);
    this._stopTimers.length = 0;
    for (const target of this.reelEls) {
      if (target?.reel) target.reel.classList.remove('is-spinning');
    }
    this.el.remove();
    this.reelEls = [];
  }
}
