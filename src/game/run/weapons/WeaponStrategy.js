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
    const color = def.color || '#ff8';

    switch (def.type) {
      case 'shockwave': {
        const radius = p.radius || 150;
        const knockback = p.knockback || 0;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const distSq = dx * dx + dy * dy;
          if (distSq < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(enemy);
            else if (knockback > 0) {
              const d = Math.sqrt(distSq);
              if (d > 0.1) {
                enemy.x += (dx / d) * knockback;
                enemy.y += (dy / d) * knockback;
              }
            }
          }
        }
        const waves = p.waves || 1;
        for (let i = 0; i < waves; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.25, maxTimer: 0.25, color: '#fff' });
        this._emitBurst(px, py, 20, { speed: 180, life: 0.5, size: 3, color, shape: 'square' });
        this._shake(6 + waves * 2, 0.25 + waves * 0.05);
        this._flash(color, 0.2);
        break;
      }
      case 'multi_thrust': {
        const lineCount = p.lineCount || 3;
        const lineRange = p.lineRange || 200;
        const width = p.width || 25;
        // 全方位放射か扇状か（6本以上なら全方位）
        const fullCircle = lineCount >= 6;
        for (let n = 0; n < lineCount; n++) {
          const spreadAngle = fullCircle
            ? angle + (Math.PI * 2 / lineCount) * n
            : angle + (n - (lineCount - 1) / 2) * 0.3;
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
          this.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.35, maxTimer: 0.35, color });
          // 先端ヒット演出
          this._emitBurst(px + cos * lineRange, py + sin * lineRange, 6, { speed: 120, life: 0.3, size: 2, color, shape: 'spark' });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 28, timer: 0.2, maxTimer: 0.2, color: '#fff' });
        this._shake(5, 0.2);
        break;
      }
      // 線突き + 地面燃焼（flame_lance用）
      case 'multi_thrust_burn': {
        const lineCount = p.lineCount || 3;
        const lineRange = p.lineRange || 250;
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
              if (enemy.takeDamage(dmg * (p.dmgMult || 2.5))) this._emitKill(enemy);
            }
          }
          this.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.4, maxTimer: 0.4, color });
          // 地面に燃焼エリア（短命の炎fill）を点々と配置
          const burnSegments = 4;
          for (let s = 1; s <= burnSegments; s++) {
            const bx = px + cos * (lineRange * s / burnSegments);
            const by = py + sin * (lineRange * s / burnSegments);
            this.effects.push({ type: 'fill', x: bx, y: by, range: width + 10, timer: 0.8 + s * 0.1, maxTimer: 0.8 + s * 0.1, color: '#f83' });
            this._emitBurst(bx, by, 4, { speed: 40, life: 0.6, size: 2, color: '#f64', shape: 'circle', gravity: -30 });
          }
        }
        this._shake(7, 0.3);
        this._flash(color, 0.2);
        break;
      }
      // 突き + 先端で連鎖（thunder_spear用）
      case 'multi_chain': {
        const lineCount = p.lineCount || 5;
        const lineRange = p.lineRange || 220;
        const width = p.width || 22;
        const bounces = p.bounces || 3;
        const bounceRange = p.bounceRange || 120;
        const allHit = new Set();
        for (let n = 0; n < lineCount; n++) {
          const spreadAngle = angle + (n - (lineCount - 1) / 2) * 0.35;
          const cos = Math.cos(spreadAngle);
          const sin = Math.sin(spreadAngle);
          let tipHit = null;
          for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dx = enemy.x - px;
            const dy = enemy.y - py;
            const forward = dx * cos + dy * sin;
            if (forward < 0 || forward > lineRange) continue;
            const lateral = Math.abs(-dx * sin + dy * cos);
            if (lateral < width + enemy.radius) {
              if (!allHit.has(enemy)) {
                allHit.add(enemy);
                if (enemy.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(enemy);
              }
              tipHit = enemy;
            }
          }
          this.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.3, maxTimer: 0.3, color });
          // 先端から連鎖雷
          let current = tipHit || { x: px + cos * lineRange, y: py + sin * lineRange };
          for (let b = 0; b < bounces; b++) {
            let next = null;
            let nd = Infinity;
            for (const e of enemies) {
              if (!e.active || allHit.has(e)) continue;
              const dx = e.x - current.x;
              const dy = e.y - current.y;
              const d = dx * dx + dy * dy;
              if (d < bounceRange * bounceRange && d < nd) { nd = d; next = e; }
            }
            if (!next) break;
            this.effects.push({ type: 'line', x: current.x, y: current.y, angle: Math.atan2(next.y - current.y, next.x - current.x), range: Math.sqrt(nd), timer: 0.18 + b * 0.04, maxTimer: 0.18 + b * 0.04, color: '#ff8' });
            allHit.add(next);
            if (next.takeDamage(dmg * (p.dmgMult || 2) * 0.7)) this._emitKill(next);
            current = next;
          }
        }
        this._emitBurst(px, py, 15, { speed: 140, life: 0.3, size: 2, color: '#ff8', shape: 'spark' });
        this._shake(8, 0.3);
        this._flash(color, 0.25);
        break;
      }
      case 'arrow_rain': {
        const count = p.arrowCount || 16;
        const radius = this.range * 2;
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
          // 空から矢が降るアニメ
          const sx = target.x + (Math.random() - 0.5) * 40;
          const sy = target.y - 200;
          this.effects.push({ type: 'arrow_drop', x: sx, y: sy, tx: target.x, ty: target.y, timer: 0.35 + Math.random() * 0.15, maxTimer: 0.5, color });
          this._emitBurst(target.x, target.y, 5, { speed: 80, life: 0.25, size: 2, color, shape: 'spark' });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 50, timer: 0.25, maxTimer: 0.25, color });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.5, maxTimer: 0.5, color });
        this._shake(4, 0.3);
        break;
      }
      // 前方扇状に矢（wooden_bow用）
      case 'arrow_fan': {
        const count = p.arrowCount || 7;
        const shotRange = p.range || 260;
        const arcWidth = p.arcWidth || 0.8;
        const width = p.width || 14;
        for (let i = 0; i < count; i++) {
          const spreadAngle = angle + (i - (count - 1) / 2) * (arcWidth / Math.max(1, count - 1));
          const cos = Math.cos(spreadAngle);
          const sin = Math.sin(spreadAngle);
          for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dx = enemy.x - px;
            const dy = enemy.y - py;
            const forward = dx * cos + dy * sin;
            if (forward < 0 || forward > shotRange) continue;
            const lateral = Math.abs(-dx * sin + dy * cos);
            if (lateral < width + enemy.radius) {
              if (enemy.takeDamage(dmg * (p.dmgMult || 1.8))) this._emitKill(enemy);
            }
          }
          this.effects.push({ type: 'arrow_line', x: px, y: py, angle: spreadAngle, range: shotRange, timer: 0.3, maxTimer: 0.3, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 30, timer: 0.18, maxTimer: 0.18, color: '#fff' });
        this._shake(3, 0.15);
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
        // 落下演出 → 着弾 → 余波
        this.effects.push({ type: 'meteor_fall', x: bestX, y: bestY, timer: 0.35, maxTimer: 0.35, color });
        this.effects.push({ type: 'fill', x: bestX, y: bestY, range: radius, timer: 0.6, maxTimer: 0.6, color });
        this.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius, timer: 0.7, maxTimer: 0.7, color: '#fff' });
        this.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius * 1.2, timer: 0.9, maxTimer: 0.9, color });
        this._emitBurst(bestX, bestY, 24, { speed: 220, life: 0.6, size: 3, color, shape: 'square', gravity: 60 });
        this._shake(10, 0.4);
        this._flash(color, 0.25);
        break;
      }
      // 全敵ダメージ（world_tree_staff用）
      case 'world_break': {
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          if (enemy.takeDamage(dmg * (p.dmgMult || 6))) this._emitKill(enemy);
          // 各敵の足元に小さな地割れ
          this.effects.push({ type: 'fill', x: enemy.x, y: enemy.y, range: 24, timer: 0.4, maxTimer: 0.4, color });
          this._emitBurst(enemy.x, enemy.y, 4, { speed: 60, life: 0.35, size: 2, color, shape: 'triangle' });
        }
        // プレイヤー中心の大演出
        this.effects.push({ type: 'fill', x: px, y: py, range: 80, timer: 0.35, maxTimer: 0.35, color: '#fff' });
        for (let i = 0; i < 4; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: 60 + i * 80, timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
        }
        this._shake(15, 0.6);
        this._flash(color, 0.4);
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
        // 多層 fan + 各敵にヒット演出
        const fanCount = Math.min(hitCount * 2, 20);
        for (let i = 0; i < fanCount; i++) {
          this.effects.push({ type: 'fan', x: px, y: py, angle: Math.random() * Math.PI * 2, range: radius * (0.5 + Math.random() * 0.5), arc: 0.4 + Math.random() * 0.3, timer: 0.08 + i * 0.03, maxTimer: 0.08 + i * 0.03, color });
        }
        for (const enemy of hitEnemies) {
          this._emitBurst(enemy.x, enemy.y, 6, { speed: 100, life: 0.3, size: 2, color, shape: 'spark' });
        }
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.4, maxTimer: 0.4, color });
        this._shake(6, 0.3);
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
        for (let i = 0; i < 4; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.2), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.5, timer: 0.3, maxTimer: 0.3, color: '#fff' });
        this.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
        this._emitBurst(px, py, 16, { speed: 150, life: 0.5, size: 3, color, shape: 'square' });
        this._shake(5, 0.25);
        this._flash(color, 0.2);
        break;
      }
      // バリア + HP回復（elder_staff用）
      case 'barrier_heal': {
        const radius = p.radius || 130;
        const knockback = p.knockback || 60;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + enemy.radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 1))) this._emitKill(enemy);
            else if (dist > 0.1) {
              enemy.x += (dx / dist) * knockback;
              enemy.y += (dy / dist) * knockback;
            }
          }
        }
        this.player.invincibleTimer = Math.max(this.player.invincibleTimer, p.invincDuration || 1.5);
        // HP回復
        const healAmt = p.heal || Math.floor(this.player.effectiveMaxHp * (p.healPct || 0.15));
        this.player.hp = Math.min(this.player.effectiveMaxHp, this.player.hp + healAmt);
        eventBus.emit('damageNumber:heal', { x: this.player.x, y: this.player.y, value: healAmt });
        // 緑の葉パーティクル
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 60 + Math.random() * 80;
          this._emitBurst(px, py, 1, { speed: s, life: 0.8, size: 3, color, shape: 'triangle' });
        }
        for (let i = 0; i < 3; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#afa' });
        this.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
        this._shake(3, 0.2);
        this._flash(color, 0.2);
        break;
      }
      // バリア + 周囲凍結（ice_shield用）
      case 'freeze_barrier': {
        const radius = p.radius || 120;
        const knockback = p.knockback || 40;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + enemy.radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 0.8))) this._emitKill(enemy);
            else if (dist > 0.1) {
              enemy.x += (dx / dist) * knockback;
              enemy.y += (dy / dist) * knockback;
            }
          }
        }
        eventBus.emit('consumable:debuff', { x: px, y: py, radius, stat: 'spd', amount: p.slowAmount || -40, duration: p.duration || 3 });
        this.player.invincibleTimer = Math.max(this.player.invincibleTimer, p.invincDuration || 1.2);
        for (let i = 0; i < 3; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.25), timer: 0.5 + i * 0.12, maxTimer: 0.5 + i * 0.12, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.6, maxTimer: 0.6, color });
        this.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.2, maxTimer: p.invincDuration || 1.2, color, follow: true });
        this._emitBurst(px, py, 20, { speed: 160, life: 0.7, size: 3, color: '#cff', shape: 'triangle' });
        this._shake(4, 0.25);
        this._flash(color, 0.25);
        break;
      }
      // バリア + 衝撃波（star_shield用）
      case 'barrier_shockwave': {
        const radius = p.radius || 200;
        const knockback = p.knockback || 80;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          const distSq = dx * dx + dy * dy;
          if (distSq < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 3))) this._emitKill(enemy);
            else {
              const d = Math.sqrt(distSq);
              if (d > 0.1) {
                enemy.x += (dx / d) * knockback;
                enemy.y += (dy / d) * knockback;
              }
            }
          }
        }
        this.player.invincibleTimer = Math.max(this.player.invincibleTimer, p.invincDuration || 1.5);
        for (let i = 0; i < (p.waves || 3); i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.2), timer: 0.5 + i * 0.12, maxTimer: 0.5 + i * 0.12, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#fff' });
        this.effects.push({ type: 'barrier_orbit', x: px, y: py, radius: radius * 0.4, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
        this._emitBurst(px, py, 30, { speed: 220, life: 0.6, size: 3, color, shape: 'spark' });
        this._shake(12, 0.4);
        this._flash(color, 0.3);
        break;
      }
      case 'burn_zone': {
        const radius = p.radius || 100;
        const duration = p.duration || 3;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgPerSec || 2) * duration * 0.5)) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'burn_zone', x: px, y: py, range: radius, timer: duration, maxTimer: duration, color });
        this.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.8, maxTimer: 0.8, color });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 1.0, maxTimer: 1.0, color });
        this._emitBurst(px, py, 20, { speed: 120, life: 0.8, size: 3, color, shape: 'circle', gravity: -50 });
        this._shake(4, 0.2);
        break;
      }
      // 指定地点（密集点）に燃焼エリア（phoenix_bow用）
      case 'burn_zone_at': {
        const radius = p.radius || 100;
        const duration = p.duration || 5;
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
            if (enemy.takeDamage(dmg * (p.dmgPerSec || 3) * duration * 0.5)) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'arrow_drop', x: bestX, y: bestY - 220, tx: bestX, ty: bestY, timer: 0.35, maxTimer: 0.35, color });
        this.effects.push({ type: 'burn_zone', x: bestX, y: bestY, range: radius, timer: duration, maxTimer: duration, color });
        this.effects.push({ type: 'fill', x: bestX, y: bestY, range: radius, timer: 0.8, maxTimer: 0.8, color });
        this.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius * 1.3, timer: 0.8, maxTimer: 0.8, color: '#fff' });
        this._emitBurst(bestX, bestY, 25, { speed: 200, life: 0.7, size: 3, color, shape: 'square', gravity: -30 });
        this._shake(8, 0.3);
        this._flash(color, 0.2);
        break;
      }
      case 'freeze_zone': {
        const radius = p.radius || 140;
        const duration = p.duration || 3;
        eventBus.emit('consumable:debuff', { x: px, y: py, radius, stat: 'spd', amount: p.slowAmount || -40, duration });
        // 微ダメージ
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 0.5))) this._emitKill(enemy);
          }
        }
        this.effects.push({ type: 'freeze_zone', x: px, y: py, range: radius, timer: duration, maxTimer: duration, color });
        this.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.7, maxTimer: 0.7, color });
        this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.9, maxTimer: 0.9, color: '#fff' });
        this._emitBurst(px, py, 24, { speed: 180, life: 0.6, size: 3, color: '#cff', shape: 'triangle' });
        this._shake(5, 0.2);
        this._flash(color, 0.2);
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
        // 初弾: プレイヤー → 最初のターゲット
        if (current) {
          const d0 = Math.sqrt(minDist);
          this.effects.push({ type: 'lightning', x: px, y: py, angle: Math.atan2(current.y - py, current.x - px), range: d0, timer: 0.22, maxTimer: 0.22, color });
        }
        for (let i = 0; i < bounces && current; i++) {
          hit.add(current);
          if (current.takeDamage(dmg * (p.dmgMult || 2))) this._emitKill(current);
          this._emitBurst(current.x, current.y, 6, { speed: 120, life: 0.25, size: 2, color, shape: 'spark' });
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
            this.effects.push({ type: 'lightning', x: cx, y: cy, angle: Math.atan2(next.y - cy, next.x - cx), range: Math.sqrt(nextDist), timer: 0.2 + i * 0.04, maxTimer: 0.2 + i * 0.04, color });
          }
          current = next;
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 40, timer: 0.2, maxTimer: 0.2, color: '#fff' });
        this._shake(7, 0.3);
        this._flash(color, 0.2);
        break;
      }
      // 全方位同時雷（sky_sword用）
      case 'lightning_storm': {
        const radius = p.radius || 250;
        const rays = p.rays || 10;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 3))) this._emitKill(enemy);
            this._emitBurst(enemy.x, enemy.y, 6, { speed: 100, life: 0.3, size: 2, color, shape: 'spark' });
          }
        }
        // 全方位に雷光
        for (let i = 0; i < rays; i++) {
          const a = (Math.PI * 2 / rays) * i;
          this.effects.push({ type: 'lightning', x: px, y: py, angle: a, range: radius, timer: 0.25 + (i % 3) * 0.05, maxTimer: 0.4, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 60, timer: 0.25, maxTimer: 0.25, color: '#fff' });
        for (let i = 0; i < 3; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
        }
        this._shake(12, 0.4);
        this._flash(color, 0.3);
        break;
      }
      // 全画面に光の刃が降り注ぐ（legendary_blade用）
      case 'blade_rain': {
        const radius = p.radius || 350;
        const blades = p.blades || 40;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 5))) this._emitKill(enemy);
          }
        }
        // 画面全体に降り注ぐ刃エフェクト
        for (let i = 0; i < blades; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          const bx = px + Math.cos(a) * r;
          const by = py + Math.sin(a) * r;
          this.effects.push({ type: 'blade_drop', x: bx, y: by - 180, tx: bx, ty: by, timer: 0.3 + Math.random() * 0.4, maxTimer: 0.7, color });
        }
        for (let i = 0; i < 4; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.2), timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
        }
        this.effects.push({ type: 'fill', x: px, y: py, range: 80, timer: 0.3, maxTimer: 0.3, color: '#fff' });
        this._shake(14, 0.5);
        this._flash(color, 0.35);
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
        // 回転する風刃（時間変化で回る）
        const duration = p.duration || 0.6;
        this.effects.push({ type: 'spin_blades', x: px, y: py, bladeCount, range: radius, timer: duration, maxTimer: duration, color, follow: true });
        for (let i = 0; i < bladeCount; i++) {
          const a = (Math.PI * 2 / bladeCount) * i;
          this.effects.push({ type: 'fan', x: px, y: py, angle: a, range: radius, arc: 0.5, timer: 0.3 + i * 0.05, maxTimer: 0.3 + i * 0.05, color });
        }
        this._emitBurst(px, py, 20, { speed: 160, life: 0.5, size: 3, color, shape: 'square' });
        this._shake(6, 0.3);
        break;
      }
      // 炎纏いの大回転斬り（fire_sword用）
      case 'spin_blade': {
        const radius = p.radius || 160;
        const spins = p.spins || 2;
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const dx = enemy.x - px;
          const dy = enemy.y - py;
          if (dx * dx + dy * dy < radius * radius) {
            if (enemy.takeDamage(dmg * (p.dmgMult || 2.5))) this._emitKill(enemy);
          }
        }
        const duration = 0.6;
        this.effects.push({ type: 'spin_blades', x: px, y: py, bladeCount: 6, range: radius, timer: duration, maxTimer: duration, color, follow: true, spins });
        this.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.6, timer: 0.3, maxTimer: 0.3, color });
        for (let i = 0; i < 2; i++) {
          this.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.4 + i * 0.1, maxTimer: 0.4 + i * 0.1, color });
        }
        this._emitBurst(px, py, 30, { speed: 200, life: 0.6, size: 3, color, shape: 'square', gravity: -50 });
        this._shake(9, 0.35);
        this._flash(color, 0.25);
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
        this.effects.push({ type: 'pierce_beam', x: px, y: py, angle, range: shotRange, width, timer: 0.45, maxTimer: 0.45, color });
        this.effects.push({ type: 'fill', x: px + cos * shotRange, y: py + sin * shotRange, range: 50, timer: 0.3, maxTimer: 0.3, color: '#fff' });
        this.effects.push({ type: 'ring', x: px + cos * shotRange, y: py + sin * shotRange, range: 60, timer: 0.4, maxTimer: 0.4, color });
        // 射線上にパーティクル
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          this._emitBurst(px + cos * shotRange * t, py + sin * shotRange * t, 3, { speed: 60, life: 0.3, size: 2, color, shape: 'spark' });
        }
        this._shake(10, 0.35);
        this._flash(color, 0.25);
        break;
      }
    }

    eventBus.emit('skill:activated', { name: def.name, color });
  }

  // ===== 演出ヘルパー =====
  _emitBurst(x, y, count, config) {
    eventBus.emit('particles:burst', { x, y, count, config });
  }
  _shake(power, duration) {
    eventBus.emit('camera:shake', { power, duration });
  }
  _flash(color, duration) {
    eventBus.emit('ui:flash', { color, duration });
  }

  /** Override in subclass for custom rendering */
  render(ctx, camera, alpha) {
    const px = this.player.x;
    const py = this.player.y;
    for (const fx of this.effects) {
      // follow=trueのエフェクトはプレイヤー追従
      if (fx.follow) { fx.x = px; fx.y = py; }
      switch (fx.type) {
        case 'fan': this._renderFan(ctx, camera, fx); break;
        case 'ring': this._renderRing(ctx, camera, fx); break;
        case 'line': this._renderLine(ctx, camera, fx); break;
        case 'projectile': this._renderProjectile(ctx, camera, fx, alpha); break;
        case 'orb': this._renderOrb(ctx, camera, fx, alpha); break;
        case 'fill': this._renderFill(ctx, camera, fx); break;
        case 'thrust': this._renderThrust(ctx, camera, fx); break;
        case 'arrow_drop': this._renderArrowDrop(ctx, camera, fx); break;
        case 'arrow_line': this._renderArrowLine(ctx, camera, fx); break;
        case 'blade_drop': this._renderBladeDrop(ctx, camera, fx); break;
        case 'lightning': this._renderLightning(ctx, camera, fx); break;
        case 'meteor_fall': this._renderMeteorFall(ctx, camera, fx); break;
        case 'burn_zone': this._renderBurnZone(ctx, camera, fx); break;
        case 'freeze_zone': this._renderFreezeZone(ctx, camera, fx); break;
        case 'barrier_orbit': this._renderBarrierOrbit(ctx, camera, fx); break;
        case 'spin_blades': this._renderSpinBlades(ctx, camera, fx); break;
        case 'pierce_beam': this._renderPierceBeam(ctx, camera, fx); break;
      }
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

  _renderThrust(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const reach = fx.range * Math.min(1, progress * 1.8);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    const grad = ctx.createLinearGradient(0, 0, reach, 0);
    grad.addColorStop(0, this._hexA(fx.color, (1 - progress) * 0.9));
    grad.addColorStop(1, this._hexA(fx.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -fx.width);
    ctx.lineTo(reach, 0);
    ctx.lineTo(0, fx.width);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this._hexA('#fff', (1 - progress) * 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  _renderArrowDrop(ctx, camera, fx) {
    const progress = 1 - fx.timer / fx.maxTimer;
    const cx = fx.x + (fx.tx - fx.x) * progress;
    const cy = fx.y + (fx.ty - fx.y) * progress;
    const sx = camera.worldToScreenX(cx);
    const sy = camera.worldToScreenY(cy);
    const angle = Math.atan2(fx.ty - fx.y, fx.tx - fx.x);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, fx.timer / 0.2);
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderArrowLine(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const reach = fx.range * Math.min(1, progress * 2);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    ctx.globalAlpha = (1 - progress) * 0.9;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach, 0);
    ctx.stroke();
    // 矢尻
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    ctx.moveTo(reach + 6, 0);
    ctx.lineTo(reach - 4, -4);
    ctx.lineTo(reach - 4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderBladeDrop(ctx, camera, fx) {
    const progress = 1 - fx.timer / fx.maxTimer;
    const cx = fx.x + (fx.tx - fx.x) * progress;
    const cy = fx.y + (fx.ty - fx.y) * progress;
    const sx = camera.worldToScreenX(cx);
    const sy = camera.worldToScreenY(cy);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.globalAlpha = Math.min(1, fx.timer / 0.15);
    ctx.fillStyle = fx.color;
    ctx.shadowColor = fx.color;
    ctx.shadowBlur = 10;
    ctx.fillRect(-2, -14, 4, 28);
    ctx.restore();
  }

  _renderLightning(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const ex = sx + Math.cos(fx.angle) * fx.range;
    const ey = sy + Math.sin(fx.angle) * fx.range;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.95;
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = fx.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    // ジグザグ
    const segs = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const jx = sx + (ex - sx) * t + (Math.random() - 0.5) * 14;
      const jy = sy + (ey - sy) * t + (Math.random() - 0.5) * 14;
      ctx.lineTo(jx, jy);
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  _renderMeteorFall(ctx, camera, fx) {
    const progress = 1 - fx.timer / fx.maxTimer;
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const fallDist = 220 * (1 - progress);
    ctx.save();
    ctx.globalAlpha = progress < 0.9 ? 1 : (1 - progress) * 10;
    ctx.strokeStyle = fx.color;
    ctx.shadowColor = fx.color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy - fallDist - 40);
    ctx.lineTo(sx, sy - fallDist);
    ctx.stroke();
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    ctx.arc(sx, sy - fallDist, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _renderBurnZone(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pct = fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = pct * 0.35;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, fx.range);
    grad.addColorStop(0, this._hexA(fx.color, 0.6));
    grad.addColorStop(1, this._hexA(fx.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range, 0, Math.PI * 2);
    ctx.fill();
    // 揺らめく外縁
    ctx.globalAlpha = pct * 0.5;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = (1 - pct) * 30;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderFreezeZone(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pct = fx.timer / fx.maxTimer;
    ctx.save();
    ctx.globalAlpha = pct * 0.3;
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = pct * 0.7;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(sx, sy, fx.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderBarrierOrbit(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pct = fx.timer / fx.maxTimer;
    const rotAngle = (1 - pct) * Math.PI * 4;
    const orbs = 6;
    ctx.save();
    ctx.globalAlpha = pct * 0.85;
    ctx.shadowColor = fx.color;
    ctx.shadowBlur = 10;
    for (let i = 0; i < orbs; i++) {
      const a = rotAngle + (Math.PI * 2 / orbs) * i;
      const ox = sx + Math.cos(a) * fx.radius;
      const oy = sy + Math.sin(a) * fx.radius;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // リング輪郭
    ctx.globalAlpha = pct * 0.4;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderSpinBlades(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pct = 1 - fx.timer / fx.maxTimer;
    const spins = fx.spins || 1;
    const rot = pct * Math.PI * 2 * spins;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    ctx.globalAlpha = (1 - pct) * 0.9;
    ctx.shadowColor = fx.color;
    ctx.shadowBlur = 12;
    for (let i = 0; i < fx.bladeCount; i++) {
      const a = (Math.PI * 2 / fx.bladeCount) * i;
      ctx.save();
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(0, 0, fx.range, 0);
      grad.addColorStop(0, this._hexA(fx.color, 0.9));
      grad.addColorStop(1, this._hexA(fx.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(fx.range, 0);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _renderPierceBeam(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const pct = 1 - fx.timer / fx.maxTimer;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    ctx.globalAlpha = (1 - pct) * 0.95;
    // 外側グロー
    ctx.fillStyle = this._hexA(fx.color, 0.5);
    ctx.fillRect(0, -fx.width, fx.range, fx.width * 2);
    // 内側白コア
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, -fx.width * 0.35, fx.range, fx.width * 0.7);
    ctx.restore();
  }

  // #rgb/#rrggbb カラーにアルファを適用
  _hexA(hex, alpha) {
    if (!hex || hex[0] !== '#') return `rgba(255,255,255,${alpha})`;
    let r, g, b;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _emitKill(enemy) {
    eventBus.emit('enemy:killed', { enemy, x: enemy.x, y: enemy.y, isBoss: enemy.isBoss, color: enemy.color });
  }
}
