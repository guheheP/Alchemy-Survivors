/**
 * SwordStrategy — 前方扇型斬撃
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { CollisionSystem } from '../CollisionSystem.js';

export class SwordStrategy extends WeaponStrategy {
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

    this.effects.push({
      type: 'fan', x: px, y: py, angle, range, arc: this.arc,
      timer: 0.15, maxTimer: 0.15, color: '#fff',
    });
  }
}
