/**
 * rtmPayouts.js — Road to Millionaire の役と払い出し枚数
 *
 * AT機として出玉はAT中に集約する設計。通常時の吸込は -1.0枚/G 前後、
 * AT中は純増 +5.5枚/G 前後を目標。機械割は設定で 91-114% をカバー。
 */

/**
 * 通常時の払い出し定義（BET=3枚に対するトータル払い出し）
 * NONE / CHANCE は払い出し0。
 */
export const RTM_PAYOUTS = {
  BELL:       10,  // 通常ベル: 純増+7 (頻度1/8.7想定)
  WATERMELON: 10,  // スイカ: レア役（モード昇格ソース）
  CHERRY:      2,  // チェリー: レア役（モード昇格ソース）
  REPLAY:      3,  // リプレイ: BET相殺扱い
};

/**
 * AT中の払い出し定義（ナビ対象役は純増が大きい）
 * ナビを外した場合は RTM_PAYOUTS 側で払い戻しし、差分を没収する
 * （SlotMachine.finalizeNav と同じ扱い）。
 */
export const RTM_AT_PAYOUTS = {
  BELL:       17,  // ナビベル: 純増+14 (頻度 1/3 想定)
  WATERMELON: 10,  // スイカ: 通常と同じ
  CHERRY:      2,  // チェリー: 通常と同じ
  REPLAY:     12,  // ナビリプレイ: 純増+9 (頻度 1/3.6 想定)
};

/** AT関連の定数 */
export const RTM_AT_CONSTANTS = {
  /** 1セットの固定ゲーム数 */
  SET_GAMES: 50,
  /** 天井到達ゲーム数（NORMAL中のゲーム数） */
  TENJOU_GAMES: 1500,
  /** 天井到達時に確定する最低ストック数 */
  TENJOU_MIN_STOCKS: 1,
  /** 天井到達時に確定する最大ストック数 */
  TENJOU_MAX_STOCKS: 8,
  /**
   * AT_STANDBY の最大ゲーム数。この期間内にGODを任意の押し順で揃えるとAT開始。
   * 既存のBONUS_STANDBY同様、実装上は毎ゲーム引き込みで1G以内に揃う想定。
   */
  AT_STANDBY_MAX_GAMES: 3,
};
