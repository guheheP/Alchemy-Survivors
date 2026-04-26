/**
 * stopPatterns.js — フラグ別の固定停止パターン
 *
 * 設計方針:
 *   ハズレを含むすべての小役フラグに対して、事前検証済みの「数パターンの固定の出目」を
 *   モジュール読み込み時に列挙・決定論的サンプリングで構築する。
 *   ReelController はランタイムでこの中から1つを抽選するだけにすることで、
 *   ・引き込みミス（リプレイ時に左チェリーが見えてしまう等）
 *   ・競合揃い（リプレイ時にBELLが他ラインで揃ってしまう等）
 *   が原理的に発生しなくなる。
 *
 *   リール配列を変更したら verify_stop_patterns.mjs を実行して件数とビジュアルを確認すること。
 */

import { REEL_LEFT, REEL_CENTER, REEL_RIGHT, REEL_LENGTH } from './reels.js';

/** @typedef {import('./symbols.js').SymbolId} SymbolId */
/** @typedef {{ id:number, name:string, rows:number[] }} Payline */
/** @typedef {{ stops:number[], frame:SymbolId[][], winLine:Payline|null, winCells:{col:number,row:number}[] }} StopPattern */

const N = REEL_LENGTH;

/** @type {Payline[]} */
export const PAYLINES = [
  { id: 1, name: 'mid',       rows: [1, 1, 1] },
  { id: 2, name: 'top',       rows: [0, 0, 0] },
  { id: 3, name: 'bottom',    rows: [2, 2, 2] },
  { id: 4, name: 'diag-down', rows: [0, 1, 2] },
  { id: 5, name: 'diag-up',   rows: [2, 1, 0] },
];

const LINE_MID       = PAYLINES[0];
const LINE_TOP       = PAYLINES[1];
const LINE_DIAG_DOWN = PAYLINES[3];
const LINE_DIAG_UP   = PAYLINES[4];

function reelFrame(reel, stopIdx) {
  return [
    reel[(stopIdx - 1 + N) % N],
    reel[stopIdx],
    reel[(stopIdx + 1) % N],
  ];
}

function makeFrame(stops) {
  return [
    reelFrame(REEL_LEFT, stops[0]),
    reelFrame(REEL_CENTER, stops[1]),
    reelFrame(REEL_RIGHT, stops[2]),
  ];
}

function lineMatches(line, frame, sym) {
  const [rL, rC, rR] = line.rows;
  return frame[0][rL] === sym && frame[1][rC] === sym && frame[2][rR] === sym;
}

function findLineForSymbol(frame, sym) {
  for (const l of PAYLINES) if (lineMatches(l, frame, sym)) return l;
  return null;
}

function frameColContains(frame, col, sym) {
  return frame[col][0] === sym || frame[col][1] === sym || frame[col][2] === sym;
}

function noConflictAlignment(frame, conflictSymbols) {
  for (const s of conflictSymbols) if (findLineForSymbol(frame, s)) return false;
  return true;
}

function winCellsForLine(line) {
  return line.rows.map((row, col) => ({ col, row }));
}

function enumerate(predicate) {
  const out = [];
  for (let l = 0; l < N; l++) {
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N; r++) {
        const stops = [l, c, r];
        const frame = makeFrame(stops);
        const meta = predicate(frame, stops);
        if (meta) {
          out.push({
            stops,
            frame,
            winLine: meta.winLine || null,
            winCells: meta.winCells || (meta.winLine ? winCellsForLine(meta.winLine) : []),
          });
        }
      }
    }
  }
  return out;
}

