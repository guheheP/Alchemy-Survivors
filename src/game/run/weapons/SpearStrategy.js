/**
 * SpearStrategy — 長槍突進貫通
 * 前方に長い直線を描き、通過した全敵にダメージ
 * 貫通数無制限、射程が長い
 */

import { WeaponStrategy } from './WeaponStrategy.js';

export class SpearStrategy extends WeaponStrategy {
  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.player.facingAngle;
    const range = this.range;
    const dmg = this.damage;
    const thrustWidth = 20; // 突きの幅（左右）

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;

      // 前方ベクトルへの射影距離
      const forward = dx * cos + dy * sin;
      if (forward < 0 || forward > range) continue;

      // 横方向の距離
      const lateral = Math.abs(-dx * sin + dy * cos);
      if (lateral < thrustWidth + enemy.radius) {
        if (enemy.takeDamage(dmg)) this._emitKill(enemy);
      }
    }

    // 突進ライン + 先端の衝撃エフェクト
    this.effects.push({
      type: 'line', x: px, y: py, angle, range,
      timer: 0.2, maxTimer: 0.2, color: '#cdf',
    });
    // 先端の衝撃波
    this.effects.push({
      type: 'ring',
      x: px + cos * range * 0.9,
      y: py + sin * range * 0.9,
      range: 25,
      timer: 0.15, maxTimer: 0.15, color: '#8af',
    });
  }
}
