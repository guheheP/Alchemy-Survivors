/**
 * ReelController.js — 5ライン対応のリール停止位置計算
 *
 * 各リールに stopIndex (0..20) を割り当てる。
 * 表示フレーム = [reel[(i-1)%21], reel[i], reel[(i+1)%21]]（上/中/下段）
 *
 * 当選時はランダムに1つのペイラインを選び、その上に揃うよう各リールの停止位置を決定する。
 */

import { REEL_LEFT, REEL_CENTER, REEL_RIGHT } from '../data/reels.js';
import { STOP_PATTERNS, PAYLINES as STOP_PAYLINES } from '../data/stopPatterns.js';

/** @typedef {import('../data/symbols.js').SymbolId} SymbolId */

/**
 * @typedef {Object} Payline
 * @property {number} id
 * @property {string} name
 * @property {number[]} rows - 各リールで絵柄が表示される行(0=上段/1=中段/2=下段)
 */

/** 5つのペイライン定義 (stopPatterns.js と共有) */
export const PAYLINES = STOP_PAYLINES;

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
 * 通常時の小役フラグ別停止形 — 事前検証済みの固定パターン集合からランダムに1つ選ぶ
 *
 * 仕様 (詳細は data/stopPatterns.js):
 *   - REPLAY   : 中段揃い (左にCHERRY引き込みなし、BELL/WATERMELON他ライン揃いなし)
 *   - BELL     : 上段 or 斜め揃い (左にCHERRY引き込みなし、WATERMELON/REPLAY他ライン揃いなし)
 *   - WATERMELON: 斜め or 上段揃い。bonusFlag/CZ/ZENCHO時は上段確率UP (示唆)
 *   - CHERRY   : 左リール下段のみ。bonusFlag成立時は斜めダブルチェリー (大チャンス示唆)
 *   - REACHME  : 左リール中段CHERRY (BONUS確定示唆)
 *   - CHANCE   : 中段スイカ・リプレイ・チェリー / 右下がり赤7テンパイハズレ
 *   - NONE     : 全ラインで揃わない、左にCHERRY引き込みなし
 *
 * @param {import('./SlotEngine.js').DrawResult} flags
 * @param {'NORMAL'|'ZENCHO'|'CZ'|'BONUS_STANDBY'|'BONUS'|'ART'|'TENJOU'} phase
 * @param {import('../util/rng.js').Rng} rng
 */
function computeNormalStopFrame(flags, phase, rng) {
  const isStrong = flags.rareStrength === 'strong';

  switch (flags.smallFlag) {
    case 'replay':
      return patternToStopResult(rng.pick(STOP_PATTERNS.replay));
    case 'bell': {
      // 上段 vs 斜め: 半々
      const list = rng.next() < 0.5 ? STOP_PATTERNS.bell_top : STOP_PATTERNS.bell_diag;
      return patternToStopResult(rng.pick(list));
    }
    case 'watermelon': {
      // 強スイカ = 上段並行揃い、弱スイカ = 斜めスイカ揃い
      const list = isStrong ? STOP_PATTERNS.watermelon_top : STOP_PATTERNS.watermelon_diag;
      return patternToStopResult(rng.pick(list));
    }
    case 'cherry': {
      // 強チェリー = 斜めチェリー揃い (角チェリー)、弱チェリー = 左下チェリー
      const list = isStrong ? STOP_PATTERNS.cherry_double : STOP_PATTERNS.cherry;
      return patternToStopResult(rng.pick(list));
    }
    case 'chance': {
      // 強チャンス目 = 7-BELL-青7 (B型)、弱チャンス目 = スイカ-リプ-チェ (A型)
      const list = isStrong ? STOP_PATTERNS.chance_b : STOP_PATTERNS.chance_a;
      return patternToStopResult(rng.pick(list));
    }
    case 'reachme':
      return patternToStopResult(rng.pick(STOP_PATTERNS.reachme));
    case 'none':
    default:
      return patternToStopResult(rng.pick(STOP_PATTERNS.none));
  }
}

/**
 * stopPatterns.js の StopPattern を ReelController の StopResult 形式に変換
 * @param {{ stops:number[], frame:SymbolId[][], winLine:Payline|null, winCells:{col:number,row:number}[] }} pattern
 * @returns {StopResult}
 */
function patternToStopResult(pattern) {
  return {
    frame: {
      left:   pattern.frame[0].slice(),
      center: pattern.frame[1].slice(),
      right:  pattern.frame[2].slice(),
    },
    stopIndexes: pattern.stops.slice(),
    winLine: pattern.winLine,
    winCells: pattern.winCells.slice(),
    bonusSymbolsAligned: false,
    blue7Aligned: false,
  };
}
