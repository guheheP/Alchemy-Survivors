/**
 * ShieldStrategy — 周囲バリア波動（全方位+ノックバック）
 */

import { WeaponStrategy } from './WeaponStrategy.js';

export class ShieldStrategy extends WeaponStrategy {
  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const range = this.range;
    const dmg = this.damage;
    const knockbackDist = 40;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < range + enemy.radius) {
        if (enemy.takeDamage(dmg)) {
          this._emitKill(enemy);
        } else if (dist > 0.1) {
          // Knockback
          enemy.x += (dx / dist) * knockbackDist;
          enemy.y += (dy / dist) * knockbackDist;
        }
      }
    }

    // Expanding ring effect
    this.effects.push({
      type: 'ring', x: px, y: py, range,
      timer: 0.3, maxTimer: 0.3, color: '#8cf',
    });
  }
}
