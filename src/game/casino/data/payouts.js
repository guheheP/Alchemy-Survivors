/**
 * payouts.js — 役と払い出し枚数
 */

/** 小役・ボーナスの払い出し定義（掛け枚数=3に対するトータル枚数） */
export const PAYOUTS = {
  BELL:       9,    // 共通ベル: 9枚 (通常時コイン持ち 50枚で約32G)
  WATERMELON: 10,
  CHERRY:     2,
  REPLAY:     3,
  BIG:        0,
  REG:        0,
};

/** ART中の払い出し（一部上書き、ナビによる純増を表現） */
export const ART_PAYOUTS = {
  BELL:       15,   // ナビベル: 12→15 (上限15、純増+12、ART純増の主因)
  WATERMELON: 12,
  CHERRY:     2,
  REPLAY:     3,    // 実機準拠: リプレイは BET相当を返すのみ (純増0)
};

/** BONUS消化中の1ゲームあたり強制払い出し */
export const BONUS_PAYOUT_PER_GAME = {
  BIG: 15,
  REG: 10,
};

/** BONUS継続ゲーム数 */
export const BONUS_GAME_COUNT = {
  BIG: 20,
  REG: 8,
};

/** ART関連の定数 */
export const ART_CONSTANTS = {
  INITIAL_GAMES: 40,        // ART突入時の初期ゲーム数
  ART_IN_BONUS_ADD: 60,     // ART中BONUS青7成功時の上乗せ（固定G）
  STOCK_BONUS_ADD: 20,      // ARTストック1個消化時のG数
};
