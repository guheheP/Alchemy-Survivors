/**
 * Entity — 全ゲームオブジェクトの基底クラス
 */

export class Entity {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.radius = 10;
    this.active = false;
    this.type = 'entity';
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.active = false;
  }

  /** 補間位置を返す（描画用） */
  lerpX(alpha) { return this.prevX + (this.x - this.prevX) * alpha; }
  lerpY(alpha) { return this.prevY + (this.y - this.prevY) * alpha; }

  savePrev() {
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
