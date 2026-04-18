/**
 * payouts.js — 役と払い出し枚数
 */

/** 小役・ボーナスの払い出し定義（掛け枚数=3に対するトータル枚数） */
export const PAYOUTS = {
  BELL:       12,
  WATERMELON: 10,
  CHERRY:     2,
  REPLAY:     3,
  BIG:        0,
  REG:        0,
};

/** ART中の払い出し（一部上書き、ナビによる純増を表現） */
export const ART_PAYOUTS = {
  BELL:       14,   // ナビベル: 12→14
  WATERMELON: 12,
  CHERRY:     2,
  REPLAY:     7,    // ナビリプレイ: 3→7（純増+4）
};

/** BONUS消化中の1ゲームあたり強制払い出し */
export const BONUS_PAYOUT_PER_GAME = {
  BIG: 8,
  REG: 8,
};

/** BONUS継続ゲーム数 */
export const BONUS_GAME_COUNT = {
  BIG: 30,
  REG: 10,
};

/** ART関連の定数 */
export const ART_CONSTANTS = {
  INITIAL_GAMES: 40,        // ART突入時の初期ゲーム数
  ART_IN_BONUS_ADD: 60,     // ART中BONUS青7成功時の上乗せ（固定G）
  STOCK_BONUS_ADD: 20,      // ARTストック1個消化時のG数
};

/** ビタ押しチャレンジ（BIG中のみ） */
export const BITA_CONSTANTS = {
  /** BIG中の1ゲームあたりビタチャンス発動確率（0..1） */
  CHANCE_PROB: 0.18,
  /** チャンス発動時の成功確率（タイミング不問、内部抽選） */
  SUCCESS_PROB: 0.55,
  /** 成功時のコイン上乗せ */
  SUCCESS_BONUS: 20,
  /** 演出の表示時間(ms) — 成功/失敗表示までの尺 */
  SHOW_DURATION_MS: 900,
};
