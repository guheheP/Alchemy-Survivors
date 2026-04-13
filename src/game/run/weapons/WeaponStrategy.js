/**
 * WeaponStrategy — 武器攻撃パターンの基底クラス
 */

import { GameConfig } from '../../data/config.js';
import { ItemBlueprints } from '../../data/items.js';
import { WeaponSkillDefs } from '../../data/weaponSkills.js';
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
    this.baseValue = bp.baseValue;
    this.baseDamage = (bp.baseValue / wc.damageBaseDivisor) + (weaponItem.quality / wc.damageQualityDivisor);
    this.attackSpeed = wc.speedBase + (weaponItem.quality / wc.speedQualityDivisor);
    this.baseRange = typeConfig.baseRange * (1 + weaponItem.quality / wc.rangeQualityDivisor);
    this.baseCooldown = typeConfig.baseCooldown;
    this.arc = typeConfig.arc;
    this.weaponName = bp.name;

    // スキルシステム
    this.skillTier = this._calcSkillTier(bp.baseValue);
    this.skillCooldown = 0;
    this.skillCooldownMax = Math.max(6, 15 - this.skillTier * 2); // T1:13s T2:11s T3:9s T4:7s
    this._enemies = null; // update時に保持
    this.skillDef = WeaponSkillDefs[weaponItem.blueprintId] || null;
    if (this.skillDef) {
      this.skillCooldownMax = this.skillDef.cooldown;
    }
  }

  /** baseValueからスキルティアを算出 (1-4) */
  _calcSkillTier(baseValue) {
    if (baseValue >= 400) return 4;
    if (baseValue >= 150) return 3;
    if (baseValue >= 50) return 2;
    return 1;
  }

  get damage() {
    let dmg = this.baseDamage * (1 + this.player.passives.damageMultiplier) + this.player.baseDamage;
    // クリティカル判定
    this._lastCrit = false;
    if (this.player.passives.critChance > 0 && Math.random() < this.player.passives.critChance) {
      dmg *= 2;
      this._lastCrit = true;
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
    this._enemies = enemies;

    // エフェクト更新
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) {
        this.effects.splice(i, 1);
      }
    }

    // 通常攻撃
    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      this.cooldownTimer = this.cooldown;
      this.attack(enemies);
    }

    // スキル
    this.skillCooldown -= dt;
    if (this.skillCooldown <= 0) {
      this.skillCooldown = this.skillCooldownMax;
      this.executeSkill(enemies);
    }
  }

  /** Override in subclass */
  attack(enemies) {}

  /** 武器固有スキル自動発動 */
  executeSkill(enemies) {
    if (!this.skillDef) return;
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.player.facingAngle;
    const dmg = this.damage;
    const def = this.skillDef;
    const p = def.params;

    switch (def.type) {
      case 'shockwave': {
        const radius = p.radius || 150;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(enemy);
          }
        }
        for (let i = 0; i < (p.waves || 1); i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.6 + i * 0.2), timer: 0.4 + i * 0.1, maxTimer: 0.4 + i * 0.1, color: def.color || '#ff8' });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.3, timer: 0.2, maxTimer: 0.2, color: '#fff' });
        break;
      }
      case 'multi_thrust': {
        const lineCount = p.lineCount || 3;
        const lineRange = p.lineRange || 200;
        const width = p.width || 25;
        for (let n = 0; n < lineCount; n++) {
          const spreadAngle = angle + (n - (lineCount - 1) / 2) * 0.3;
          const cos = Math.cos(spreadAngle);
          const sin = Math.sin(spreadAngle);
          for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dx = enemy.x - px;
            const dy = enemy.y - py;
            const forward = dx * cos + dy * sin;
            if (forward < 0 || forward > lineRange) continue;
            const lateral = Math.abs(-dx * sin + dy * cos);
            if (lateral < width + enemy.radius) {
              if (enemy.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(enemy);
            }
          }
          this.effects.push({ type: 'line', x: px, y: py, angle: spreadAngle, range: lineRange, timer: 0.3, maxTimer: 0.3, color: def.color || '#cdf' });
        }
        break;
      }
      case 'arrow_rain': {
        const count = p.arrowCount || 16;
        const radius = this.range * 2;
        // Each arrow targets a random enemy in range
        const inRange = enemies.filter(e => {
          if (!e.active) return false;
          const dx = e.x - px;
          const dy = e.y - py;
          return dx * dx + dy * dy < radius * radius;
        });
        for (let i = 0; i < count; i++) {
          if (inRange.length === 0) break;
          const target = inRange[Math.floor(Math.random() * inRange.length)];
          if (!target.active) continue;
          if (target.takeDamage(dmg * 1.5)) this._emitKill(target);
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 40, timer: 0.2, maxTimer: 0.2, color: def.color || '#ff8' });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.4, maxTimer: 0.4, color: def.color || '#ff8' });
        // Multiple small ring effects for arrow impacts
        for (let i = 0; i < Math.min(count, 8); i++) {
          const a = (Math.PI * 2 / Math.min(count, 8)) * i;
          const r = radius * (0.3 + Math.random() * 0.5);
          this.effects.push({ type: 'ring', x: px + Math.cos(a) * r, y: py + Math.sin(a) * r, range: 15, timer: 0.15 + i * 0.03, maxTimer: 0.15 + i * 0.03, color: def.color || '#ff8' });
        }
        break;
      }
      case 'meteor': {
        const radius = p.radius || 100;
        let bestX = px, bestY = py, bestCount = 0;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          let count = 0;
          for (const other of enemies) {
            if (!other.active) continue;
            const dx = other.x - enemy.x;
            const dy = other.y - enemy.y;
            if (dx * dx + dy * dy < radius * radius) count++;
          }
          if (count > bestCount) { bestCount = count; bestX = enemy.x; bestY = enemy.y; }
        }
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - bestX;
          const dy = enemy.y - bestY;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 3))) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'fill', x: bestX, y: bestY, range: radius, timer: 0.5, maxTimer: 0.5, color: def.color || '#a6f' });
        this.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius, timer: 0.6, maxTimer: 0.6, color: def.color || '#c8f' });
        break;
      }
      case 'flurry': {
        const hitCount = p.hitCount || 7;
        const radius = p.radius || 120;
        const hitEnemies = [];
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) hitEnemies.push(enemy);
        }
        for (let i = 0; i < hitCount; i++) {
          for (const enemy of hitEnemies) {
            if (!enemy.active) continue;
            if (enemy.takeDamage(dmg * (p.dmgMult || 0.5))) this._emitKill(enemy);
          }
        }
        for (let i = 0; i < Math.min(hitCount, 10); i++) {
          this.effects.push({ type: 'fan', x: px, y: py, angle: Math.random() * Math.PI * 2, range: radius * (0.5 + Math.random() * 0.5), arc: 0.4 + Math.random() * 0.3, timer: 0.05 + i * 0.03, maxTimer: 0.05 + i * 0.03, color: def.color || '#fca' });
        }
        break;
      }
      case 'barrier': {
        const radius = p.radius || 130;
        const knockback = p.knockback || 100;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + enemy.radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 1))) {
              this._emitKill(enemy);
            } else if (dist > 0.1) {
              enemy.x += (dx / dist) * knockback;
              enemy.y += (dy / dist) * knockback;
            }
          }
        }
        this.player.invincibleTimer = Math.max(this.player.invincibleTimer, p.invincDuration || 1.5);
        for (let i = 0; i < 3; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.4 + i * 0.1, maxTimer: 0.4 + i * 0.1, color: def.color || '#8cf' });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#fff' });
        break;
      }
      case 'burn_zone': {
        const radius = p.radius || 100;
        // Instant damage + emit for ongoing zone (simplified: just big damage now)
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgPerSec || 2) * (p.duration || 3) * 0.5)) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.8, maxTimer: 0.8, color: def.color || '#f62' });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 1.0, maxTimer: 1.0, color: def.color || '#f84' });
        break;
      }
      case 'freeze_zone': {
        const radius = p.radius || 140;
        eventBus.emit('consumable:debuff', { x: px, y: py, radius, stat: 'spd', amount: p.slowAmount || -40, duration: p.duration || 3 });
        this.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.6, maxTimer: 0.6, color: def.color || '#8ef' });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.8, maxTimer: 0.8, color: '#fff' });
        break;
      }
      case 'chain_lightning': {
        const bounces = p.bounces || 5;
        const bounceRange = p.bounceRange || 130;
        let current = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const d = dx * dx + dy * dy;
          if (d < minDist) { minDist = d; current = enemy; }
        }
        const hit = new Set();
        for (let i = 0; i < bounces && current; i++) {
          hit.add(current);
          if (current.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(current);
          const cx = current.x;
          const cy = current.y;
          let next = null;
          let nextDist = Infinity;
          for (const enemy of enemies) {
            if (!enemy.active || hit.has(enemy)) continue;
            const dx = enemy.x - cx;
            const dy = enemy.y - cy;
            const d = dx * dx + dy * dy;
            if (d < bounceRange * bounceRange && d < nextDist) { nextDist = d; next = enemy; }
          }
          if (next) {
            this.effects.push({ type: 'line', x: cx, y: cy, angle: Math.atan2(next.y - cy, next.x - cx), range: Math.sqrt(nextDist), timer: 0.15 + i * 0.05, maxTimer: 0.15 + i * 0.05, color: def.color || '#ff4' });
          }
          current = next;
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 30, timer: 0.15, maxTimer: 0.15, color: '#fff' });
        break;
      }
      case 'blade_storm': {
        const bladeCount = p.bladeCount || 4;
        const radius = p.radius || 130;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 1) * bladeCount)) this._emitKill(enemy);
          }
        }
        for (let i = 0; i < bladeCount; i++) {
          const a = (Math.PI * 2 / bladeCount) * i;
          this.effects.push({ type: 'fan', x: px, y: py, angle: a, range: radius, arc: 0.5, timer: 0.3 + i * 0.05, maxTimer: 0.3 + i * 0.05, color: def.color || '#ccc' });
        }
        break;
      }
      case 'piercing_shot': {
        const shotRange = p.range || 300;
        const width = p.width || 30;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const forward = dx * cos + dy * sin;
          if (forward < 0 || forward > shotRange) continue;
          const lateral = Math.abs(-dx * sin + dy * cos);
          if (lateral < width + enemy.radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 5))) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'line', x: px, y: py, angle, range: shotRange, timer: 0.3, maxTimer: 0.3, color: def.color || '#f44' });
        this.effects.push({ type: 'ring', x: px + cos * shotRange, y: py + sin * shotRange, range: 30, timer: 0.2, maxTimer: 0.2, color: '#fff' });
        break;
      }
    }

    eventBus.emit('toast', { message: `${def.name}！`, type: 'default' });
  }

  /** Override in subclass for custom rendering */
  render(ctx, camera, alpha) {
    // Default: draw fan-type effects
    for (const fx of this.effects) {
      if (fx.type === 'fan') this._renderFan(ctx, camera, fx);
      else if (fx.type === 'ring') this._renderRing(ctx, camera, fx);
      else if (fx.type === 'line') this._renderLine(ctx, camera, fx);
      else if (fx.type === 'projectile') this._renderProjectile(ctx, camera, fx, alpha);
      else if (fx.type === 'orb') this._renderOrb(ctx, camera, fx, alpha);
      else if (fx.type === 'fill') this._renderFill(ctx, camera, fx);
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

  _renderFill(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.4;
    ctx.fillStyle = fx.color || '#f80';
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range * (0.3 + progress * 0.7), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _emitKill(enemy) {
    eventBus.emit('enemy:killed', { enemy });
  }
}
