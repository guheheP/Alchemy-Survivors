/**
 * dailySetting.js — 日付ベースの設定（1〜6）抽選
 *
 * 同じ日は同じ設定に収束させる（ゲーム内時刻ベース、セッション跨ぎ不変）。
 * ハッシュ関数で日付文字列から安定なインデックスを導出し、
 * 出現確率分布（やや甘め）にマップする。
 *
 * 分布: 設定1: 15% / 2: 18% / 3: 22% / 4: 22% / 5: 15% / 6: 8%
 * 日次分布での期待機械割を 100〜102% に収め、プレイヤーが長期的に
 * わずかにプラス期待で遊べる設計（娯楽要素としての味付け）。
 */

/** 設定1〜6の出現確率（小数、合計1.0） */
const SETTING_DISTRIBUTION = [
  { setting: 1, weight: 0.15 },
  { setting: 2, weight: 0.18 },
  { setting: 3, weight: 0.22 },
  { setting: 4, weight: 0.22 },
  { setting: 5, weight: 0.15 },
  { setting: 6, weight: 0.08 },
];

/**
 * 文字列 → 符号なし32bit整数の安定ハッシュ（FNV-1a）
 * @param {string} str
 * @returns {number}
 */
function fnv1a(str) {
  let hash = 0x811c9dc5; // FNV offset basis (32bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV prime
  }
  return hash >>> 0;
}

/**
 * 日付文字列 "YYYY-MM-DD" から設定1〜6を導出する
 * @param {string} dateString - 例: "2026-04-17"
 * @returns {1|2|3|4|5|6}
 */
export function pickDailySetting(dateString) {
  const hash = fnv1a(dateString);
  const r = (hash % 10000) / 10000; // 0.0 〜 1.0
  let cumulative = 0;
  for (const { setting, weight } of SETTING_DISTRIBUTION) {
    cumulative += weight;
    if (r < cumulative) return /** @type {1|2|3|4|5|6} */ (setting);
  }
  return 1; // フォールバック（到達しない想定）
}

/** 現在の日付（JST基準、"YYYY-MM-DD"形式） */
export function getTodayString() {
  const now = new Date();
  // JST (+09:00) で丸める
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffsetMs);
  return jst.toISOString().slice(0, 10);
}