function deterministicSample(arr, n) {
  if (arr.length === 0) return [];
  if (arr.length <= n) return arr.slice();
  const step = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

const TARGET_COUNTS = {
  replay: 6,
  bell_diag: 6,
  watermelon_diag: 6,
  watermelon_top: 4,
  cherry: 6,
  cherry_double_updown: 3,
  cherry_double_downup: 3,
  reachme: 4,
  chance_a: 3,
  chance_b: 3,
  none: 12,
};

function buildReplayPatterns() {
  const all = enumerate((frame) => {
    if (!lineMatches(LINE_MID, frame, 'REPLAY')) return null;
    if (frameColContains(frame, 0, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON'])) return null;
    return { winLine: LINE_MID };
  });
  return deterministicSample(all, TARGET_COUNTS.replay);
}

function buildBellDiagPatterns() {
  // 通常時ベル揃いは右下がり (diag-down) のみ
  const all = enumerate((frame) => {
    if (!lineMatches(LINE_DIAG_DOWN, frame, 'BELL')) return null;
    if (frameColContains(frame, 0, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['WATERMELON', 'REPLAY'])) return null;
    return { winLine: LINE_DIAG_DOWN };
  });
  return deterministicSample(all, TARGET_COUNTS.bell_diag);
}

function buildWatermelonDiagPatterns() {
  const out = [];
  for (const line of [LINE_DIAG_DOWN, LINE_DIAG_UP]) {
    const all = enumerate((frame) => {
      if (!lineMatches(line, frame, 'WATERMELON')) return null;
      // 左リール中段にWATERMELONを引き込まない (中段スイカリプチェ等の弱役パターンと衝突しないため)
      if (frame[0][1] === 'WATERMELON') return null;
      if (!noConflictAlignment(frame, ['BELL', 'REPLAY'])) return null;
      return { winLine: line };
    });
    out.push(...deterministicSample(all, Math.ceil(TARGET_COUNTS.watermelon_diag / 2)));
  }
  return out;
}

function buildWatermelonTopPatterns() {
  const all = enumerate((frame) => {
    if (!lineMatches(LINE_TOP, frame, 'WATERMELON')) return null;
    // 左リール中段にWATERMELONを引き込まない
    if (frame[0][1] === 'WATERMELON') return null;
    if (!noConflictAlignment(frame, ['BELL', 'REPLAY'])) return null;
    return { winLine: LINE_TOP };
  });
  return deterministicSample(all, TARGET_COUNTS.watermelon_top);
}

function buildCherryPatterns() {
  const all = enumerate((frame) => {
    if (frame[0][2] !== 'CHERRY') return null;
    if (frame[0][0] === 'CHERRY' || frame[0][1] === 'CHERRY') return null;
    if (frameColContains(frame, 1, 'CHERRY')) return null;
    if (frameColContains(frame, 2, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [{ col: 0, row: 2 }] };
  });
  return deterministicSample(all, TARGET_COUNTS.cherry);
}

function buildCherryDoublePatterns() {
  const upDown = enumerate((frame) => {
    if (frame[0][0] !== 'CHERRY' || frame[2][2] !== 'CHERRY') return null;
    if (frameColContains(frame, 1, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [{ col: 0, row: 0 }] };
  });
  const downUp = enumerate((frame) => {
    if (frame[0][2] !== 'CHERRY' || frame[2][0] !== 'CHERRY') return null;
    if (frameColContains(frame, 1, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [{ col: 0, row: 2 }] };
  });
  return [
    ...deterministicSample(upDown, TARGET_COUNTS.cherry_double_updown),
    ...deterministicSample(downUp, TARGET_COUNTS.cherry_double_downup),
  ];
}

function buildReachmePatterns() {
  const all = enumerate((frame) => {
    if (frame[0][1] !== 'CHERRY') return null;
    if (frameColContains(frame, 1, 'CHERRY')) return null;
    if (frameColContains(frame, 2, 'CHERRY')) return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [] };
  });
  return deterministicSample(all, TARGET_COUNTS.reachme);
}

function buildChanceAPatterns() {
  const all = enumerate((frame) => {
    if (frame[0][1] !== 'WATERMELON') return null;
    if (frame[1][1] !== 'REPLAY') return null;
    if (frame[2][1] !== 'CHERRY') return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [] };
  });
  return deterministicSample(all, TARGET_COUNTS.chance_a);
}

function buildChanceBPatterns() {
  const all = enumerate((frame) => {
    if (frame[0][0] !== 'BIG7') return null;
    if (frame[1][1] !== 'BELL') return null;
    if (frame[2][2] !== 'BLUE7') return null;
    if (!noConflictAlignment(frame, ['BELL', 'WATERMELON', 'REPLAY'])) return null;
    return { winCells: [] };
  });
  return deterministicSample(all, TARGET_COUNTS.chance_b);
}

function buildNonePatterns() {
  const all = enumerate((frame) => {
    if (frameColContains(frame, 0, 'CHERRY')) return null;
    if (frameColContains(frame, 0, 'WATERMELON')) return null;
    for (const line of PAYLINES) {
      const [rL, rC, rR] = line.rows;
      if (frame[0][rL] === frame[1][rC] && frame[1][rC] === frame[2][rR]) return null;
    }
    return { winCells: [] };
  });
  return deterministicSample(all, TARGET_COUNTS.none);
}

/** @type {Record<string, StopPattern[]>} */
export const STOP_PATTERNS = {
  replay: buildReplayPatterns(),
  bell_diag: buildBellDiagPatterns(),
  watermelon_diag: buildWatermelonDiagPatterns(),
  watermelon_top: buildWatermelonTopPatterns(),
  cherry: buildCherryPatterns(),
  cherry_double: buildCherryDoublePatterns(),
  reachme: buildReachmePatterns(),
  chance_a: buildChanceAPatterns(),
  chance_b: buildChanceBPatterns(),
  none: buildNonePatterns(),
};

export function assertStopPatterns() {
  for (const [key, list] of Object.entries(STOP_PATTERNS)) {
    if (!list || list.length === 0) {
      throw new Error(`STOP_PATTERNS.${key} is empty — reels.js を変更したら制約を見直すこと`);
    }
  }
}

assertStopPatterns();
