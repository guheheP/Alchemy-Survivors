/**
 * RunCanvas — Canvas 2D描画（ビューポートカリング付き）
 * Phase 2: マルチ武器エフェクト対応
 */

export class RunCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  render(alpha, camera, player, enemies, drops, weaponSystem) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#2a4a1a';
    ctx.fillRect(0, 0, w, h);

    this._drawGrid(ctx, camera);

    // ドロップ
    for (const drop of drops) {
      if (!drop.active) continue;
      const sx = camera.worldToScreenX(drop.lerpX(alpha));
      const sy = camera.worldToScreenY(drop.lerpY(alpha));
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
      ctx.fillStyle = drop.color;
      ctx.beginPath();
      ctx.arc(sx, sy, drop.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 敵
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const sx = camera.worldToScreenX(enemy.lerpX(alpha));
      const sy = camera.worldToScreenY(enemy.lerpY(alpha));
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;

      const r = enemy.radius;
      ctx.fillStyle = enemy.hitFlashTimer > 0 ? '#fff' : enemy.color;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);

      if (enemy.hp < enemy.maxHp) {
        const barW = r * 2;
        const barH = 3;
        const barY = sy - r - 6;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - barW / 2, barY, barW, barH);
        ctx.fillStyle = '#f44';
        ctx.fillRect(sx - barW / 2, barY, barW * (enemy.hp / enemy.maxHp), barH);
      }
    }

    // 武器エフェクト（各ストラテジーに描画を委譲）
    weaponSystem.render(ctx, camera, alpha);

    // プレイヤー
    const px = camera.worldToScreenX(player.lerpX(alpha));
    const py = camera.worldToScreenY(player.lerpY(alpha));
    const pr = player.radius;

    if (player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.3;
    }

    ctx.fillStyle = '#4af';
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.facingAngle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(pr + 4, 0);
    ctx.lineTo(pr - 2, -4);
    ctx.lineTo(pr - 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  _drawGrid(ctx, camera) {
    const gridSize = 100;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    for (let gx = startX; gx < camera.x + this.width + gridSize; gx += gridSize) {
      const sx = camera.worldToScreenX(gx);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.height);
      ctx.stroke();
    }
    for (let gy = startY; gy < camera.y + this.height + gridSize; gy += gridSize) {
      const sy = camera.worldToScreenY(gy);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.width, sy);
      ctx.stroke();
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
