/**
 * assetPath — publicディレクトリ内のアセットパスをViteのbase設定に基づいて解決する
 *
 * ローカル開発時: base='/' → '/art/items/wood.png'
 * GitHub Pages:   base='/Voxel-Tycoon01/' → '/Voxel-Tycoon01/art/items/wood.png'
 *
 * @param {string} path - '/' で始まるpublicアセットパス (例: '/art/items/wood.png')
 * @returns {string} 正しく解決されたパス
 */
export function assetPath(path) {
  const base = import.meta.env.BASE_URL; // Viteが自動で設定 (末尾に '/' 付き)
  // pathが '/' で始まっている場合、baseと結合時に二重スラッシュを防ぐ
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}
