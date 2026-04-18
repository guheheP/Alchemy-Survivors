/**
 * reels.js — 3リール × 21コマ の絵柄配列
 *
 * index 0 → 1 → 2 ... → 20 の順にリールが上から下に並ぶ。
 * リール回転時は index が加算されていく（循環）。
 * payline（中段）に表示される絵柄は state.reelIndex[i] の位置で決まる。
 */

/**
 * 配列設計上の制約:
 *   WATERMELON の直下（index+1）が BELL だと、上段にスイカを揃える際に
 *   必ず中段に BELL ラインが重なる視覚衝突が生じる。そのため WM と直下BELL は
 *   必ず入れ替えてある（旧: [...REPLAY, WM, BELL, ...] / 新: [...REPLAY, BELL, WM, ...]）。
 *   ベル・スイカ・リプレイが「他の役と同時ライン揃い」になる見た目を避ける設計。
 */

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_LEFT = [
  'BELL', 'REPLAY', 'BELL', 'WATERMELON', 'CHERRY', 'BIG7',
  'BELL', 'REPLAY', 'BELL', 'BIG7', 'BELL', 'REPLAY',
  'BELL', 'WATERMELON', 'BLUE7', 'BELL', 'REPLAY', 'CHERRY',
  'BELL', 'BIG7', 'REPLAY',
];

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_CENTER = [
  'REPLAY', 'BELL', 'CHERRY', 'BIG7', 'BELL', 'REPLAY',
  'BELL', 'WATERMELON', 'REPLAY', 'BLUE7', 'BELL', 'CHERRY',
  'REPLAY', 'BIG7', 'BELL', 'REPLAY', 'BELL', 'WATERMELON',
  'BIG7', 'REPLAY', 'BELL',
];

/** @type {import('./symbols.js').SymbolId[]} */
export const REEL_RIGHT = [
  'BELL', 'REPLAY', 'CHERRY', 'BELL', 'BIG7', 'REPLAY',
  'BELL', 'WATERMELON', 'REPLAY', 'BELL', 'BLUE7', 'REPLAY',
  'CHERRY', 'BELL', 'BIG7', 'REPLAY', 'BELL', 'WATERMELON',
  'REPLAY', 'BIG7', 'BELL',
];

export const REELS = [REEL_LEFT, REEL_CENTER, REEL_RIGHT];
export const REEL_LENGTH = 21; // 各リールのコマ数
