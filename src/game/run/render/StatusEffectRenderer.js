/**
 * StatusEffectRenderer — 敵/ボスにかかっている状態異常の描画
 *
 * 描画要素:
 *   1. 全身を包むエフェクト (drawAura): 炎/毒/氷/感電/脆弱 — 状態ごとに派手さを変える
 *   2. HPバー上のアイコン列 (drawIcons): 発動中の状態異常を小アイコンで一覧表示
 *      (短時間の shock や視覚薄めの vulnerable もここで確実に認識できる)
 *
 * 呼び出し側は RunCanvas。責務分離のため EntityRenderer とは別モジュールにしている。
 */

const ICON_SIZE = 10;
const ICON_GAP = 2;

/** 状態異常アイコン定義 — HPバー上に並べる小アイコン */
const STATUS_ICONS = [
  { key: 'burn',       timer: '_burnTimer',       color: '#f62', label: '🔥' },
  { key: 'poison',     timer: '_poisonTimer',     color: '#6a4', label: '☣' },
  { key: 'freeze',     timer: '_freezeTimer',     color: '#8cf', label: '❄' },
  { key: 'shock',      timer: '_shockTimer',      color: '#ff4', label: '⚡' },
  { key: 'vulnerable', timer: '_vulnerableTimer', color: '#acf', label: '💧' },
];

