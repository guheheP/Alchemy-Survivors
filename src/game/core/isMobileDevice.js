/**
 * モバイル端末検出 — プロジェクト共通判定
 *
 * 条件:
 *  1. タッチ入力が利用可能 ('ontouchstart' or maxTouchPoints > 0)
 *  2. かつ以下のいずれか:
 *     - (hover: none) and (pointer: coarse) に一致する（純粋な手持ちタッチ端末）
 *     - 画面幅が 900px 以下（中間デバイス救済）
 *
 * タッチスクリーン付きノートPCでダッシュボタンや仮想スティックが
 * 誤発火しないように、2 条件の AND をとる。
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const hasTouch = ('ontouchstart' in window)
    || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  if (!hasTouch) return false;

  const mql = window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse)') : null;
  if (mql && mql.matches) return true;

  return window.innerWidth <= 900;
}
