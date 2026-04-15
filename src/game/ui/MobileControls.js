/**
 * MobileControls — モバイル仮想スティック + ダッシュボタン
 */

const DEAD_ZONE = 10;
const STICK_MAX = 60;
const DASH_BTN_RADIUS = 44;
const DASH_BTN_MARGIN_X = 60;
// コンソールHUD (画面下 ~90〜110px) に被らないよう十分上に配置
const DASH_BTN_MARGIN_Y = 180;

export class MobileControls {
  constructor() {
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this.dashRequested = false;

    // スティック描画用
    this.stickTouchId = null;
    this.originX = 0;
    this.originY = 0;
    this.stickX = 0;
    this.stickY = 0;
    this.stickVisible = false;

    // ダッシュボタン
    this.dashTouchId = null;
    this.dashPressed = false;

    // タッチデバイス検出 — CSS の `(hover: none) and (pointer: coarse)` と揃える
    // ( `ontouchstart` だと タッチスクリーン付きデスクトップ で true になり、
    //   デスクトップ でも ダッシュボタン が表示されてしまうため )
    this.isMobile = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

    // ボタン位置（resize時に更新）
    this._updateLayout();

    if (this.isMobile) {
      this.active = true;
      // タッチイベントは canvas 要素にのみ紐づけ、DOMボタン/モーダル上のタップは
      // 素通しさせる (levelup カードなどの click が壊れないように)
      this._targetEl = document.getElementById('game-canvas') || window;
      this._onTouchStart = this._handleTouchStart.bind(this);
      this._onTouchMove = this._handleTouchMove.bind(this);
      this._onTouchEnd = this._handleTouchEnd.bind(this);
      this._onResize = () => this._updateLayout();
      this._targetEl.addEventListener('touchstart', this._onTouchStart, { passive: false });
      this._targetEl.addEventListener('touchmove', this._onTouchMove, { passive: false });
      this._targetEl.addEventListener('touchend', this._onTouchEnd);
      this._targetEl.addEventListener('touchcancel', this._onTouchEnd);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('orientationchange', this._onResize);
    }
  }

  _updateLayout() {
    // 右下にダッシュボタン（safe-area考慮: 余裕を持って配置）
    this.dashBtnX = window.innerWidth - DASH_BTN_MARGIN_X;
    this.dashBtnY = window.innerHeight - DASH_BTN_MARGIN_Y;
  }

  _isInsideDashButton(x, y) {
    const dx = x - this.dashBtnX;
    const dy = y - this.dashBtnY;
    return (dx * dx + dy * dy) <= (DASH_BTN_RADIUS * DASH_BTN_RADIUS);
  }

  _handleTouchStart(e) {
    e.preventDefault();

    for (const touch of e.changedTouches) {
      // ダッシュボタン判定が最優先
      if (this.dashTouchId === null && this._isInsideDashButton(touch.clientX, touch.clientY)) {
        this.dashTouchId = touch.identifier;
        this.dashRequested = true;
        this.dashPressed = true;
        continue;
      }

      // スティックは左60%領域＆未使用時のみ
      if (this.stickTouchId === null && touch.clientX < window.innerWidth * 0.6) {
        this.stickTouchId = touch.identifier;
        this.originX = touch.clientX;
        this.originY = touch.clientY;
        this.stickX = touch.clientX;
        this.stickY = touch.clientY;
        this.stickVisible = true;
      }
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier !== this.stickTouchId) continue;

      let tdx = touch.clientX - this.originX;
      let tdy = touch.clientY - this.originY;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);

      if (dist > STICK_MAX) {
        tdx = (tdx / dist) * STICK_MAX;
        tdy = (tdy / dist) * STICK_MAX;
      }

      this.stickX = this.originX + tdx;
      this.stickY = this.originY + tdy;

