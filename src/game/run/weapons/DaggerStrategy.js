/**
 * DaggerStrategy — プレイヤー周囲を旋回する刃 (3本)
 *
 * 周回半径は baseRange 固定 (range-up の影響を受けない)。
 * 攻撃範囲アップ (rangeMultiplier) は刃の当たり判定半径に反映。
 * attackSpeed (品質由来) は回転速度に反映。
 * 刃は永続 (spawn 1回) で、接触した敵にダメージティックで連続ダメージを与える。
 */

import { WeaponStrategy } from './WeaponStrategy.js';

// 刃の当たり判定半径 (敵半径に加算) とビジュアルサイズの基準
const BLADE_HIT_RADIUS = 10;
const BLADE_LENGTH = 14;
const BLADE_WIDTH = 3;
const BASE_ROTATION_RATE = 3.5; // radians/sec (attackSpeed 乗算前)

export class DaggerStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this.blades = [];
    this.bladeCount = 3;
    this.damageInterval = 0.15;
    this._spawned = false;
  }

  update(dt, enemies, collisionSystem) {
    if (!this._spawned) this._spawnBlades();

    const rotateRate = BASE_ROTATION_RATE * (this.attackSpeed || 1);
    const hitRadius = BLADE_HIT_RADIUS * (1 + (this.player.passives.rangeMultiplier || 0));

    for (const blade of this.blades) {
      blade.angle += rotateRate * dt;
      blade.damageTick -= dt;
      blade.x = this.player.x + Math.cos(blade.angle) * blade.radius;
      blade.y = this.player.y + Math.sin(blade.angle) * blade.radius;

      if (blade.damageTick <= 0) {
        blade.damageTick = this.damageInterval;
        const candidates = collisionSystem
          ? collisionSystem.query(blade.x, blade.y, hitRadius + 24)
          : enemies;
        for (const enemy of candidates) {
          if (!enemy.active) continue;
          const dx = blade.x - enemy.x;
          const dy = blade.y - enemy.y;
          const hitR = hitRadius + enemy.radius;
          if (dx * dx + dy * dy < hitR * hitR) {
            const hit = this.damage * 0.22;
            if (enemy.takeDamage(hit, this._lastCrit)) this._emitKill(enemy);
            else this._tryApplyStatus(enemy, hit);
            if (this.effects.length < 64) {
              this.effects.push({
                type: 'dagger_hit', x: enemy.x, y: enemy.y, angle: 0, range: 4,
                timer: 0.1, maxTimer: 0.1, color: '#fea',
              });
            }
          }
        }
      }
    }

    // スキル (親クラスのスキルシステムはそのまま利用)
    this.skillCooldown -= dt;
    if (this.skillCooldown <= 0) {
      this.skillCooldown = this.skillCooldownMax;
      this.executeSkill(enemies);
    }

    // 親のエフェクト timer 更新
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) this.effects.splice(i, 1);
    }
  }

  /** 通常攻撃(cooldown駆動)は使わない。update内で直接ダメージ処理。 */
  attack(_enemies) {}

  _spawnBlades() {
    this._spawned = true;
    const count = this.bladeCount + (this.player.passives.extraProjectile || 0);
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.blades.push({
        x: this.player.x,
        y: this.player.y,
        angle: baseAngle + (Math.PI * 2 / count) * i,
        radius: this.baseRange,
        damageTick: 0,
      });
    }
  }

  render(ctx, camera, alpha) {
    const hitScale = 1 + (this.player.passives.rangeMultiplier || 0);
    for (const blade of this.blades) {
      const sx = camera.worldToScreenX(blade.x);
      const sy = camera.worldToScreenY(blade.y);

      ctx.save();
      ctx.translate(sx, sy);
      // 刃は進行方向(接線方向)に向ける
      ctx.rotate(blade.angle + Math.PI / 2);
      const len = BLADE_LENGTH * hitScale;
      const w = BLADE_WIDTH * hitScale;
      // グロー
      ctx.shadowColor = '#fc6';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#e8e8f0';
      // 短剣の形状 (先端尖った細身のひし形)
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, len * 0.35);
      ctx.lineTo(-w, 0);
      ctx.closePath();
      ctx.fill();
      // 柄
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#664';
      ctx.fillRect(-w * 0.6, len * 0.35, w * 1.2, len * 0.25);
      ctx.restore();
    }

    // ヒット位置のスパーク
    for (const fx of this.effects) {
      if (fx.type !== 'dagger_hit') continue;
      const sx = camera.worldToScreenX(fx.x);
      const sy = camera.worldToScreenY(fx.y);
      const t = 1 - (fx.timer / fx.maxTimer);
      const r = 3 + t * 8;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    super.render(ctx, camera, alpha);
  }
}
