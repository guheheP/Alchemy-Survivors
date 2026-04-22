/**
 * RtmReelController.js — Road to Millionaire のリール停止位置計算
 *
 * 既存の ReelController (slot/) と違い BIG/REG/BLUE7 絡みが無いため大幅に単純化。
 * 特別揃いは AT_STANDBY の GOD揃いのみ。通常の小役は引き込みで揃え、none は
 * 全ラインで揃わないようランダム停止させる。
 */

import { RTM_REELS, RTM_REEL_LENGTH } from './data/rtmReels.js';

/** @typedef {import('./data/rtmSymbols.js').RtmSymbolId} RtmSymbolId */
/** @typedef {'NORMAL'|'AT_STANDBY'|'AT'|'TENJOU'} RtmPhase */

/**
 * @typedef {Object} RtmPayline
 * @property {number} id
 * @property {string} name
 * @property {number[]} rows - 各リールで絵柄が表示される行 (0=上段/1=中段/2=下段)
 */

/** RTM の5ライン */
/** @type {RtmPayline[]} */
export const RTM_PAYLINES = [
  { id: 0, name: '中段',     rows: [1, 1, 1] },
  { id: 1, name: '上段',     rows: [0, 0, 0] },
  { id: 2, name: '下段',     rows: [2, 2, 2] },
  { id: 3, name: '右下がり', rows: [0, 1, 2] },
  { id: 4, name: '右上がり', rows: [2, 1, 0] },
];

/**
 * @typedef {Object} RtmStopFrame
 * @property {RtmSymbolId[]} left
 * @property {RtmSymbolId[]} center
 * @property {RtmSymbolId[]} right
 */

/**
 * @typedef {Object} RtmStopResult
 * @property {RtmStopFrame} frame
 * @property {number[]} stopIndexes
 * @property {RtmPayline|null} winLine
 * @property {{col:number,row:number}[]} winCells
 * @property {boolean} godAligned
 */

/**
 * 指定絵柄を指定行に表示できる stopIndex をランダムに1つ選ぶ
 * @param {RtmSymbolId[]} reel
 * @param {RtmSymbolId} targetSymbol
 * @param {number} row - 0=上段 / 1=中段 / 2=下段
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number}
 */
function pickStopIndexForRow(reel, targetSymbol, row, rng) {
  const positions = [];
  const N = reel.length;
  for (let i = 0; i < N; i++) {
    if (reel[i] === targetSymbol) {
      // reel[i] を row に置く: stopIndex = (i - row + 1 + N) % N
      positions.push((i - row + 1 + N) % N);
    }
  }
  if (positions.length === 0) return rng.nextInt(N);
  return positions[rng.nextInt(positions.length)];
}

function alignOnPayline(leftSym, centerSym, rightSym, line, rng) {
  return [
    pickStopIndexForRow(RTM_REELS[0], leftSym, line.rows[0], rng),
    pickStopIndexForRow(RTM_REELS[1], centerSym, line.rows[1], rng),
    pickStopIndexForRow(RTM_REELS[2], rightSym, line.rows[2], rng),
  ];
}

function frameFromStopIndexes(stopIndexes) {
  return {
    left:   framePair(RTM_REELS[0], stopIndexes[0]),
    center: framePair(RTM_REELS[1], stopIndexes[1]),
    right:  framePair(RTM_REELS[2], stopIndexes[2]),
  };
}

function framePair(reel, middleIndex) {
  const N = reel.length;
  return [
    reel[(middleIndex - 1 + N) % N],
    reel[middleIndex],
    reel[(middleIndex + 1) % N],
  ];
}

function winCellsForPayline(line) {
  return line.rows.map((row, col) => ({ col, row }));
}

/**
 * フラグと状態からリール停止情報を生成
 * @param {import('./RtmEngine.js').RtmDrawResult} flags
 * @param {RtmPhase} phase
 * @param {import('../util/rng.js').Rng} rng
 * @returns {RtmStopResult}
 */
export function computeStopFrame(flags, phase, rng) {
  // (A) AT_STANDBY: ランダムペイラインにGODを揃える
  if (phase === 'AT_STANDBY') {
    const line = rng.pick(RTM_PAYLINES);
    const stopIndexes = alignOnPayline('GOD', 'GOD', 'GOD', line, rng);
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes,
      winLine: line,
      winCells: winCellsForPayline(line),
      godAligned: true,
    };
  }

  // (B) 小役フラグ別の停止形
  const flag = flags.smallFlag;
  if (flag === 'bell') {
    const line = rng.next() < 0.5 ? RTM_PAYLINES[0] : RTM_PAYLINES[1];
    const stopIndexes = alignOnPayline('BELL', 'BELL', 'BELL', line, rng);
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes, winLine: line, winCells: winCellsForPayline(line),
      godAligned: false,
    };
  }
  if (flag === 'watermelon') {
    const line = rng.next() < 0.5 ? RTM_PAYLINES[3] : RTM_PAYLINES[4];
    const stopIndexes = alignOnPayline('WATERMELON', 'WATERMELON', 'WATERMELON', line, rng);
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes, winLine: line, winCells: winCellsForPayline(line),
      godAligned: false,
    };
  }
  if (flag === 'cherry') {
    // チェリー: 左リール下段のみ
    const leftStop = pickStopIndexForRow(RTM_REELS[0], 'CHERRY', 2, rng);
    const centerStop = rng.nextInt(RTM_REEL_LENGTH);
    const rightStop = rng.nextInt(RTM_REEL_LENGTH);
    const stopIndexes = [leftStop, centerStop, rightStop];
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes,
      winLine: null,
      winCells: [{ col: 0, row: 2 }],
      godAligned: false,
    };
  }
  if (flag === 'replay') {
    const line = RTM_PAYLINES[0];
    const stopIndexes = alignOnPayline('REPLAY', 'REPLAY', 'REPLAY', line, rng);
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes, winLine: line, winCells: winCellsForPayline(line),
      godAligned: false,
    };
  }
  if (flag === 'chance') {
    // チャンス目: MONEYテンパイハズレ演出
    const stopIndexes = [
      pickStopIndexForRow(RTM_REELS[0], 'MONEY', 1, rng),
      pickStopIndexForRow(RTM_REELS[1], 'MONEY', 1, rng),
      pickStopIndexForRow(RTM_REELS[2], 'REPLAY', 1, rng),
    ];
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes,
      winLine: null,
      winCells: [],
      godAligned: false,
    };
  }

  // (C) none: 無作為停止
  const stopIndexes = [
    rng.nextInt(RTM_REEL_LENGTH),
    rng.nextInt(RTM_REEL_LENGTH),
    rng.nextInt(RTM_REEL_LENGTH),
  ];
  return {
    frame: frameFromStopIndexes(stopIndexes),
    stopIndexes,
    winLine: null,
    winCells: [],
    godAligned: false,
  };
}
