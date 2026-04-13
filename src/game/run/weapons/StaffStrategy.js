/**
 * StaffStrategy — 周囲にオーブ発射（全方位）
 */

import { WeaponStrategy } from './WeaponStrategy.js';

export class StaffStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this.orbs = []; // active orbiting orbs
    this.orbCount = 3;
    this.orbDamageInterval = 0.5; // damage tick interval per orb
  }

  update(dt, enemies) {
    // Update orbs
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.life -= dt;
      orb.angle += orb.speed * dt;
      orb.damageTick -= dt;

      // Position orb around player
      orb.x = this.player.x + Math.cos(orb.angle) * orb.radius;
      orb.y = this.player.y + Math.sin(orb.angle) * orb.radius;

      // Damage enemies on tick
      if (orb.damageTick <= 0) {
        orb.damageTick = this.orbDamageInterval;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = orb.x - enemy.x;
          const dy = orb.y - enemy.y;
          if (dx * dx + dy * dy < (8 + enemy.radius) * (8 + enemy.radius)) {
            if (enemy.takeDamage(this.damage * 0.4)) this._emitKill(enemy);
          }
        }
      }

      if (orb.life <= 0) {
        this.orbs.splice(i, 1);
      }
    }

    // Cooldown & spawn new orbs
    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      this.cooldownTimer = this.cooldown;
      this._spawnOrbs();
    }

    // Update base effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) this.effects.splice(i, 1);
    }
  }

  _spawnOrbs() {
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < this.orbCount; i++) {
      this.orbs.push({
        x: this.player.x,
        y: this.player.y,
        angle: baseAngle + (Math.PI * 2 / this.orbCount) * i,
        radius: this.range,
        speed: 2.5, // radians/sec
        life: 3.0,
        damageTick: 0,
      });
    }
  }

  render(ctx, camera, alpha) {
    // Render orbs
    for (const orb of this.orbs) {
      const sx = camera.worldToScreenX(orb.x);
      const sy = camera.worldToScreenY(orb.y);
      const pulse = 1 + Math.sin(orb.life * 8) * 0.2;

      ctx.save();
      ctx.globalAlpha = Math.min(1, orb.life / 0.5);
      ctx.fillStyle = '#a6f';
      ctx.shadowColor = '#a6f';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, 6 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    super.render(ctx, camera, alpha);
  }
}
