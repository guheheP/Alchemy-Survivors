/**
 * NumberFormat — ゲーム内数値表示の共通フォーマッタ
 *
 * 全UIの小数表示は最大1桁で統一する。浮動小数演算の誤差
 * (例: 0.1 * 100 = 1.59999999 のようなノイズ) を UI 側で吸収するため、
 * `Math.round(n * 10) / 10` で丸めてから文字列化する。
 */

/**
 * 数値を最大1桁の小数で表示する。
 * 整数のときは小数点を付けない（`15` → `"15"`、`15.1` → `"15.1"`）。
 * null/undefined/NaN は `"0"` にフォールバック。
 */
export function fmt1(n) {
  if (n == null || Number.isNaN(n)) return '0';
  const rounded = Math.round(n * 10) / 10;
  // 整数ならそのまま、小数なら最大1桁の文字列
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * 0-1 の比率を百分率に変換し、最大1桁で表示する。
 * 例: `0.01599999` → `"1.6"`、`0.15` → `"15"`。
 * 記号は含めないので、呼び出し側で `+${fmtPct1(v)}%` のように組み立てる。
 */
export function fmtPct1(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return '0';
  return fmt1(ratio * 100);
}

/**
 * 整数に丸めて表示する（四捨五入）。
 */
export function fmtInt(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return String(Math.round(n));
}