      if (dist < DEAD_ZONE) {
        this.dx = 0;
        this.dy = 0;
      } else {
        this.dx = tdx / STICK_MAX;
        this.dy = tdy / STICK_MAX;
      }
    }
  }

  _handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.stickTouchId) {
        this.stickTouchId = null;
        this.dx = 0;
        this.dy = 0;
        this.stickVisible = false;
      }
      if (touch.identifier === this.dashTouchId) {
        this.dashTouchId = null;
        this.dashPressed = false;
      }
    }
  }

  /** Canvas上にスティック＋ダッシュボタンを描画 */
  render(ctx) {
    if (!this.active) return;

    // 仮想スティック（タッチ時のみ）
    if (this.stickVisible) this._renderStick(ctx);

    // ダッシュボタン（常時表示）
    this._renderDashButton(ctx);
  }

  _renderStick(ctx) {
    const tdx = this.stickX - this.originX;
    const tdy = this.stickY - this.originY;
    const dist = Math.sqrt(tdx * tdx + tdy * tdy);
    const intensity = Math.min(1, dist / STICK_MAX); // 0..1

    ctx.save();

    // 外円: 背景塗り + グロー
    ctx.shadowColor = 'rgba(240, 192, 96, 0.5)';
    ctx.shadowBlur = 16;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(this.originX, this.originY, STICK_MAX, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowBlur = 0;

    // 外円: 輪郭
    ctx.globalAlpha = 0.5 + intensity * 0.3;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f0c060';
    ctx.stroke();

    // 方向インジケータ (移動中のみ)
    if (intensity > 0.15) {
      const dirX = this.originX + (tdx / dist) * (STICK_MAX - 6);
      const dirY = this.originY + (tdy / dist) * (STICK_MAX - 6);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(dirX, dirY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd080';
      ctx.fill();
    }

    // 内円（スティックノブ）: 放射グラデーション
    const innerRadius = 22;
    const grad = ctx.createRadialGradient(
      this.stickX - 6, this.stickY - 6, 2,
      this.stickX, this.stickY, innerRadius
    );
    grad.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
    grad.addColorStop(0.6, 'rgba(240, 192, 96, 0.85)');
    grad.addColorStop(1, 'rgba(180, 130, 50, 0.7)');
    ctx.globalAlpha = 0.85 + intensity * 0.15;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.stickX, this.stickY, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 内円: 輪郭
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  }

  _renderDashButton(ctx) {
    const x = this.dashBtnX;
    const y = this.dashBtnY;
    const r = DASH_BTN_RADIUS;
    const pressed = this.dashPressed;

    ctx.save();

    // 外円: 背景
    ctx.globalAlpha = pressed ? 0.75 : 0.45;
    ctx.fillStyle = pressed ? '#ffd080' : '#000';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 輪郭
    ctx.globalAlpha = pressed ? 1.0 : 0.75;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f0c060';
    ctx.stroke();

    // 稲妻アイコン
    ctx.globalAlpha = pressed ? 1.0 : 0.85;
    ctx.fillStyle = pressed ? '#1a1a2e' : '#ffd080';
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 14);
    ctx.lineTo(x + 6, y - 2);
    ctx.lineTo(x - 1, y - 2);
    ctx.lineTo(x + 4, y + 14);
    ctx.lineTo(x - 6, y + 2);
    ctx.lineTo(x + 1, y + 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  destroy() {
    if (this.isMobile) {
      const el = this._targetEl || window;
      el.removeEventListener('touchstart', this._onTouchStart);
      el.removeEventListener('touchmove', this._onTouchMove);
      el.removeEventListener('touchend', this._onTouchEnd);
      el.removeEventListener('touchcancel', this._onTouchEnd);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
    }
  }
}

// ----- 後方互換: 旧プロパティ名との互換 -----
// 既存コードが `touchId` を参照していた場合の保険（現行コードは未使用）
Object.defineProperty(MobileControls.prototype, 'touchId', {
  get() { return this.stickTouchId; },
  set(v) { this.stickTouchId = v; },
});
Object.defineProperty(MobileControls.prototype, 'visible', {
  get() { return this.stickVisible; },
  set(v) { this.stickVisible = v; },
});
