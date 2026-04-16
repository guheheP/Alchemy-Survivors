/**
 * SwordStrategy — 大剣回転斬り
 * 通常攻撃: 前方広範囲の弧斬り
 * 2回目: 360°回転斬り（交互）
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { CollisionSystem } from '../CollisionSystem.js';

export class SwordStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this._swingCount = 0;
  }

  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.player.facingAngle;
    const range = this.range;
    const dmg = this.damage;
    this._swingCount++;

    // 奇数回: 前方弧斬り / 偶数回: 360°回転斬り
    const isFullSpin = this._swingCount % 2 === 0;
    const attackArc = isFullSpin ? Math.PI * 2 : this.arc;
    const effectColor = isFullSpin ? '#ff8' : '#fff';

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (isFullSpin) {
        // 360° — 距離チェックのみ
        const dx = enemy.x - px;
        const dy = enemy.y - py;
        if (dx * dx + dy * dy < range * range) {
          if (enemy.takeDamage(dmg * 0.8, this._lastCrit)) this._emitKill(enemy);
          else this._tryApplyStatus(enemy);
        }
      } else {
        if (CollisionSystem.pointInFan(enemy.x, enemy.y, px, py, angle, attackArc, range)) {
          if (enemy.takeDamage(dmg, this._lastCrit)) this._emitKill(enemy);
          else this._tryApplyStatus(enemy);
        }
      }
    }

    if (isFullSpin) {
      this.effects.push({
        type: 'ring', x: px, y: py, range,
        timer: 0.2, maxTimer: 0.2, color: effectColor,
      });
    } else {
      this.effects.push({
        type: 'fan', x: px, y: py, angle, range, arc: attackArc,
        timer: 0.18, maxTimer: 0.18, color: effectColor,
      });
    }
  }

}
