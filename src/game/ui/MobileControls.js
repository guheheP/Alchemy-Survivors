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

  destroy() {
    if (this.isMobile) {
      window.removeEventListener('touchstart', this._onTouchStart);
      window.removeEventListener('touchmove', this._onTouchMove);
      window.removeEventListener('touchend', this._onTouchEnd);
      window.removeEventListener('touchcancel', this._onTouchEnd);
    }
  }
}
