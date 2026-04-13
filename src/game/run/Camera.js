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
  }

  /** ターゲットを追従 */
  follow(targetX, targetY, dt) {
    const t = 1 - Math.pow(1 - this.smoothing, dt * 60);
    this.x += (targetX - this.width / 2 - this.x) * t;
    this.y += (targetY - this.height / 2 - this.y) * t;
  }

  /** ワールド座標 → スクリーン座標 */
  worldToScreenX(wx) { return wx - this.x; }
  worldToScreenY(wy) { return wy - this.y; }

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
