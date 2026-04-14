/**
 * EntityRenderer — エンティティ描画の共通ヘルパー
 *
 * - 影（楕円の黒半透明）
 * - グロー（radialGradient）
 * - スプライト描画（被弾フラッシュ対応）
 * - フォールバック幾何描画（目付き円）
 */

export const EntityRenderer = {
  /** エンティティ足元に落ちる楕円影 */
  drawShadow(ctx, x, y, radius, alpha = 0.35) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.7, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** radialGradient による柔らかい発光 */
  drawGlow(ctx, x, y, radius, color = '#4af', alpha = 0.6) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.4, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /**
   * スプライト（オフスクリーン Canvas or Image）を中心に描画
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} sprite
   * @param {number} x - 中心X
   * @param {number} y - 中心Y
   * @param {object} opts - { scale, facing, flash, flipX }
   */
  drawSprite(ctx, sprite, x, y, opts = {}) {
    if (!sprite) return;
    const scale = opts.scale || 1;
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    const flash = opts.flash || 0;

    ctx.save();
    ctx.translate(x, y);
    if (opts.flipX) ctx.scale(-1, 1);
    if (opts.rotate) ctx.rotate(opts.rotate);

    // スプライト本体
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);

    // 被弾フラッシュ（白オーバーレイ）
    if (flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.min(1, flash);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  },

  /** スプライトがない場合の改良された幾何描画（目付きの柔らかい円） */
  drawEntityFallback(ctx, x, y, radius, color, flash = 0) {
    ctx.save();
    // 本体（円）
    if (flash > 0) {
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = color;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 暗色リング（縁取り）
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 目（2つの白点 + 黒瞳）
    if (flash <= 0) {
      const eyeY = y - radius * 0.2;
      const eyeX = radius * 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - eyeX, eyeY, radius * 0.18, 0, Math.PI * 2);
      ctx.arc(x + eyeX, eyeY, radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
      ctx.arc(x + eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /** HPバー描画（エンティティの頭上） */
  drawHpBar(ctx, x, y, radius, hp, maxHp) {
    if (hp >= maxHp) return;
    const barW = radius * 2;
    const barH = 3;
    const barY = y - radius - 8;
    ctx.fillStyle = '#300';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    ctx.fillStyle = '#f44';
    ctx.fillRect(x - barW / 2, barY, barW * (hp / maxHp), barH);
  },
};
