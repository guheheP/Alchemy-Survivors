/**
 * DaggerStrategy — 乱舞斬り
 * 超高速で3方向に連続斬撃を放つ
 * 前方 + 左斜め + 右斜め のランダム3連撃
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { CollisionSystem } from '../CollisionSystem.js';

export class DaggerStrategy extends WeaponStrategy {
  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const baseAngle = this.player.facingAngle;
    const range = this.range;
    const dmg = this.damage;
    const slashArc = this.arc;

    // 3方向に斬撃: 正面、左30°、右30°
    const angles = [
      baseAngle,
      baseAngle - 0.5 + (Math.random() - 0.5) * 0.3,
      baseAngle + 0.5 + (Math.random() - 0.5) * 0.3,
    ];

    const hitEnemies = new Set();

    for (const slashAngle of angles) {
      for (const enemy of enemies) {
        if (!enemy.active || hitEnemies.has(enemy)) continue;
        if (CollisionSystem.pointInFan(enemy.x, enemy.y, px, py, slashAngle, slashArc, range)) {
          hitEnemies.add(enemy);
          if (enemy.takeDamage(dmg, this._lastCrit)) this._emitKill(enemy);
          else this._tryApplyStatus(enemy);
        }
      }
    }

    // 3連斬エフェクト（微妙にずらして表示）
    for (let i = 0; i < angles.length; i++) {
      this.effects.push({
        type: 'fan', x: px, y: py,
        angle: angles[i],
        range: range * (0.7 + Math.random() * 0.3),
        arc: slashArc * 0.6,
        timer: 0.06 + i * 0.03,
        maxTimer: 0.06 + i * 0.03,
        color: i === 0 ? '#faa' : i === 1 ? '#fca' : '#fda',
      });
    }
  }

}
