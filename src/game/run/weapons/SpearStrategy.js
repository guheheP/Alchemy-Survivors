/**
 * SpearStrategy — 前方直線突き（貫通）
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { CollisionSystem } from '../CollisionSystem.js';

export class SpearStrategy extends WeaponStrategy {
  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.player.facingAngle;
    const range = this.range;
    const dmg = this.damage;

    // Narrow cone (PI/6) — pierces all enemies in the line
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (CollisionSystem.pointInFan(enemy.x, enemy.y, px, py, angle, this.arc, range)) {
        if (enemy.takeDamage(dmg)) this._emitKill(enemy);
      }
    }

    this.effects.push({
      type: 'line', x: px, y: py, angle, range,
      timer: 0.2, maxTimer: 0.2, color: '#cdf',
    });
  }
}
