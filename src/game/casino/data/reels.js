/**
 * reels.js — 3リール × 21コマ の絵柄配列
 *
 * index 0 → 1 → 2 ... → 20 の順にリールが上から下に並ぶ。
 * リール回転時は index が加算されていく（循環）。
 * payline（中段）に表示される絵柄は state.reelIndex[i] の位置で決まる。
 */

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_LEFT = [
  'BELL', 'REPLAY', 'WATERMELON', 'BELL', 'CHERRY', 'BIG7',
  'BELL', 'REPLAY', 'BELL', 'BIG7', 'BELL', 'REPLAY',
  'WATERMELON', 'BELL', 'BLUE7', 'BELL', 'REPLAY', 'CHERRY',
  'BELL', 'BIG7', 'REPLAY',
];

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_CENTER = [
  'REPLAY', 'BELL', 'CHERRY', 'BIG7', 'BELL', 'REPLAY',
  'WATERMELON', 'BELL', 'REPLAY', 'BLUE7', 'BELL', 'CHERRY',
  'REPLAY', 'BIG7', 'BELL', 'REPLAY', 'WATERMELON', 'BELL',
  'BIG7', 'REPLAY', 'BELL',
];

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_RIGHT = [
  'BELL', 'REPLAY', 'CHERRY', 'BELL', 'BIG7', 'REPLAY',
  'WATERMELON', 'BELL', 'REPLAY', 'BELL', 'BLUE7', 'REPLAY',
  'CHERRY', 'BELL', 'BIG7', 'REPLAY', 'WATERMELON', 'BELL',
  'REPLAY', 'BIG7', 'BELL',
];

export const REELS = [REEL_LEFT, REEL_CENTER, REEL_RIGHT];
export const REEL_LENGTH = 21; // 各リールのコマ数
