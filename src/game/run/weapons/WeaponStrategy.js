/**
 * WeaponStrategy — 武器攻撃パターンの基底クラス
 */

import { GameConfig } from '../../data/config.js';
import { ItemBlueprints } from '../../data/items.js';
import { eventBus } from '../../core/EventBus.js';

export class WeaponStrategy {
  constructor(player, weaponItem) {
    this.player = player;
    this.weaponItem = weaponItem;
    this.cooldownTimer = 0;
    this.effects = []; // visual effects

    const bp = ItemBlueprints[weaponItem.blueprintId];
    const equipType = bp.equipType || 'sword';
    const typeConfig = GameConfig.weaponTypes[equipType];
    const wc = GameConfig.weapon;

    this.equipType = equipType;
    this.baseDamage = (bp.baseValue / wc.damageBaseDivisor) + (weaponItem.quality / wc.damageQualityDivisor);
    this.attackSpeed = wc.speedBase + (weaponItem.quality / wc.speedQualityDivisor);
    this.baseRange = typeConfig.baseRange * (1 + weaponItem.quality / wc.rangeQualityDivisor);
    this.baseCooldown = typeConfig.baseCooldown;
    this.arc = typeConfig.arc;
    this.weaponName = bp.name;
  }

  get damage() {
    let dmg = this.baseDamage * (1 + this.player.passives.damageMultiplier) + this.player.baseDamage;
    // クリティカル判定
    if (this.player.passives.critChance > 0 && Math.random() < this.player.passives.critChance) {
      dmg *= 2;
    }
    return dmg;
  }

  get range() {
    return this.baseRange * (1 + this.player.passives.rangeMultiplier);
  }

  get cooldown() {
    return Math.max(0.1, this.baseCooldown / this.attackSpeed * (1 - this.player.passives.cooldownReduction));
  }

  update(dt, enemies) {
    // エフェクト更新
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) {
        this.effects.splice(i, 1);
      }
    }

    this.cooldownTimer -= dt;
    if (this.cooldownTimer > 0) return;

    this.cooldownTimer = this.cooldown;
    this.attack(enemies);
  }

  /** Override in subclass */
  attack(enemies) {}

  /** Override in subclass for custom rendering */
  render(ctx, camera, alpha) {
    // Default: draw fan-type effects
    for (const fx of this.effects) {
      if (fx.type === 'fan') this._renderFan(ctx, camera, fx);
      else if (fx.type === 'ring') this._renderRing(ctx, camera, fx);
      else if (fx.type === 'line') this._renderLine(ctx, camera, fx);
      else if (fx.type === 'projectile') this._renderProjectile(ctx, camera, fx, alpha);
      else if (fx.type === 'orb') this._renderOrb(ctx, camera, fx, alpha);
    }
  }

  _renderFan(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.6;
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    ctx.fillStyle = fx.color || '#fff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, fx.range * (0.5 + progress * 0.5), -fx.arc / 2, fx.arc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderRing(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.5;
    ctx.strokeStyle = fx.color || '#8cf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range * progress, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderLine(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.7;
    ctx.strokeStyle = fx.color || '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(fx.angle) * fx.range * (0.5 + progress * 0.5),
      sy + Math.sin(fx.angle) * fx.range * (0.5 + progress * 0.5)
    );
    ctx.stroke();
    ctx.restore();
  }

  _renderProjectile(ctx, camera, fx, alpha) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    ctx.save();
    ctx.fillStyle = fx.color || '#ff8';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    // Arrow head
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    ctx.fillStyle = fx.color || '#ff8';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderOrb(ctx, camera, fx, alpha) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pulse = 1 + Math.sin(fx.timer * 10) * 0.2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fx.timer / 0.3);
    ctx.fillStyle = fx.color || '#a6f';
    ctx.beginPath();
    ctx.arc(sx, sy, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _emitKill(enemy) {
    eventBus.emit('enemy:killed', { enemy });
  }
}
