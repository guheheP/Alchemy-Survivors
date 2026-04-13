/**
 * MobileControls — モバイル仮想スティック
 */

const DEAD_ZONE = 10;
const STICK_MAX = 60;

export class MobileControls {
  constructor() {
    this.active = false;
    this.dx = 0;
    this.dy = 0;

    // スティック描画用
    this.touchId = null;
    this.originX = 0;
    this.originY = 0;
    this.stickX = 0;
    this.stickY = 0;
    this.visible = false;

    // タッチデバイス検出
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (this.isMobile) {
      this.active = true;
      this._onTouchStart = this._handleTouchStart.bind(this);
      this._onTouchMove = this._handleTouchMove.bind(this);
      this._onTouchEnd = this._handleTouchEnd.bind(this);
      window.addEventListener('touchstart', this._onTouchStart, { passive: false });
      window.addEventListener('touchmove', this._onTouchMove, { passive: false });
      window.addEventListener('touchend', this._onTouchEnd);
      window.addEventListener('touchcancel', this._onTouchEnd);
    }
  }

  _handleTouchStart(e) {
    e.preventDefault();
    if (this.touchId !== null) return;

    const touch = e.changedTouches[0];
    // 左半分のタッチのみスティック（右半分は将来のアクションボタン用）
    if (touch.clientX < window.innerWidth * 0.6) {
      this.touchId = touch.identifier;
      this.originX = touch.clientX;
      this.originY = touch.clientY;
      this.stickX = touch.clientX;
      this.stickY = touch.clientY;
      this.visible = true;
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier !== this.touchId) continue;

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
      if (touch.identifier === this.touchId) {
        this.touchId = null;
        this.dx = 0;
        this.dy = 0;
        this.visible = false;
      }
    }
  }

  /** Canvas上にスティックを描画 */
  render(ctx) {
    if (!this.active || !this.visible) return;

    // 外円
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(this.originX, this.originY, STICK_MAX, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内円（スティック位置）
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(this.stickX, this.stickY, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  destroy() {
    if (this.isMobile) {
      window.removeEventListener('touchstart', this._onTouchStart);
      window.removeEventListener('touchmove', this._onTouchMove);
      window.removeEventListener('touchend', this._onTouchEnd);
      window.removeEventListener('touchcancel', this._onTouchEnd);
    }
  }
}
