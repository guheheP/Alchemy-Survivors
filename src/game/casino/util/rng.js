/**
 * rng.js — Seedable RNG (Mulberry32)
 *
 * 再現性のあるテストとシミュレーション用。本番でも安定した擬似乱数として使用。
 * Math.random() よりも分布が均一で、同じseedなら同じ列を生成する。
 */

/**
 * Mulberry32 実装
 * @param {number} seed
 * @returns {() => number} 0 <= x < 1 を返す関数
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RNGラッパー。整数範囲の取得を便利にする。
 */
export class Rng {
  /**
   * @param {number} [seed] 省略時は現在時刻ベース
   */
  constructor(seed) {
    const s = (seed === undefined) ? (Date.now() >>> 0) : (seed >>> 0);
    this._next = mulberry32(s);
    this.seed = s;
  }

  /** @returns {number} [0, 1) */
  next() {
    return this._next();
  }

  /**
   * [0, max) の整数を返す
   * @param {number} max
   * @returns {number}
   */
  nextInt(max) {
    return Math.floor(this._next() * max);
  }

  /**
   * min <= x < max の整数を返す
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  range(min, max) {
    return min + this.nextInt(max - min);
  }

  /**
   * 配列からランダムに1要素を返す
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  pick(arr) {
    return arr[this.nextInt(arr.length)];
  }
}

/**
 * 確率テーブルからフラグを抽選する
 * @param {Record<string, number>} distribution - 分布オブジェクト（合計=denom）
 * @param {number} denom - 分母
 * @param {Rng} rng
 * @returns {string} 抽選結果のキー
 */
export function drawFromDistribution(distribution, denom, rng) {
  const r = rng.nextInt(denom);
  let cumulative = 0;
  for (const [key, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (r < cumulative) return key;
  }
  // 分布不一致時のフォールバック
  return Object.keys(distribution)[0];
}
