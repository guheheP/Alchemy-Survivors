/**
 * GameTooltip — ゲームの雰囲気に合った専用ツールチップ
 *
 * ブラウザ標準の title 属性ではなく、カスタムデザインのツールチップを
 * data-tooltip 属性を持つ要素にホバー時表示する。
 */

let _instance = null;

export class GameTooltip {
  static init() {
    if (_instance) return;
    _instance = new GameTooltip();
  }

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'game-tooltip';
    this.el.setAttribute('role', 'tooltip');
    document.body.appendChild(this.el);

    this._visible = false;
    this._currentTarget = null;

    // イベント委譲で全 data-tooltip 要素をカバー
    document.addEventListener('pointerenter', (e) => this._onEnter(e), true);
    document.addEventListener('pointerleave', (e) => this._onLeave(e), true);
    document.addEventListener('pointermove', (e) => this._onMove(e));
  }

  _onEnter(e) {
    if (!e.target?.closest) return;
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    const text = target.dataset.tooltip;
    if (!text) return;

    // data-tooltip-title があればタイトル付きで表示
    const title = target.dataset.tooltipTitle || '';
    const rarity = target.dataset.tooltipRarity || '';

    let html = '';
    if (title) {
      html += `<div class="game-tooltip-title ${rarity ? `tooltip-${rarity}` : ''}">${title}</div>`;
    }
    html += `<div class="game-tooltip-body">${text}</div>`;

    this.el.innerHTML = html;
    this.el.classList.add('game-tooltip-visible');
    this._visible = true;
    this._currentTarget = target;

    // 標準 title を一時的に無効化
    if (target.hasAttribute('title')) {
      target.dataset._origTitle = target.getAttribute('title');
      target.removeAttribute('title');
    }

    this._position(e);
  }

  _onLeave(e) {
    if (!e.target?.closest) return; // テキストノードやdocument等はスキップ
    const target = e.target.closest('[data-tooltip]');
    if (!target || target !== this._currentTarget) return;
    this._hide();

    // 標準 title を復元
    if (target.dataset._origTitle) {
      target.setAttribute('title', target.dataset._origTitle);
      delete target.dataset._origTitle;
    }
  }

  _onMove(e) {
    if (!this._visible) return;
    this._position(e);
  }

  _position(e) {
    const pad = 12;
    const el = this.el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 一度表示してサイズ取得
    let x = e.clientX + pad;
    let y = e.clientY + pad;

    const rect = el.getBoundingClientRect();
    if (x + rect.width > vw - pad) x = e.clientX - rect.width - pad;
    if (y + rect.height > vh - pad) y = e.clientY - rect.height - pad;

    el.style.left = `${Math.max(pad, x)}px`;
    el.style.top = `${Math.max(pad, y)}px`;
  }

  _hide() {
    this.el.classList.remove('game-tooltip-visible');
    this._visible = false;
    this._currentTarget = null;
  }
}