export const StatusEffectRenderer = {
  /**
   * 敵/ボスに乗る全身状態異常オーラを描画する。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} sx - 画面座標X
   * @param {number} sy - 画面座標Y
   * @param {object} entity - _burnTimer 等を持つエンティティ
   * @param {number} radius - 敵半径
   * @param {number} elapsed - ラン経過秒 (アニメーション用)
   */
  drawAura(ctx, sx, sy, entity, radius, elapsed) {
    if (entity._burnTimer > 0)       this._drawBurn(ctx, sx, sy, radius, elapsed);
    if (entity._poisonTimer > 0)     this._drawPoison(ctx, sx, sy, radius, elapsed);
    if (entity._freezeTimer > 0)     this._drawFreeze(ctx, sx, sy, radius, elapsed);
    if (entity._shockTimer > 0)      this._drawShock(ctx, sx, sy, radius, elapsed);
    if (entity._vulnerableTimer > 0) this._drawVulnerable(ctx, sx, sy, radius, elapsed);
  },

  /**
   * HPバーの直上に状態異常アイコン列を描画する。
   * duration の短い状態異常 (shock=0.4s) や視覚控えめの vulnerable も
   * 必ず判別できるようにするための「確実な表示面」。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} sx
   * @param {number} sy
   * @param {object} entity
   * @param {number} radius
   */
  drawIcons(ctx, sx, sy, entity, radius) {
    // 発動中の状態異常を収集
    const active = [];
    for (const spec of STATUS_ICONS) {
      if ((entity[spec.timer] || 0) > 0) active.push(spec);
    }
    if (active.length === 0) return;

    // HPバーは entity 上端から -8px の位置に barH=3px で描かれる。
    // アイコン列はさらにその上 (HPバーと 2px 空ける) に並べる。
    const totalW = active.length * ICON_SIZE + (active.length - 1) * ICON_GAP;
    const baseX = sx - totalW / 2;
    const baseY = sy - radius - 8 - 3 - 2 - ICON_SIZE;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${ICON_SIZE - 1}px system-ui, "Segoe UI Emoji", sans-serif`;
    for (let i = 0; i < active.length; i++) {
      const spec = active[i];
      const x = baseX + i * (ICON_SIZE + ICON_GAP) + ICON_SIZE / 2;
      const y = baseY + ICON_SIZE / 2;
      // 背景タブ (属性色で視認性を稼ぐ)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - ICON_SIZE / 2 + 0.5, y - ICON_SIZE / 2 + 0.5, ICON_SIZE - 1, ICON_SIZE - 1);
      // ラベル (絵文字)
      ctx.fillStyle = '#fff';
      ctx.fillText(spec.label, x, y + 0.5);
    }
    ctx.restore();
  },

  // --- 個別エフェクト ----------------------------------------------------

  _drawBurn(ctx, sx, sy, radius, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.4, sx, sy, radius * 1.8);
    grad.addColorStop(0, 'rgba(255,160,60,0.55)');
    grad.addColorStop(0.5, 'rgba(255,90,20,0.35)');
    grad.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const phase = t * 4 + i * 1.8;
      const ox = Math.sin(phase) * radius * 0.5;
      const flicker = 0.7 + Math.sin(t * 12 + i) * 0.3;
      const flameH = radius * (0.8 + flicker * 0.6);
      const flameW = radius * 0.35;
      const baseY = sy - radius * 0.3;
      const tipY = baseY - flameH;
      const cx = sx + ox;
      ctx.fillStyle = `rgba(255,120,30,${0.45 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(cx - flameW * 0.5, baseY);
      ctx.quadraticCurveTo(cx - flameW, baseY - flameH * 0.5, cx, tipY);
      ctx.quadraticCurveTo(cx + flameW, baseY - flameH * 0.5, cx + flameW * 0.5, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,230,120,${0.55 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(cx - flameW * 0.25, baseY);
      ctx.quadraticCurveTo(cx - flameW * 0.5, baseY - flameH * 0.4, cx, tipY + flameH * 0.15);
      ctx.quadraticCurveTo(cx + flameW * 0.5, baseY - flameH * 0.4, cx + flameW * 0.25, baseY);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 2; i++) {
      const phase = (t * 2 + i * 0.7) % 1;
      const a = (i * 3.14 + t * 0.5) % (Math.PI * 2);
      const dist = radius * 0.6;
      const fpx = sx + Math.cos(a) * dist;
      const fpy = sy - radius * 0.2 - phase * radius * 1.5;
      ctx.fillStyle = `rgba(255,200,80,${(1 - phase) * 0.9})`;
      ctx.beginPath();
      ctx.arc(fpx, fpy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  _drawPoison(ctx, sx, sy, radius, t) {
    ctx.save();
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.3, sx, sy, radius * 1.6);
    grad.addColorStop(0, 'rgba(120,220,80,0.35)');
    grad.addColorStop(0.6, 'rgba(70,170,50,0.22)');
    grad.addColorStop(1, 'rgba(40,100,30,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const phase = (t * 1.2 + i * 0.33) % 1;
      const ox = Math.sin(t * 2 + i * 1.7) * radius * 0.5;
      const by = sy + radius * 0.4 - phase * radius * 1.8;
      const bx = sx + ox;
      const br = 2.5 + Math.sin(phase * Math.PI) * 2.5;
      const alpha = Math.sin(phase * Math.PI) * 0.85;
      ctx.fillStyle = `rgba(100,220,80,${alpha})`;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(200,255,160,${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    const ringPulse = 0.5 + Math.sin(t * 5) * 0.25;
    ctx.globalAlpha = ringPulse;
    ctx.strokeStyle = '#5c2';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath();
    ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },

  _drawFreeze(ctx, sx, sy, radius, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.3, sx, sy, radius * 1.6);
    grad.addColorStop(0, 'rgba(180,240,255,0.5)');
    grad.addColorStop(0.6, 'rgba(100,200,255,0.3)');
    grad.addColorStop(1, 'rgba(60,120,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();
    const rot = t * 0.6;
    ctx.strokeStyle = 'rgba(200,240,255,0.95)';
    ctx.fillStyle = 'rgba(140,220,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const a = rot + Math.PI * i;
      const cx = sx + Math.cos(a) * radius * 1.1;
      const cy = sy + Math.sin(a) * radius * 1.1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a * 2);
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ka = (Math.PI / 3) * k;
        ctx.moveTo(-Math.cos(ka) * 5, -Math.sin(ka) * 5);
        ctx.lineTo(Math.cos(ka) * 5, Math.sin(ka) * 5);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(3, 0);
      ctx.lineTo(0, 3);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(180,240,255,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const a = Math.PI * 0.4 + i * 0.5;
      const x1 = sx + Math.cos(a) * radius * 0.7;
      const y1 = sy + Math.sin(a) * radius * 0.7;
      const x2 = sx + Math.cos(a) * (radius + 5);
      const y2 = sy + Math.sin(a) * (radius + 5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  },

  _drawShock(ctx, sx, sy, radius, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(t * 40) * 0.4;
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.2, sx, sy, radius * 1.7);
    grad.addColorStop(0, `rgba(255,255,200,${0.6 * pulse})`);
    grad.addColorStop(0.5, `rgba(255,230,80,${0.35 * pulse})`);
    grad.addColorStop(1, 'rgba(200,180,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffaa';
    ctx.lineWidth = 3;
    for (let b = 0; b < 2; b++) {
      const startA = (t * 8 + b * Math.PI) % (Math.PI * 2);
      const endA = startA + Math.PI + (Math.random() - 0.5) * 0.8;
      const startR = radius * 0.4;
      const endR = radius * 1.4;
      const x1 = sx + Math.cos(startA) * startR;
      const y1 = sy + Math.sin(startA) * startR;
      const x2 = sx + Math.cos(endA) * endR;
      const y2 = sy + Math.sin(endA) * endR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      for (let s = 1; s < 5; s++) {
        const sp = s / 5;
        const jx = x1 + (x2 - x1) * sp + (Math.random() - 0.5) * 10;
        const jy = y1 + (y2 - y1) * sp + (Math.random() - 0.5) * 10;
        ctx.lineTo(jx, jy);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffcc';
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.6 + Math.random() * 0.8);
      const px = sx + Math.cos(a) * r;
      const py = sy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /**
   * 脆弱 (水属性): 控えめな青白い亀裂風リング + パルス
   * 炎/毒/氷/感電に比べて「被ダメ増加」という内部効果なので派手すぎないよう抑える。
   */
  _drawVulnerable(ctx, sx, sy, radius, t) {
    ctx.save();
    // 薄い青白オーラ (非加算)
    const pulse = 0.35 + Math.sin(t * 3) * 0.15;
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.9, sx, sy, radius * 1.4);
    grad.addColorStop(0, `rgba(160,200,255,0)`);
    grad.addColorStop(0.6, `rgba(180,220,255,${0.18 * pulse})`);
    grad.addColorStop(1, `rgba(220,240,255,${0.28 * pulse})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 亀裂風の細かいダッシュリング (低密度)
    ctx.strokeStyle = `rgba(200,230,255,${0.55 * pulse + 0.25})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.lineDashOffset = t * 8;
    ctx.beginPath();
    ctx.arc(sx, sy, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 時折ちらつく小さな輝点 (2個、位相差)
    for (let i = 0; i < 2; i++) {
      const phase = (t * 1.5 + i * 0.5) % 1;
      const alpha = Math.sin(phase * Math.PI) * 0.7;
      if (alpha <= 0) continue;
      const a = (t * 0.6 + i * Math.PI) % (Math.PI * 2);
      const dx = sx + Math.cos(a) * radius * 0.9;
      const dy = sy + Math.sin(a) * radius * 0.9;
      ctx.fillStyle = `rgba(230,245,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(dx, dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};
