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
  return computeNormalStopFrame(flags, phase, rng);
}

/**
 * 通常時の小役フラグ別停止形
 *
 * 仕様:
 *   - REPLAY   : 基本 中段揃い
 *   - BELL     : 上段 または 斜め揃い（中/下段無し）、左リールにCHERRY引き込み禁止
 *   - WATERMELON: 斜め または 上段揃い。bonusFlag/CZ/ZENCHO時は上段確率UP（示唆）
 *   - CHERRY   : 基本 左リール下段のみ。bonusFlag成立時は斜め(ダブル)チェリー（大チャンス示唆）
 *   - REACHME  : 左リール中段CHERRY（リーチ目、配当なし＝BONUS確定示唆）
 *   - CHANCE / NONE: 既存維持（左CHERRY除外、ガセ揃い回避）
 *
 * @param {import('./SlotEngine.js').DrawResult} flags
 * @param {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} phase
 * @param {import('../util/rng.js').Rng} rng
 */
function computeNormalStopFrame(flags, phase, rng) {
  const isBonusFlag = flags.bonusFlag && flags.bonusFlag !== 'none';
  const isChanceContext = phase === 'CZ' || phase === 'ZENCHO';

  // ペイラインの index 参照用
  const LINE_MID  = PAYLINES[0];
  const LINE_TOP  = PAYLINES[1];
  const LINE_DIAG_DOWN = PAYLINES[3];
  const LINE_DIAG_UP   = PAYLINES[4];
  const DIAG_LINES = [LINE_DIAG_DOWN, LINE_DIAG_UP];

  switch (flags.smallFlag) {
    case 'replay': {
      // 基本的に中段揃い
      const line = LINE_MID;
      const stopIndexes = alignOnPayline('REPLAY', 'REPLAY', 'REPLAY', line, rng);
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'bell': {
      // 上段 or 斜め揃い。左リールのフレームにCHERRYを見せない。
      const line = rng.pick([LINE_TOP, LINE_DIAG_DOWN, LINE_DIAG_UP]);
      const lIdx = pickStopIndexForRowExcluding(REEL_LEFT, 'BELL', line.rows[0], ['CHERRY'], rng);
      const cIdx = pickStopIndexForRow(REEL_CENTER, 'BELL', line.rows[1], rng);
      const rIdx = pickStopIndexForRow(REEL_RIGHT, 'BELL', line.rows[2], rng);
      const stopIndexes = [lIdx, cIdx, rIdx];
      return {
        frame: frameFromStopIndexes(stopIndexes),
        stopIndexes,
        winLine: line,
        winCells: winCellsForPayline(line),
        bonusSymbolsAligned: false,
        blue7Aligned: false,
      };
    }
    case 'watermelon': {
      // 斜め 又は 上段揃い。上段はボーナス/CZ示唆。
      const topBias = (isBonusFlag || isChanceContext) ? 0.6 : 0.2;
      const line = rng.next() < topBias ? LINE_TOP : rng.pick(DIAG_LINES);
      const stopIndexes = alignOnPayline('WATERMELON', 'WATERMELON', 'WATERMELON', line, rng);
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
      if (isBonusFlag) {
        // 斜めチェリー（ダブル）: 左上 + 右下 または 左下 + 右上。bonus大チャンス示唆。
        const upDown = rng.nextInt(2) === 0; // true: 左上-右下 / false: 左下-右上
        const leftRow  = upDown ? 0 : 2;
        const rightRow = upDown ? 2 : 0;
        const lIdx = pickStopIndexForRow(REEL_LEFT, 'CHERRY', leftRow, rng);
        const rIdx = pickStopIndexForRow(REEL_RIGHT, 'CHERRY', rightRow, rng);
        const cIdx = pickStopIndexExcludingFrame(REEL_CENTER, 'CHERRY', rng);
        const stopIndexes = [lIdx, cIdx, rIdx];
        return {
          frame: frameFromStopIndexes(stopIndexes),
          stopIndexes,
          winLine: null,
          // 左リールのチェリーのみが配当対象（右は演出用）
          winCells: [{ col: 0, row: leftRow }],
          bonusSymbolsAligned: false,
          blue7Aligned: false,
        };
      }
      // 基本: 左リール下段のみ。中/右リール窓にCHERRYを見せない。
      const lIdx = pickStopIndexForRow(REEL_LEFT, 'CHERRY', 2, rng);
      const [cIdx, rIdx] = pickStopIndexesExcludingFrame(
        [REEL_CENTER, REEL_RIGHT],
        'CHERRY',
        rng,
      );
      return {
        frame: frameFromStopIndexes([lIdx, cIdx, rIdx]),
        stopIndexes: [lIdx, cIdx, rIdx],
        winLine: null,
        winCells: [{ col: 0, row: 2 }],
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
      // リーチ目: 左リール中段CHERRY。中/右リールの窓にはCHERRYを出さない。
      // 配当は無いがBONUS確定告知としてプレイヤーには強いサイン。
      const lIdx = pickStopIndexForRow(REEL_LEFT, 'CHERRY', 1, rng);
      const cIdx = pickStopIndexExcludingFrame(REEL_CENTER, 'CHERRY', rng);
      const rIdx = pickStopIndexExcludingFrame(REEL_RIGHT, 'CHERRY', rng);
      const stopIndexes = [lIdx, cIdx, rIdx];
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
 * targetSymbol を指定行に置きつつ、3コマ表示窓から excludeSymbols を排除した
 * 停止位置を抽選する。候補が無ければ除外条件を外して再抽選。
 * @param {SymbolId[]} reel
 * @param {SymbolId} targetSymbol
 * @param {number} row - 0=上/1=中/2=下
 * @param {SymbolId[]} excludeSymbols
 * @param {import('../util/rng.js').Rng} rng
 * @returns {number} stopIndex
 */
function pickStopIndexForRowExcluding(reel, targetSymbol, row, excludeSymbols, rng) {
  const N = reel.length;
  const candidates = [];
  for (let i = 0; i < N; i++) {
    if (reel[i] !== targetSymbol) continue;
    const stopIdx = (i - row + 1 + N) % N;
    const top = reel[(stopIdx - 1 + N) % N];
    const mid = reel[stopIdx];
    const bot = reel[(stopIdx + 1) % N];
    let ok = true;
    for (const sym of excludeSymbols) {
      if (top === sym || mid === sym || bot === sym) { ok = false; break; }
    }
    if (ok) candidates.push(stopIdx);
  }
  if (candidates.length > 0) return candidates[rng.nextInt(candidates.length)];
  // フォールバック: 除外条件を満たせないときは target だけで抽選
  return pickStopIndexForRow(reel, targetSymbol, row, rng);
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
