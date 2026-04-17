/**
 * chancePatterns.js — チャンス目・リーチ目の停止パターン定義
 *
 * チャンス目・リーチ目は専用絵柄を持たず、既存絵柄の特定停止パターンで表現する。
 * ReelController はこのテーブルからランダムに1つ選んで強制停止させる。
 *
 * 各パターンは3リール × 3コマ（上段/中段/下段）の絵柄指定。
 */

/**
 * @typedef {Object} StopPattern
 * @property {import('./symbols.js').SymbolId[]} left   - 左リール [上段, 中段, 下段]
 * @property {import('./symbols.js').SymbolId[]} center - 中リール [上段, 中段, 下段]
 * @property {import('./symbols.js').SymbolId[]} right  - 右リール [上段, 中段, 下段]
 * @property {string} description
 */

/** 通常時用チャンス目パターン */
/** @type {StopPattern[]} */
export const CHANCE_STOP_PATTERNS = [
  {
    left:   ['BELL', 'WATERMELON', 'CHERRY'],
    center: ['CHERRY', 'BELL', 'WATERMELON'],
    right:  ['WATERMELON', 'CHERRY', 'BELL'],
    description: '異種三段（中段ベル・スイカ・チェリー）',
  },
  {
    left:   ['BIG7', 'REPLAY', 'BELL'],
    center: ['BELL', 'BIG7', 'REPLAY'],
    right:  ['REPLAY', 'BELL', 'BLUE7'],
    description: '右下がり赤7テンパイハズレ',
  },
];

/** BONUS_STANDBY 中のリーチ目（確定告知用） */
/** @type {StopPattern[]} */
export const REACHME_STOP_PATTERNS = [
  {
    left:   ['BIG7', 'BIG7', 'BELL'],
    center: ['BIG7', 'BIG7', 'REPLAY'],
    right:  ['BIG7', 'BELL', 'BIG7'],
    description: '中段赤7テンパイ→右リール上段赤7停止（確定出目）',
  },
  {
    left:   ['BLUE7', 'BLUE7', 'REPLAY'],
    center: ['BLUE7', 'BLUE7', 'WATERMELON'],
    right:  ['BLUE7', 'REPLAY', 'BLUE7'],
    description: '中段青7テンパイ→右リール上段青7停止（ART示唆）',
  },
];
