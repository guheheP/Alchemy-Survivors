/**
 * ReelController.js — 5ライン対応のリール停止位置計算
 *
 * 各リールに stopIndex (0..20) を割り当てる。
 * 表示フレーム = [reel[(i-1)%21], reel[i], reel[(i+1)%21]]（上/中/下段）
 *
 * 当選時はランダムに1つのペイラインを選び、その上に揃うよう各リールの停止位置を決定する。
 */

import { REELS, REEL_LENGTH, REEL_LEFT, REEL_CENTER, REEL_RIGHT } from '../data/reels.js';

/** @typedef {import('../data/symbols.js').SymbolId} SymbolId */

/**
 * @typedef {Object} Payline
 * @property {number} id
 * @property {string} name
 * @property {number[]} rows - 各リールで絵柄が表示される行(0=上段/1=中段/2=下段)
 */

/** 5つのペイライン定義 */
export const PAYLINES = [
  { id: 1, name: 'mid',       rows: [1, 1, 1] },
  { id: 2, name: 'top',       rows: [0, 0, 0] },
  { id: 3, name: 'bottom',    rows: [2, 2, 2] },
  { id: 4, name: 'diag-down', rows: [0, 1, 2] },
  { id: 5, name: 'diag-up',   rows: [2, 1, 0] },
];

/**
 * 停止時の各リール絵柄（上/中/下段）
 * @typedef {{ left: SymbolId[], center: SymbolId[], right: SymbolId[] }} StopFrame
 */

/**
 * 停止情報
 * @typedef {Object} StopResult
 * @property {StopFrame} frame
 * @property {number[]} stopIndexes - 各リールの停止index（中段に来る絵柄の配列index）
 * @property {Payline|null} winLine - 当選したペイライン
 * @property {{col:number,row:number}[]} winCells - 当選したコマ座標（col=0..2, row=0..2）
 * @property {boolean} bonusSymbolsAligned - BONUS図柄が揃ったか
 * @property {boolean} blue7Aligned - 青7が揃ったか
 */

/**
 * 指定絵柄を指定行に表示できる stopIndex をランダムに1つ選ぶ
 * @param {SymbolId[]} reel
 * @param {SymbolId} targetSymbol
 * @param {number} row - 0=上段 / 1=中段 / 2=下段
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number} stopIndex (中段に来るコマの配列index)
 */
function pickStopIndexForRow(reel, targetSymbol, row, rng) {
  const positions = [];
  const N = reel.length;
  // reel[i] = targetSymbol のとき、reel[i] を行rowに置くためのstopIndex:
  //   表示: top=reel[stopIndex-1], mid=reel[stopIndex], bottom=reel[stopIndex+1]
  //   reel[i] が row に来るには stopIndex = (i - row + 1 + N) % N
  for (let i = 0; i < N; i++) {
    if (reel[i] === targetSymbol) {
      positions.push((i - row + 1 + N) % N);
    }
  }
  if (positions.length === 0) return rng.nextInt(N);
  return positions[rng.nextInt(positions.length)];
}

/**
 * 3リールで指定絵柄を特定ペイライン上に揃える
 * @param {SymbolId} leftSym
 * @param {SymbolId} centerSym
 * @param {SymbolId} rightSym
 * @param {Payline} line
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number[]} stopIndexes
 */
function alignOnPayline(leftSym, centerSym, rightSym, line, rng) {
  return [
    pickStopIndexForRow(REEL_LEFT,   leftSym,   line.rows[0], rng),
    pickStopIndexForRow(REEL_CENTER, centerSym, line.rows[1], rng),
    pickStopIndexForRow(REEL_RIGHT,  rightSym,  line.rows[2], rng),
  ];
}

/**
 * stopIndexes から 3リール × 3コマ の表示フレームを計算
 * @param {number[]} stopIndexes
 * @returns {StopFrame}
 */
