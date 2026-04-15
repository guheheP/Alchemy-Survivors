/**
 * Camera — ビューポート追従カメラ
 */

import { GameFeelSettings } from '../core/GameFeelSettings.js';

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
    // 方向付きシェイク: 衝撃方向に寄った振動（ノックバック/突進演出用）
    this._shakeDirX = 0;
    this._shakeDirY = 0;
    this._shakeBias = 0; // 0=全方向ランダム, 1=完全に方向付き
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
      // bias 0=ランダム, 1=方向オフセット固定、中間でブレンド
      const rx = (Math.random() - 0.5) * 2 * mag;
      const ry = (Math.random() - 0.5) * 2 * mag;
      const bias = this._shakeBias;
      this._shakeOffsetX = rx * (1 - bias) + this._shakeDirX * mag * bias;
      this._shakeOffsetY = ry * (1 - bias) + this._shakeDirY * mag * bias;
      if (this._shakeTimer <= 0) {
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
      }
    }
  }

  /** 画面シェイクを追加（既存より強ければ上書き） */
  shake(power, duration) {
    if (!GameFeelSettings.screenShakeEnabled) return;
    if (power > this._shakePower * (this._shakeTimer / Math.max(0.01, this._shakeMax))) {
      this._shakePower = power;
      this._shakeTimer = duration;
      this._shakeMax = duration;
      this._shakeBias = 0;
      this._shakeDirX = 0;
      this._shakeDirY = 0;
    }
  }

  /**
   * 方向付きシェイク — 衝撃方向に寄った振動。
   * (dx, dy) は正規化されたベクトル（自動正規化）。
   */
  shakeDir(dx, dy, power, duration, bias = 0.6) {
    if (!GameFeelSettings.screenShakeEnabled) return;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;
    if (power > this._shakePower * (this._shakeTimer / Math.max(0.01, this._shakeMax))) {
      this._shakePower = power;
      this._shakeTimer = duration;
      this._shakeMax = duration;
      this._shakeBias = Math.max(0, Math.min(1, bias));
      this._shakeDirX = nx;
      this._shakeDirY = ny;
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
