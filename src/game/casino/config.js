/**
 * casino/config.js — カジノ機能の可否フラグと基本設定
 *
 * - CASINO_ENABLED: 機能そのもののON/OFF。false なら init もセーブもしない
 * - CASINO_VISIBLE: UIへの露出。false なら拠点タブに表示されない
 *   開発者は localStorage 'casino_visible' = '1' or URLパラメータ ?casino=1 でも表示可能
 *
 * 将来機能ごと削除する場合、本ファイルを含む src/game/casino/ 配下を丸ごと削除すればよい。
 * 詳細は docs/casino/設計書.md §10 削除手順書を参照。
 */

export const CASINO_ENABLED = true;
export const CASINO_VISIBLE = false; // 調整中につき非表示（localStorage 'casino_visible'=1 または ?casino=1 で開発者用に表示可）
export const CASINO_VERSION = 1;

/** ゴールド↔メダル両替レート */
export const EXCHANGE_RATE = {
  goldToMedal: 1,   // 1G = 1メダル
  medalToGold: 1,   // 1メダル = 1G
  fee: 0,           // 両替手数料（%）
  minExchange: 10,  // 1回あたりの最小両替量
};

/** 1ゲームの掛け枚数（固定） */
export const BET_PER_GAME = 3;

/**
 * 実効可視性判定（開発者オーバーライド込み）
 * @returns {boolean}
 */
export function isCasinoVisible() {
  if (!CASINO_ENABLED) return false;
  if (CASINO_VISIBLE) return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('casino_visible') === '1') return true;
    if (typeof window !== 'undefined' && typeof URLSearchParams !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('casino') === '1') return true;
    }
  } catch (e) {
    // localStorage/URLSearchParams にアクセスできない環境では false
  }
  return false;
}
