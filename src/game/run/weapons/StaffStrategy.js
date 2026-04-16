/**
 * StaffStrategy — 周囲にオーブ発射（全方位）
 *
 * 周回半径は baseRange 固定（range-up の影響を受けない）。
 * 攻撃範囲アップ (rangeMultiplier) はオーブ生成時に hitScale として
 * スナップショットされ、衝突判定半径と描画半径を同倍率で拡大する。
 */

import { WeaponStrategy } from './WeaponStrategy.js';

// オーブの当たり判定半径 (敵半径に加算) とビジュアル外周半径を同期させる
const ORB_HIT_RADIUS = 14;
const ORB_CORE_RADIUS = 6;

export class StaffStrategy extends WeaponStrategy {
  constructor(player, weaponItem) {
    super(player, weaponItem);
    this.orbs = []; // active orbiting orbs
    this.orbCount = 3;
    this.orbDamageInterval = 0.25; // damage tick interval per orb
  }

  update(dt, enemies, collisionSystem) {
    // Update orbs
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.life -= dt;
      orb.angle += orb.speed * dt;
      orb.damageTick -= dt;

      // Position orb around player
      orb.x = this.player.x + Math.cos(orb.angle) * orb.radius;
      orb.y = this.player.y + Math.sin(orb.angle) * orb.radius;

      // Damage enemies on tick — 空間ハッシュで近傍のみ走査
      // ビジュアルの外周(ORB_HIT_RADIUS * orb.hitScale)に重なった敵を対象にするので見た目と一致する
      if (orb.damageTick <= 0) {
        orb.damageTick = this.orbDamageInterval;
        const hitRadius = ORB_HIT_RADIUS * orb.hitScale;
        const candidates = collisionSystem
          ? collisionSystem.query(orb.x, orb.y, hitRadius + 24)
          : enemies;
        for (const enemy of candidates) {
          if (!enemy.active) continue;
          const dx = orb.x - enemy.x;
          const dy = orb.y - enemy.y;
          const hitR = hitRadius + enemy.radius;
          if (dx * dx + dy * dy < hitR * hitR) {
            // tick 半減に合わせてダメージも半減 (1秒あたりの合計DPSは概ね維持)
            const hit = this.damage * 0.2;
            if (enemy.takeDamage(hit, this._lastCrit)) this._emitKill(enemy);
            else this._tryApplyStatus(enemy, hit);
            // ヒットエフェクト: 命中位置に小さなスパーク (既存エフェクト配列に渡す)
            if (this.effects.length < 64) {
              this.effects.push({
                type: 'orb_hit', x: enemy.x, y: enemy.y, angle: 0, range: 4,
                timer: 0.12, maxTimer: 0.12, color: '#d9b8ff',
              });
            }
          }
        }
      }

      if (orb.life <= 0) {
        const last = this.orbs.length - 1;
        if (i !== last) this.orbs[i] = this.orbs[last];
        this.orbs.pop();
      }
    }

    // Cooldown & spawn new orbs
    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      this.cooldownTimer = this.cooldown;
      this._spawnOrbs();
    }

    // スキル
    this.skillCooldown -= dt;
    if (this.skillCooldown <= 0) {
      this.skillCooldown = this.skillCooldownMax;
      this.executeSkill(enemies);
    }

    // Update base effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) this.effects.splice(i, 1);
    }
  }

  _spawnOrbs() {
    const baseAngle = Math.random() * Math.PI * 2;
    const count = this.orbCount + this.player.passives.extraProjectile;
    // 周回半径は range-up の影響を受けず baseRange で固定。
    // 攻撃範囲アップはオーブの当たり判定/描画サイズに反映させる。
    const hitScale = 1 + (this.player.passives.rangeMultiplier || 0);
    for (let i = 0; i < count; i++) {
      this.orbs.push({
        x: this.player.x,
        y: this.player.y,
        angle: baseAngle + (Math.PI * 2 / count) * i,
        radius: this.baseRange,
        speed: 2.5, // radians/sec
        life: 3.0,
        damageTick: 0,
        hitScale,
      });
    }
  }

  render(ctx, camera, alpha) {
    // Render orbs — 当たり判定 (ORB_HIT_RADIUS) を可視化する二層構造
    for (const orb of this.orbs) {
      const sx = camera.worldToScreenX(orb.x);
      const sy = camera.worldToScreenY(orb.y);
      const pulse = 1 + Math.sin(orb.life * 8) * 0.15;
      const lifeAlpha = Math.min(1, orb.life / 0.5);

      ctx.save();

      // 外周オーラ (当たり判定範囲を示すラジアルグラデ)
      ctx.globalAlpha = lifeAlpha * 0.8;
      const outerR = ORB_HIT_RADIUS * orb.hitScale * pulse;
      const innerR = ORB_CORE_RADIUS * orb.hitScale * 0.5;
      const grad = ctx.createRadialGradient(sx, sy, innerR, sx, sy, outerR);
      grad.addColorStop(0, 'rgba(200,150,255,0.9)');
      grad.addColorStop(0.5, 'rgba(170,100,255,0.45)');
      grad.addColorStop(1, 'rgba(170,100,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // コア (明るい中心球)
      ctx.globalAlpha = lifeAlpha;
      ctx.fillStyle = '#f0e0ff';
      ctx.shadowColor = '#c08fff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(sx, sy, ORB_CORE_RADIUS * orb.hitScale * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ヒット位置のスパーク (命中直後に短時間残るフィードバック)
    for (const fx of this.effects) {
      if (fx.type !== 'orb_hit') continue;
      const sx = camera.worldToScreenX(fx.x);
      const sy = camera.worldToScreenY(fx.y);
      const t = 1 - (fx.timer / fx.maxTimer);
      const r = 4 + t * 10;
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
