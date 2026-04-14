/**
 * VoxelRenderer — public/presets の voxel JSON をトップダウン 2D スプライトに変換
 *
 * 入力: { palette, parts: [{ voxels: [[x,y,z,colorIdx], ...], position, center }] }
 * 出力: OffscreenCanvas（キャッシュ可）
 *
 * 投影方式: 3/4 ビュー（トップダウン+軽いチルト）
 *  - スクリーン X = voxel.x
 *  - スクリーン Y = voxel.z - voxel.y * 0.7 （高さを奥行き方向に倒す）
 *  - 描画順は奥(z小)→手前(z大)、下(y小)→上(y大) で後ろから塗る
 */

/** カラーを darkness 量だけ暗くする（0=そのまま, 1=真っ黒） */
function shadeColor(hex, darkness) {
  if (!hex || hex[0] !== '#') return hex;
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const factor = 1 - darkness;
  const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
  const nb = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${nr},${ng},${nb})`;
}

/**
 * voxel JSON をオフスクリーンキャンバスにレンダリング
 * @param {object} preset - voxel JSON
 * @param {object} opts - { voxelSize, targetSize }
 * @returns {HTMLCanvasElement}
 */
export function renderVoxelPresetToCanvas(preset, opts = {}) {
  const voxelSize = opts.voxelSize || 3;
  const targetSize = opts.targetSize || 64;

  // 全 voxel の絶対座標を part.position 加算で計算し、バウンディングボックス算出
  const allVoxels = [];
  let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
  let maxY = 0;

  for (const part of preset.parts || []) {
    const [px, py, pz] = part.position || [0, 0, 0];
    for (const v of part.voxels || []) {
      const [vx, vy, vz, ci] = v;
      const ax = vx + px;
      const ay = vy + py;
      const az = vz + pz;
      const sx = ax;
      const sy = az - ay * 0.7;
      if (sx < minSX) minSX = sx;
      if (sx > maxSX) maxSX = sx;
      if (sy < minSY) minSY = sy;
      if (sy > maxSY) maxSY = sy;
      if (ay > maxY) maxY = ay;
      allVoxels.push({ ax, ay, az, sx, sy, ci });
    }
  }

  if (allVoxels.length === 0) {
    const empty = document.createElement('canvas');
    empty.width = targetSize; empty.height = targetSize;
    return empty;
  }

  // スケール計算（targetSize に収まるよう自動調整）
  const widthVoxels = maxSX - minSX + 1;
  const heightVoxels = maxSY - minSY + 1;
  const pad = 2;
  const canvasW = Math.ceil(widthVoxels * voxelSize + pad * 2);
  const canvasH = Math.ceil(heightVoxels * voxelSize + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 奥から手前、下から上の順でソート（z 昇順, y 昇順）
  allVoxels.sort((a, b) => {
    if (a.az !== b.az) return a.az - b.az;
    return a.ay - b.ay;
  });

  const palette = preset.palette || ['#888'];

  for (const v of allVoxels) {
    const baseColor = palette[v.ci] || '#888';
    // 高さ（y）が高いほど明るく、低いほど暗く
    const darkness = maxY > 0 ? Math.max(0, 0.25 - (v.ay / maxY) * 0.35) : 0;
    const color = darkness > 0 ? shadeColor(baseColor, darkness) : baseColor;

    const dx = Math.floor((v.sx - minSX) * voxelSize + pad);
    const dy = Math.floor((v.sy - minSY) * voxelSize + pad);

    ctx.fillStyle = color;
    ctx.fillRect(dx, dy, voxelSize, voxelSize);
  }

  return canvas;
}
