/**
 * SpearStrategy — 長槍突進貫通 (オートエイム)
 * 最も近い敵に向かって突き出す直線攻撃、通過した全敵にダメージ
 * 貫通数無制限、射程が長い
 *
 * extraProjectile パッシブ対応: +1 ごとに同方向へ 0.08 秒間隔で連続突きを追加。
 * 2本目以降は update() のタイマーで遅延実行し、毎回最寄り敵を再計算して狙いを追従する。
 */

import { WeaponStrategy } from './WeaponStrategy.js';

const THRUST_INTERVAL = 0.08; // 連続突きの間隔(秒)

export class SpearStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this._pendingThrusts = []; // { timer: number }
  }

  attack(enemies) {
    const extra = this.player?.passives?.extraProjectile || 0;
    const total = 1 + extra;
    // 1本目は即時
    this._performThrust(enemies);
    // 2本目以降は遅延キューへ
    for (let i = 1; i < total; i++) {
      this._pendingThrusts.push({ timer: THRUST_INTERVAL * i });
    }
  }

  update(dt, enemies) {
    super.update(dt, enemies);
    if (this._pendingThrusts.length === 0) return;
    // 逆順で走査して splice を安全に
    for (let i = this._pendingThrusts.length - 1; i >= 0; i--) {
      const p = this._pendingThrusts[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        // 遅延実行時は最新の敵リストを使う (敵の死亡や新規湧きに追従)
        this._performThrust(this._enemies || enemies);
        this._pendingThrusts.splice(i, 1);
      }
    }
  }

  _performThrust(enemies) {
    if (!enemies) return;
    const px = this.player.x;
    const py = this.player.y;
    const range = this.range;
    const dmg = this.damage;
    const thrustWidth = 35; // 突きの幅（左右、以前の20から拡張）

    // 最も近い敵を選ぶ (range 圏内、なければ facingAngle)
    let nearest = null;
    let nearestDistSq = Infinity;
    const rangeSq = range * range;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq && distSq < rangeSq) {
        nearestDistSq = distSq;
        nearest = enemy;
      }
    }

    const angle = nearest
      ? Math.atan2(nearest.y - py, nearest.x - px)
      : this.player.facingAngle;

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
        if (enemy.takeDamage(dmg, this._lastCrit)) this._emitKill(enemy);
        else this._tryApplyStatus(enemy, dmg);
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
