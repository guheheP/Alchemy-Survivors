/**
 * BowStrategy — 最寄り敵にプロジェクタイル発射
 */

import { WeaponStrategy } from './WeaponStrategy.js';

export class BowStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this.projectiles = []; // active projectiles
    this.projectileSpeed = 400;
    this.maxProjectiles = 50;
  }

  update(dt, enemies) {
    // Update existing projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += Math.cos(p.angle) * this.projectileSpeed * dt;
      p.y += Math.sin(p.angle) * this.projectileSpeed * dt;
      p.life -= dt;

      // Check collision with enemies
      if (!p.hit) {
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          if (dx * dx + dy * dy < (4 + enemy.radius) * (4 + enemy.radius)) {
            if (enemy.takeDamage(this.damage)) this._emitKill(enemy);
            p.hit = true;
            break;
          }
        }
      }

      if (p.life <= 0 || p.hit) {
        this.projectiles.splice(i, 1);
      }
    }

    // Cooldown & fire
    // Use parent's effect timer for visual, but manage projectiles separately
    super.update(dt, enemies);
  }

  attack(enemies) {
    if (this.projectiles.length >= this.maxProjectiles) return;

    const px = this.player.x;
    const py = this.player.y;

    // Find nearest enemy
    let nearest = null;
    let nearestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist && dist < this.range * this.range * 4) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    const angle = nearest
      ? Math.atan2(nearest.y - py, nearest.x - px)
      : this.player.facingAngle;

    const count = 1 + this.player.passives.extraProjectile;
    const spreadAngle = count > 1 ? 0.15 : 0; // slight spread for multiple arrows

    for (let n = 0; n < count; n++) {
      if (this.projectiles.length >= this.maxProjectiles) break;
      const spread = count > 1 ? (n - (count - 1) / 2) * spreadAngle : 0;
      this.projectiles.push({
        x: px, y: py, angle: angle + spread, life: 2.0, hit: false,
      });
    }

    // Add to visual effects list for rendering
    this.effects.push({
      type: 'projectile', x: px, y: py, angle, range: 10,
      timer: 0.1, maxTimer: 0.1, color: '#ff8',
    });
  }

  render(ctx, camera, alpha) {
    // Render active projectiles
    for (const p of this.projectiles) {
      const sx = camera.worldToScreenX(p.x);
      const sy = camera.worldToScreenY(p.y);

      ctx.save();
      ctx.fillStyle = '#ff8';
      ctx.translate(sx, sy);
      ctx.rotate(p.angle);
      // Arrow shape
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-3, -3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Render flash effects
    super.render(ctx, camera, alpha);
  }
}