function frameFromStopIndexes(stopIndexes) {
  return {
    left:   framePair(REEL_LEFT,   stopIndexes[0]),
    center: framePair(REEL_CENTER, stopIndexes[1]),
    right:  framePair(REEL_RIGHT,  stopIndexes[2]),
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

/**
 * ペイラインから当選コマ座標を返す
 * @param {Payline} line
 * @returns {{col:number,row:number}[]}
 */
function winCellsForPayline(line) {
  return line.rows.map((row, col) => ({ col, row }));
}

/**
 * フラグと状態からリール停止情報を生成
 * @param {import('./SlotEngine.js').DrawResult} flags
 * @param {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} phase
 * @param {'big'|'reg'|null} standbyKind
 * @param {import('../util/rng.js').Rng} rng
 * @returns {StopResult}
 */
export function computeStopFrame(flags, phase, standbyKind, rng) {
  // (A) BONUS_STANDBY: ランダムペイラインにBONUS図柄を揃える
  if (phase === 'BONUS_STANDBY') {
    if (standbyKind === 'big') {
      const line = rng.pick(PAYLINES);
      const stopIndexes = alignOnPayline('BIG7', 'BIG7', 'BIG7', line, rng);
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: true,
        blue7Aligned: false,
      };
    }
    if (standbyKind === 'reg') {
      const line = rng.pick(PAYLINES);
      // REG = 赤赤青
      const stopIndexes = alignOnPayline('BIG7', 'BIG7', 'BLUE7', line, rng);
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: true,
        blue7Aligned: false,
      };
    }
  }

  // (B) BONUS中: 青7フラグならBLUE7揃い、そうでなければBELL揃い
  if (phase === 'BONUS') {
    if (flags.blue7Flag === 'blue7') {
      const line = rng.pick(PAYLINES);
      const stopIndexes = alignOnPayline('BLUE7', 'BLUE7', 'BLUE7', line, rng);
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: false,
        blue7Aligned: true,
      };
    }
    const line = rng.pick(PAYLINES);
    const stopIndexes = alignOnPayline('BELL', 'BELL', 'BELL', line, rng);
    return {
      frame: frameFromStopIndexes(stopIndexes),
      stopIndexes,
      winLine: line,
      winCells: winCellsForPayline(line),
      bonusSymbolsAligned: false,
      blue7Aligned: false,
    };
  }

  // (C) NORMAL / ART / ZENCHO / CZ / TENJOU: 小役フラグに応じた停止形
  return computeNormalStopFrame(flags, rng);
}

/**
 * 通常時の小役フラグ別停止形
 */
