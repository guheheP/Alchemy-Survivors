/**
 * ShieldStrategy — 守護の波動
 * 広範囲の衝撃波 + 強ノックバック
 * ダメージは低いが防御的（敵を大きく弾く）
 */

import { WeaponStrategy } from './WeaponStrategy.js';
import { eventBus } from '../../core/EventBus.js';

export class ShieldStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this._retaliateReady = true;

    // 被ダメ時に自動反撃波（小規模）
    this._unsubDamaged = eventBus.on('player:damaged', () => {
      if (this._retaliateReady) {
        this._retaliateReady = false;
        this._retaliateWave();
        setTimeout(() => { this._retaliateReady = true; }, 2000);
      }
    });
  }

  attack(enemies) {
    const px = this.player.x;
    const py = this.player.y;
    const range = this.range;
    const dmg = this.damage;
    const knockbackDist = 70;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < range + enemy.radius) {
        if (enemy.takeDamage(dmg)) {
          this._emitKill(enemy);
        } else if (dist > 0.1) {
          enemy.tryKnockback?.(dx, dy, dist, knockbackDist);
        }
      }
    }

    // 二重リングエフェクト
    this.effects.push({
      type: 'ring', x: px, y: py, range,
      timer: 0.3, maxTimer: 0.3, color: '#8cf',
    });
    this.effects.push({
      type: 'ring', x: px, y: py, range: range * 0.6,
      timer: 0.2, maxTimer: 0.2, color: '#acf',
    });
  }

  /** 被ダメ時の反撃波（小規模、自動発動） */
  _retaliateWave() {
    const px = this.player.x;
    const py = this.player.y;
    const range = this.range * 0.5;
    const knockback = 40;

    // RunManagerのallEnemiesにはアクセスできないので、EventBus経由
    eventBus.emit('shield:retaliate', { x: px, y: py, range, knockback, damage: this.damage * 0.3 });

    this.effects.push({
      type: 'ring', x: px, y: py, range,
      timer: 0.15, maxTimer: 0.15, color: '#ffa',
    });
  }

  destroy() {
    if (this._unsubDamaged) this._unsubDamaged();
  }
}
