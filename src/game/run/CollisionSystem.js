/**
 * CollisionSystem — 空間ハッシュグリッドによる衝突判定
 */

export class CollisionSystem {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this._grid = new Map();
  }

  clear() {
    this._grid.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  /** エンティティをグリッドに挿入 */
  insert(entity) {
    const r = entity.radius || 0;
    const minCX = Math.floor((entity.x - r) / this.cellSize);
    const maxCX = Math.floor((entity.x + r) / this.cellSize);
    const minCY = Math.floor((entity.y - r) / this.cellSize);
    const maxCY = Math.floor((entity.y + r) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = this._key(cx, cy);
        let cell = this._grid.get(key);
        if (!cell) {
          cell = [];
          this._grid.set(key, cell);
        }
        cell.push(entity);
      }
    }
  }

  /** 範囲内のエンティティを検索 */
  query(x, y, radius) {
    const results = new Set();
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this._grid.get(this._key(cx, cy));
        if (cell) {
          for (const entity of cell) {
            results.add(entity);
          }
        }
      }
    }
    return results;
  }

  /** 2つの円が重なっているか */
  static circleOverlap(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = dx * dx + dy * dy;
    const rSum = (a.radius || 0) + (b.radius || 0);
    return dist < rSum * rSum;
  }

  /** 扇形（ファン）内に点があるか判定 */
  static pointInFan(px, py, originX, originY, angle, arc, range) {
    const dx = px - originX;
    const dy = py - originY;
    const distSq = dx * dx + dy * dy;
    if (distSq > range * range) return false;

    const pointAngle = Math.atan2(dy, dx);
    let diff = pointAngle - angle;
    // -PI ~ PI に正規化
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return Math.abs(diff) <= arc / 2;
  }
}
