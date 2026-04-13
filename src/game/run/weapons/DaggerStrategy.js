/**
 * DaggerStrategy — 高速連続斬り（前方狭範囲）
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { CollisionSystem } from '../CollisionSystem.js';

export class DaggerStrategy extends WeaponStrategy {
  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.player.facingAngle;
    const range = this.range;
    const dmg = this.damage;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (CollisionSystem.pointInFan(enemy.x, enemy.y, px, py, angle, this.arc, range)) {
        if (enemy.takeDamage(dmg)) this._emitKill(enemy);
      }
    }

    // Rapid thin slash effect
    this.effects.push({
      type: 'fan', x: px, y: py, angle: angle + (Math.random() - 0.5) * 0.3,
      range: range * 0.8, arc: this.arc * 0.7,
      timer: 0.08, maxTimer: 0.08, color: '#faa',
    });
  }
}
