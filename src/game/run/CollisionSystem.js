/**
 * CollisionSystem — 空間ハッシュグリッドによる衝突判定
 */

export class CollisionSystem {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    // キーは (cx + OFFSET) * STRIDE + (cy + OFFSET) の整数
    // 200敵×4セル/frameで48k文字列生成 → GC 負荷を排除
    this._grid = new Map();
  }

  clear() {
    this._grid.clear();
  }

  /** cx, cy は Int32 相当を想定（±32767 範囲で衝突しない整数キー化） */
  _key(cx, cy) {
    // 32bit 範囲に収めるため 16bit ずつ詰める（±32768 セル = ±2M px で cellSize=64 なら十分）
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
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
