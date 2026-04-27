/**
 * Histogram — Canvas ベースの簡易棒グラフ
 */

export function drawHistogram(canvas, bins, title = '') {
  if (!canvas || !bins || bins.length === 0) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, w, h);

  const padding = 24;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;
  const maxCount = Math.max(...bins.map(b => b.count)) || 1;
  const barW = chartW / bins.length;

  // Bars
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    const bh = (b.count / maxCount) * chartH;
    ctx.fillStyle = '#ffaa44';
    ctx.fillRect(padding + i * barW + 1, h - padding - bh, barW - 2, bh);
  }

  // Axes
  ctx.strokeStyle = '#5a4028';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  // Labels: min, max
  ctx.fillStyle = '#c4a880';
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(bins[0].start.toFixed(0), padding, h - padding + 4);
  const last = bins[bins.length - 1];
  ctx.textAlign = 'right';
  ctx.fillText(last.end.toFixed(0), w - padding, h - padding + 4);

  // Title
  if (title) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0e0c8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(title, padding, 6);
  }
  ctx.textAlign = 'left';
}
