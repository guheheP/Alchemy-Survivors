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
    // キーボード/プログラム的フォーカスでも表示（focusin/focusout はバブル可）
    document.addEventListener('focusin', (e) => this._onEnter(e));
    document.addEventListener('focusout', (e) => this._onLeave(e));
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

    // XSS対策: title / text / rarity は data-* 属性経由で任意の文字列になる可能性があるため、
    // innerHTML 文字列連結ではなく textContent + class 操作で構築する
    this.el.innerHTML = '';
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'game-tooltip-title' + (rarity ? ` tooltip-${rarity.replace(/[^a-z0-9_-]/gi, '')}` : '');
      titleEl.textContent = title;
      this.el.appendChild(titleEl);
    }
    const bodyEl = document.createElement('div');
    bodyEl.className = 'game-tooltip-body';
    // \n を <br> に変換 (textContent のまま改行を反映させるため style に white-space: pre-line も効く)
    bodyEl.style.whiteSpace = 'pre-line';
    bodyEl.textContent = text;
    this.el.appendChild(bodyEl);
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
    const rect = el.getBoundingClientRect();

    // 小画面ではビューポート中央に固定表示（モーダル的な挙動）
    if (vw <= 480) {
      el.style.left = `${Math.max(pad, (vw - rect.width) / 2)}px`;
      el.style.top = `${Math.max(pad, vh - rect.height - 80)}px`;
      return;
    }

    // ポインタ座標が無い場合(focus由来)は対象要素の下辺に配置
    let anchorX, anchorY;
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number' && (e.clientX !== 0 || e.clientY !== 0)) {
      anchorX = e.clientX;
      anchorY = e.clientY;
    } else if (this._currentTarget) {
      const tr = this._currentTarget.getBoundingClientRect();
      anchorX = tr.left + tr.width / 2;
      anchorY = tr.bottom;
    } else {
      anchorX = vw / 2;
      anchorY = vh / 2;
    }

    let x = anchorX + pad;
    let y = anchorY + pad;

    if (x + rect.width > vw - pad) x = anchorX - rect.width - pad;
    if (y + rect.height > vh - pad) y = anchorY - rect.height - pad;

    el.style.left = `${Math.max(pad, x)}px`;
    el.style.top = `${Math.max(pad, y)}px`;
  }

  _hide() {
    this.el.classList.remove('game-tooltip-visible');
    this._visible = false;
    this._currentTarget = null;
  }
}
