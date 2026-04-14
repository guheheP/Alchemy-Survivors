/**
 * Camera — ビューポート追従カメラ
 */

export class Camera {
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.smoothing = 0.1;
    this._shakePower = 0;
    this._shakeTimer = 0;
    this._shakeMax = 0;
    this._shakeOffsetX = 0;
    this._shakeOffsetY = 0;
  }

  /** ターゲットを追従 */
  follow(targetX, targetY, dt) {
    const t = 1 - Math.pow(1 - this.smoothing, dt * 60);
    this.x += (targetX - this.width / 2 - this.x) * t;
    this.y += (targetY - this.height / 2 - this.y) * t;

    // シェイク更新
    if (this._shakeTimer > 0) {
      this._shakeTimer -= dt;
      const pct = Math.max(0, this._shakeTimer / this._shakeMax);
      const mag = this._shakePower * pct;
      this._shakeOffsetX = (Math.random() - 0.5) * 2 * mag;
      this._shakeOffsetY = (Math.random() - 0.5) * 2 * mag;
      if (this._shakeTimer <= 0) {
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
      }
    }
  }

  /** 画面シェイクを追加（既存より強ければ上書き） */
  shake(power, duration) {
    if (power > this._shakePower * (this._shakeTimer / Math.max(0.01, this._shakeMax))) {
      this._shakePower = power;
      this._shakeTimer = duration;
      this._shakeMax = duration;
    }
  }

  /** ワールド座標 → スクリーン座標 */
  worldToScreenX(wx) { return wx - this.x; }
  worldToScreenY(wy) { return wy - this.y; }

  /** シェイクオフセット（描画時にctxへ translate する用） */
  get shakeX() { return this._shakeOffsetX; }
  get shakeY() { return this._shakeOffsetY; }

  /** エンティティが描画範囲内か判定（パディング付き） */
  isVisible(x, y, radius, padding = 50) {
    return (
      x + radius + padding > this.x &&
      x - radius - padding < this.x + this.width &&
      y + radius + padding > this.y &&
      y - radius - padding < this.y + this.height
    );
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
}
