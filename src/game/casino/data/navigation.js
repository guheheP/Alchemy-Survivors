/**
 * navigation.js — ART中の押し順ナビ定義
 *
 * ART中はベル/リプレイ成立時にナビ（押し順指示）が表示される。
 *   - ナビ通りに押せば ART_PAYOUTS（純増寄り）
 *   - 外すと PAYOUTS（通常払い出し = 取りこぼし扱い）
 *
 * 押し順は左=0 / 中=1 / 右=2 の3要素順列。6通り。
 */

/** 全押し順（6通り） */
export const NAV_ORDERS = [
  [0, 1, 2], // 左→中→右（順押し）
  [0, 2, 1], // 左→右→中
  [1, 0, 2], // 中→左→右
  [1, 2, 0], // 中→右→左
  [2, 0, 1], // 右→左→中
  [2, 1, 0], // 右→中→左（逆押し）
];

/**
 * ART中にナビ対象となる役か
 * @param {string} smallFlag
 * @returns {boolean}
 */
export function isNavRole(smallFlag) {
  return smallFlag === 'bell' || smallFlag === 'replay';
}

/**
 * 押し順をランダムに1つ選ぶ
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number[]}
 */
export function pickNavOrder(rng) {
  return NAV_ORDERS[rng.nextInt(NAV_ORDERS.length)];
}

/**
 * プレイヤーの押し順が期待順と一致したか
 * @param {number[]} expected - 期待押し順（reelIdx の配列）
 * @param {number[]} actual - 実際の押し順
 * @returns {boolean}
 */
export function isOrderMatched(expected, actual) {
  if (!expected || !actual) return false;
  if (expected.length !== actual.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

/**
 * 表示用: 押し順を矢印ラベルに変換（例: "1→2→3"）
 * @param {number[]} order
 * @returns {string}
 */
export function formatOrder(order) {
  if (!order) return '';
  return order.map(i => ['左', '中', '右'][i] || '?').join('→');
}