function computeNormalStopFrame(flags, rng) {
  const alignSymbol = {
    bell: 'BELL',
    watermelon: 'WATERMELON',
    replay: 'REPLAY',
  };

  switch (flags.smallFlag) {
    case 'bell':
    case 'watermelon':
    case 'replay': {
      const sym = alignSymbol[flags.smallFlag];
      const line = rng.pick(PAYLINES);
      const stopIndexes = alignOnPayline(sym, sym, sym, line, rng);
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'cherry': {
      // シングルチェリー: 左リールの任意の段にチェリーを1個表示するだけで成立。
      // 中/右リールには3コマのどこにもCHERRYが見えないよう完全除外する
      // （ガセチェリー防止）。
      const row = rng.nextInt(3);
      const lIdx = pickStopIndexForRow(REEL_LEFT, 'CHERRY', row, rng);
      const [cIdx, rIdx] = pickStopIndexesExcludingFrame(
        [REEL_CENTER, REEL_RIGHT],
        'CHERRY',
        rng,
      );
      return {
        frame: frameFromStopIndexes([lIdx, cIdx, rIdx]),
        stopIndexes: [lIdx, cIdx, rIdx],
        winLine: null,
        winCells: [{ col: 0, row }],
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'chance': {
      // チャンス目: 異種三段 or 右下がりハズレ
      const pattern = rng.nextInt(2);
      let stopIndexes;
      if (pattern === 0) {
        // 中段: スイカ・リプレイ・チェリー
        stopIndexes = [
          pickStopIndexForRow(REEL_LEFT, 'WATERMELON', 1, rng),
          pickStopIndexForRow(REEL_CENTER, 'REPLAY', 1, rng),
          pickStopIndexForRow(REEL_RIGHT, 'CHERRY', 1, rng),
        ];
      } else {
        // 右下がり赤7テンパイハズレ
        stopIndexes = [
          pickStopIndexForRow(REEL_LEFT, 'BIG7', 0, rng),
          pickStopIndexForRow(REEL_CENTER, 'BELL', 1, rng),
          pickStopIndexForRow(REEL_RIGHT, 'BLUE7', 2, rng),
        ];
      }
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: null,
        winCells: [],
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'reachme': {
      // リーチ目（BONUS確定告知）: 中段7テンパイハズレ
      const pattern = rng.nextInt(2);
      let stopIndexes;
      if (pattern === 0) {
        // 赤7・赤7・赤7上段（中段テンパイして右上段にズレる）
        stopIndexes = [
          pickStopIndexForRow(REEL_LEFT, 'BIG7', 1, rng),
          pickStopIndexForRow(REEL_CENTER, 'BIG7', 1, rng),
          pickStopIndexForRow(REEL_RIGHT, 'BIG7', 0, rng),
        ];
      } else {
        // 青7・青7・青7上段
        stopIndexes = [
          pickStopIndexForRow(REEL_LEFT, 'BLUE7', 1, rng),
          pickStopIndexForRow(REEL_CENTER, 'BLUE7', 1, rng),
          pickStopIndexForRow(REEL_RIGHT, 'BLUE7', 0, rng),
        ];
      }
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: null,
        winCells: [],
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'none':
    default: {
      // ハズレ目: 揃わないランダム停止。
      // ガセチェリー防止: 左リールの3コマ（上/中/下）にCHERRYを見せない。
      const stopIndexes = [
        pickStopIndexExcludingFrame(REEL_LEFT, 'CHERRY', rng),
        rng.nextInt(REEL_LENGTH),
        rng.nextInt(REEL_LENGTH),
      ];
      // 偶然揃った場合はリトライ（最大5回）
      for (let attempt = 0; attempt < 5; attempt++) {
        const frame = frameFromStopIndexes(stopIndexes);
        if (!isAnyLineAligned(frame)) break;
        stopIndexes[2] = rng.nextInt(REEL_LENGTH);
      }
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: null,
        winCells: [],
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
  }
}

/**
 * 中リール/右リールのランダム停止位置（チェリーが誤って他列に揃わないよう避ける）
 * @deprecated pickStopIndexesExcludingFrame を使用
 */
function computeMissStopIndexes(excludeSymbol, rng) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = rng.nextInt(REEL_LENGTH);
    const r = rng.nextInt(REEL_LENGTH);
    if (REEL_CENTER[c] !== excludeSymbol && REEL_RIGHT[r] !== excludeSymbol) {
      return [c, r];
    }
  }
  return [0, 0];
}

/**
 * 指定リール群に対して、3コマ表示窓(上/中/下)のどこにも excludeSymbol が
 * 出現しない停止位置を抽選する。
 * @param {SymbolId[][]} reels
 * @param {SymbolId} excludeSymbol
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number[]}
 */
function pickStopIndexesExcludingFrame(reels, excludeSymbol, rng) {
  return reels.map(reel => pickStopIndexExcludingFrame(reel, excludeSymbol, rng));
}

/**
 * 単一リールで、3コマ表示窓(上/中/下)に excludeSymbol が含まれない
 * 停止位置を抽選する。候補が無ければランダム。
 * @param {SymbolId[]} reel
 * @param {SymbolId} excludeSymbol
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number}
 */
function pickStopIndexExcludingFrame(reel, excludeSymbol, rng) {
  const N = reel.length;
  const candidates = [];
  for (let i = 0; i < N; i++) {
    const top = reel[(i - 1 + N) % N];
    const mid = reel[i];
    const bot = reel[(i + 1) % N];
    if (top !== excludeSymbol && mid !== excludeSymbol && bot !== excludeSymbol) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return rng.nextInt(N);
  return candidates[rng.nextInt(candidates.length)];
}

/**
 * 5ラインのうち、いずれかで揃っているか判定（ハズレ目チェック用）
 * @param {StopFrame} frame
 */
function isAnyLineAligned(frame) {
  const grid = [frame.left, frame.center, frame.right]; // [col][row]
  for (const line of PAYLINES) {
    const [rL, rC, rR] = line.rows;
    const symL = grid[0][rL];
    const symC = grid[1][rC];
    const symR = grid[2][rR];
    if (symL === symC && symC === symR) return true;
  }
  return false;
}
