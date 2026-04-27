/**
 * BowStrategy — 最寄り敵にプロジェクタイル発射
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { ItemBlueprints } from '../../data/items.js';

export class BowStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this.projectiles = []; // active projectiles
    this.projectileSpeed = 400;
    this.maxProjectiles = 50;
    // BP の multiShot プロパティで弓ごとの基礎連射数を決定 (1〜4)
    const bp = ItemBlueprints[weaponItem.blueprintId];
    this.bpMultiShot = Math.max(1, bp?.multiShot || 1);
  }

  update(dt, enemies, collisionSystem) {
    // Update existing projectiles (swap-pop で splice 回避)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += Math.cos(p.angle) * this.projectileSpeed * dt;
      p.y += Math.sin(p.angle) * this.projectileSpeed * dt;
      p.life -= dt;

      // Check collision with enemies — 空間ハッシュがあれば近傍だけに限定
      if (!p.hit) {
        const candidates = collisionSystem
          ? collisionSystem.query(p.x, p.y, 24)
          : enemies;
        for (const enemy of candidates) {
          if (!enemy.active) continue;
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          const hitR = 4 + enemy.radius;
          if (dx * dx + dy * dy < hitR * hitR) {
            const hit = this.damage;
            if (enemy.takeDamage(hit, this._lastCrit)) this._emitKill(enemy);
            else this._tryApplyStatus(enemy, hit);
            p.hit = true;
            break;
          }
        }
      }

      if (p.life <= 0 || p.hit) {
        const last = this.projectiles.length - 1;
        if (i !== last) this.projectiles[i] = this.projectiles[last];
        this.projectiles.pop();
      }
    }

    // Cooldown & fire — visual effect は親クラスに委譲
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
      if (dist < nearestDist && dist < this.range * this.range * 2.25) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    const angle = nearest
      ? Math.atan2(nearest.y - py, nearest.x - px)
      : this.player.facingAngle;

    // 連射数 = BP固有 multiShot + extraProjectile パッシブ
    const count = this.bpMultiShot + this.player.passives.extraProjectile;
    const spreadAngle = count > 1 ? 0.15 : 0; // slight spread for multiple arrows

    for (let n = 0; n < count; n++) {
      if (this.projectiles.length >= this.maxProjectiles) break;
      const spread = count > 1 ? (n - (count - 1) / 2) * spreadAngle : 0;
      this.projectiles.push({
        x: px, y: py, angle: angle + spread, life: 1.3, hit: false,
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
