/**
 * rtmReels.js — Road to Millionaire 3リール × 21コマ の絵柄配列
 *
 * 設計方針:
 *   - GOD は各リールに1個のみ配置（ラッキー図柄感の演出）。各リールのGOD位置を
 *     ずらすことで「GOD狙い」の視認性を担保。通常時のGODテンパイ確率は
 *     (1/21)^2 ≒ 0.23% と低めに設定、AT_STANDBY時はコントロールが効く。
 *   - MONEY は各リール2個。チャンス目テンパイハズレ演出やレア示唆に使う。
 *   - WATERMELON/CHERRY は各リール2〜3個ずつ。引き込み距離(最大4コマ)内で必ず拾える配置。
 *   - WM の直下 BELL 衝突回避: 旧来のスロットreels.js と同じく、スイカ下はリプレイ/別図柄。
 *   - BELL は全リール多め(8-9個)に配置し、ART中の押し順ナビで拾える構造。
 *   - REPLAY は中頻度(5-6個)、AT中に押し順ナビで純増リプレイの対象になる。
 */

/** @type {import('./rtmSymbols.js').RtmSymbolId[]} */
export const RTM_REEL_LEFT = [
  'BELL', 'REPLAY', 'CHERRY', 'BELL', 'WATERMELON', 'MONEY',
  'BELL', 'REPLAY', 'BELL', 'CHERRY', 'MONEY', 'BELL',
  'REPLAY', 'WATERMELON', 'BELL', 'GOD', 'REPLAY', 'BELL',
  'CHERRY', 'MONEY', 'REPLAY',
];

/** @type {import('./rtmSymbols.js').RtmSymbolId[]} */
export const RTM_REEL_CENTER = [
  'REPLAY', 'BELL', 'WATERMELON', 'REPLAY', 'BELL', 'CHERRY',
  'BELL', 'MONEY', 'REPLAY', 'BELL', 'GOD', 'BELL',
  'WATERMELON', 'REPLAY', 'BELL', 'MONEY', 'BELL', 'CHERRY',
  'REPLAY', 'BELL', 'REPLAY',
];

/** @type {import('./rtmSymbols.js').RtmSymbolId[]} */
export const RTM_REEL_RIGHT = [
  'BELL', 'WATERMELON', 'REPLAY', 'BELL', 'MONEY', 'CHERRY',
  'BELL', 'REPLAY', 'BELL', 'WATERMELON', 'REPLAY', 'CHERRY',
  'BELL', 'GOD', 'REPLAY', 'BELL', 'MONEY', 'REPLAY',
  'BELL', 'REPLAY', 'CHERRY',
];

export const RTM_REELS = [RTM_REEL_LEFT, RTM_REEL_CENTER, RTM_REEL_RIGHT];
export const RTM_REEL_LENGTH = 21;
