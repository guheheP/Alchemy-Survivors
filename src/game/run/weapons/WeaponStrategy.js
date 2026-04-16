/**
 * WeaponStrategy — 武器攻撃パターンの基底クラス
 */

import { GameConfig } from '../../data/config.js';
import { ItemBlueprints } from '../../data/items.js';
import { WeaponSkillDefs } from '../../data/weaponSkills.js';
import { eventBus } from '../../core/EventBus.js';

/** 属性→状態異常の変換テーブル
 * dpsRatio: DoT の毎秒ダメージを「そのヒットで実際に与えたダメージ」の何割にするか。
 *           旧実装は this.baseDamage 基準で、プレイヤー強化が反映されず 0〜2 ダメージ
 *           しか出なかった。新実装は hitDamage 基準で強化に追従する。
 */
const STATUS_EFFECT_CONFIG = {
  fire:      { type: 'burn',   procChance: 0.20, duration: 3.0, dpsRatio: 0.10 },
  ice:       { type: 'freeze', procChance: 0.15, duration: 2.0, speedMod: -40 },
  poison:    { type: 'poison', procChance: 0.25, duration: 3.0, dpsRatio: 0.05 },
  lightning: { type: 'shock',  procChance: 0.12, duration: 0.4 },
  // wind は拡散専用、直接の状態異常なし
};

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
    // Blueprint 固有のダメージ倍率 (無属性武器のバランス調整用、既定1.0)
    const dmgMult = bp.baseDamageMultiplier || 1.0;
    this.baseDamage = ((bp.baseValue / wc.damageBaseDivisor) + (weaponItem.quality / wc.damageQualityDivisor)) * dmgMult;
    this.attackSpeed = wc.speedBase + (weaponItem.quality / wc.speedQualityDivisor);
    this.baseRange = typeConfig.baseRange * (1 + weaponItem.quality / wc.rangeQualityDivisor);
    this.baseCooldown = typeConfig.baseCooldown;
    this.arc = typeConfig.arc;
    this.weaponName = bp.name;
    // 武器固有のベースクリ率（Blueprintで定義、dagger/特定武器のみ）
    this.baseCritChance = bp.baseCritChance || 0;
    // 武器属性（fire/ice/poison/lightning/wind）
    this.element = bp.element || null;

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
    // クリティカル判定 — プレイヤーのクリ率 + 武器ベースクリ率（上限100%）
    this._lastCrit = false;
    const totalCrit = Math.min(1, this.player.passives.critChance + this.baseCritChance);
    if (totalCrit > 0 && Math.random() < totalCrit) {
      // critDamage は加算式（初期1.0→×2.0, +0.5で×2.5）
      dmg *= (1 + this.player.passives.critDamage);
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
    // フラリッシュ中心位置 — 遠隔スキル(meteor/burn_zone_at)はbestX/bestYに上書きされる
    let flourishX = px, flourishY = py;

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
              if (d > 0.1) enemy.tryKnockback?.(dx, dy, d, knockback);
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
        flourishX = bestX; flourishY = bestY;
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
              enemy.tryKnockback?.(dx, dy, dist, knockback);
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
              enemy.tryKnockback?.(dx, dy, dist, knockback);
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
              enemy.tryKnockback?.(dx, dy, dist, knockback);
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
              if (d > 0.1) enemy.tryKnockback?.(dx, dy, d, knockback);
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
        flourishX = bestX; flourishY = bestY;
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

    // スキル発動時の確定状態異常付与（範囲内の生存敵に適用）
    // 遠隔スキル(meteor/burn_zone_at)は効果位置(flourishX/Y)を中心に判定
    if (this.element) {
      const skillRadius = p.radius || p.lineRange || p.range || 200;
      // スキルDoTはスキル基準ダメージ(dmg)を hitDamage として渡す
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const edx = enemy.x - flourishX;
        const edy = enemy.y - flourishY;
        if (edx * edx + edy * edy < skillRadius * skillRadius) {
          this._tryApplyStatus(enemy, dmg, true);
        }
      }
    }

    // Tier別の追加演出（上位武器ほど派手に、発動位置・パターンはスキルタイプ依存）
    this._emitSkillFlourish(flourishX, flourishY, color, angle, def.type);

    eventBus.emit('skill:activated', { name: def.name, color, tier: this.skillTier });
  }

  /**
   * スキルタイプに応じたシグネチャフラリッシュを描画
   * 武器装備枠(equipType)ではなく def.type でディスパッチするため
   * 「sword装備だが前方突きスキル」の dark_blade/dragon_slayer も正しく前方演出になる
   */
  _emitSkillFlourish(px, py, color, angle, skillType) {
    const tier = this.skillTier;
    if (tier <= 1) return;

    // スキルタイプ別のシグネチャ演出
    switch (skillType) {
      // 前方突進/ビーム/扇状
      case 'multi_thrust':
      case 'multi_thrust_burn':
      case 'multi_chain':
      case 'piercing_shot':
      case 'arrow_fan':
        this._flourishForward(px, py, color, angle, tier);
        break;
      // 放射AoE (自身中心の爆発/旋回)
      case 'shockwave':
      case 'spin_blade':
      case 'blade_storm':
      case 'lightning_storm':
      case 'freeze_zone':
      case 'burn_zone':
        this._flourishRadial(px, py, color, tier, skillType);
        break;
      // 結界/バリア
      case 'barrier':
      case 'barrier_heal':
      case 'barrier_shockwave':
      case 'freeze_barrier':
        this._flourishBarrier(px, py, color, tier, skillType);
        break;
      // 群舞連撃
      case 'flurry':
        this._flourishFlurry(px, py, color, tier);
        break;
      // 矢の雨
      case 'arrow_rain':
        this._flourishArrowRain(px, py, color, tier);
        break;
      // 連鎖雷
      case 'chain_lightning':
        this._flourishChain(px, py, color, tier);
        break;
      // 画面全域
      case 'blade_rain':
      case 'world_break':
        this._flourishWide(px, py, color, tier);
        break;
      // 遠隔着弾
      case 'meteor':
      case 'burn_zone_at':
        this._flourishRemote(px, py, color, tier);
        break;
      default:
        this._flourishDefault(px, py, color, tier);
    }

    // --- 共通T3+: 光柱（空間演出の格上げ） ---
    if (tier >= 3) {
      this.effects.push({
        type: 'light_column', x: px, y: py,
        timer: 0.55, maxTimer: 0.55, color,
      });
      this._shake(6, 0.25);
    }

    // --- 共通T4: 魔法陣+画面フラッシュ+大爆発 ---
    if (tier >= 4) {
      this.effects.push({
        type: 'magic_circle', x: px, y: py,
        range: 140, timer: 1.0, maxTimer: 1.0, color,
      });
      this._emitBurst(px, py, 40, { speed: 320, life: 0.85, size: 3, color, shape: 'spark' });
      this._emitBurst(px, py, 16, { speed: 140, life: 1.1, size: 4, color: '#fff', shape: 'circle' });
      this._flash(color, 0.4);
      this._shake(12, 0.4);
    }
  }

  /** 前方突進: 前方への光ビーム+側方トレイル+先端衝撃リング */
  _flourishForward(px, py, color, angle, tier) {
    const reach = 220 + tier * 40;
    // メインビーム (貫通するピアスビーム風)
    this.effects.push({
      type: 'pierce_beam', x: px, y: py,
      angle, range: reach, width: 14 + tier * 3,
      timer: 0.45, maxTimer: 0.45, color,
    });
    // 側方の風圧トレイル
    const sideCount = tier === 2 ? 2 : tier === 3 ? 4 : 6;
    for (let i = 0; i < sideCount; i++) {
      const spread = ((i % 2 === 0) ? 1 : -1) * (0.2 + Math.floor(i / 2) * 0.18);
      this.effects.push({
        type: 'slash_trail', x: px, y: py,
        angle: angle + spread,
        range: reach * 0.75,
        timer: 0.3, maxTimer: 0.3, color,
      });
    }
    // 先端の衝撃リング
    const tipX = px + Math.cos(angle) * reach * 0.92;
    const tipY = py + Math.sin(angle) * reach * 0.92;
    this.effects.push({
      type: 'tier_ring', x: tipX, y: tipY,
      range: 55 + tier * 10, width: 2.5 + tier * 0.8,
      timer: 0.55, maxTimer: 0.55, color,
    });
    // T4: 射線上の中間衝撃波
    if (tier >= 4) {
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const mx = px + Math.cos(angle) * reach * t;
        const my = py + Math.sin(angle) * reach * t;
        this.effects.push({
          type: 'tier_ring', x: mx, y: my,
          range: 40, width: 3,
          timer: 0.35 + i * 0.05, maxTimer: 0.35 + i * 0.05, color: '#fff',
        });
      }
    }
    // 発動点の閃光
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 22 + tier * 6,
      timer: 0.3, maxTimer: 0.3, color,
    });
  }

  /** 放射AoE: 多重拡大リング+中心閃光+回転刃(旋回系のみ) */
  _flourishRadial(px, py, color, tier, skillType) {
    const ringCount = Math.min(tier, 3);
    for (let i = 0; i < ringCount; i++) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: 100 + i * 80 + tier * 15,
        timer: 0.6 + i * 0.12, maxTimer: 0.6 + i * 0.12,
        color, width: 3 + tier * 0.8,
      });
    }
    // 中心閃光
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 32 + tier * 10,
      timer: 0.4, maxTimer: 0.4, color,
    });
    // 旋回系なら追加の回転刃 (spin_blade, blade_storm)
    if (skillType === 'spin_blade' || skillType === 'blade_storm') {
      this.effects.push({
        type: 'spin_blades', x: px, y: py,
        bladeCount: 4 + tier * 2, range: 90 + tier * 25,
        timer: 0.5 + tier * 0.1, maxTimer: 0.5 + tier * 0.1,
        color, follow: true, spins: tier,
      });
    }
    // 雷系/衝撃波系は8方向放射光 (T3+)
    if (tier >= 3 && (skillType === 'lightning_storm' || skillType === 'shockwave')) {
      this.effects.push({
        type: 'radial_rays', x: px, y: py,
        rayCount: 8 + tier * 2,
        range: 180 + tier * 25,
        timer: 0.5, maxTimer: 0.5, color,
      });
    }
  }

  /** 結界/バリア: 多角形結界+外周の光輪 */
  _flourishBarrier(px, py, color, tier, skillType) {
    const sides = tier === 2 ? 6 : tier === 3 ? 6 : 8;
    const layers = tier === 2 ? 1 : tier === 3 ? 2 : 3;
    for (let l = 0; l < layers; l++) {
      this.effects.push({
        type: 'polygon_barrier', x: px, y: py,
        range: 85 + tier * 20 + l * 25,
        sides,
        timer: 0.75 + l * 0.1, maxTimer: 0.75 + l * 0.1,
        color,
      });
    }
    // 中心閃光
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 40 + tier * 8,
      timer: 0.4, maxTimer: 0.4, color,
    });
    // 衝撃結界 (barrier_shockwave) はT4+相当の追加衝撃波
    if (skillType === 'barrier_shockwave' || tier >= 4) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: 220, width: 5,
        timer: 0.8, maxTimer: 0.8, color: '#fff',
      });
    }
  }

  /** 群舞連撃 (flurry): 周囲にランダム閃光+高速リング */
  _flourishFlurry(px, py, color, tier) {
    const flashCount = tier === 2 ? 6 : tier === 3 ? 12 : 18;
    const radius = 90 + tier * 20;
    for (let i = 0; i < flashCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * radius;
      const fx = px + Math.cos(a) * r;
      const fy = py + Math.sin(a) * r;
      this.effects.push({
        type: 'sparkle_burst',
        x: fx, y: fy,
        range: 14 + Math.random() * 14,
        timer: 0.12 + Math.random() * 0.28,
        maxTimer: 0.35, color,
      });
    }
    // プレイヤー中心の高速リング(重ね)
    for (let i = 0; i < Math.min(tier, 3); i++) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: radius - i * 20, width: 2,
        timer: 0.25 + i * 0.05, maxTimer: 0.25 + i * 0.05, color,
      });
    }
  }

  /** 矢の雨 (arrow_rain): 降り注ぐ光の矢 */
  _flourishArrowRain(px, py, color, tier) {
    const arrowCount = tier === 2 ? 6 : tier === 3 ? 12 : 20;
    const radius = 140 + tier * 40;
    for (let i = 0; i < arrowCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const tx = px + Math.cos(a) * r;
      const ty = py + Math.sin(a) * r;
      this.effects.push({
        type: 'arrow_drop',
        x: tx, y: ty - 200, tx, ty,
        timer: 0.25 + Math.random() * 0.45,
        maxTimer: 0.7, color,
      });
    }
    // 範囲を示す外周輪
    this.effects.push({
      type: 'tier_ring', x: px, y: py,
      range: radius, width: 2,
      timer: 0.8, maxTimer: 0.8, color,
    });
    if (tier >= 4) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: radius * 0.6, width: 4,
        timer: 0.6, maxTimer: 0.6, color: '#fff',
      });
    }
  }

  /** 連鎖雷 (chain_lightning): ランダム点間のジグザグ雷+火花 */
  _flourishChain(px, py, color, tier) {
    const boltCount = tier === 2 ? 3 : tier === 3 ? 6 : 10;
    const spreadR = 120 + tier * 30;
    // 起点周囲にランダム点を生成し、折れ線でつなぐ
    const points = [{ x: px, y: py }];
    for (let i = 0; i < boltCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * spreadR;
      points.push({ x: px + Math.cos(a) * r, y: py + Math.sin(a) * r });
    }
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const a = Math.atan2(cur.y - prev.y, cur.x - prev.x);
      const r = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      this.effects.push({
        type: 'lightning', x: prev.x, y: prev.y,
        angle: a, range: r,
        timer: 0.18 + i * 0.03, maxTimer: 0.35, color,
      });
      // 折返点の火花
      this.effects.push({
        type: 'sparkle_burst', x: cur.x, y: cur.y,
        range: 16, timer: 0.25, maxTimer: 0.25, color,
      });
    }
    if (tier >= 4) {
      // 起点の強大な閃光
      this.effects.push({
        type: 'sparkle_burst', x: px, y: py,
        range: 60, timer: 0.45, maxTimer: 0.45, color: '#fff',
      });
    }
  }

  /** 画面全域 (blade_rain/world_break): 全方位放射+多重リング */
  _flourishWide(px, py, color, tier) {
    // 全方位放射光
    this.effects.push({
      type: 'radial_rays', x: px, y: py,
      rayCount: 12 + tier * 4,
      range: 280 + tier * 40,
      timer: 0.6, maxTimer: 0.6, color,
    });
    this.effects.push({
      type: 'radial_rays', x: px, y: py,
      rayCount: 8,
      range: 200,
      timer: 0.5, maxTimer: 0.5, color: '#fff',
    });
    // 多重リング
    for (let i = 0; i < 4; i++) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: 100 + i * 110,
        timer: 0.6 + i * 0.12, maxTimer: 0.6 + i * 0.12,
        color, width: 4,
      });
    }
    // 中心大閃光
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 60 + tier * 12,
      timer: 0.5, maxTimer: 0.5, color,
    });
  }

  /** 遠隔着弾 (meteor/burn_zone_at): 着弾点に光柱+多重リング+放射光 */
  _flourishRemote(px, py, color, tier) {
    // 着弾点の多重リング
    for (let i = 0; i < Math.min(tier, 3); i++) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: 80 + i * 60 + tier * 10,
        timer: 0.7 + i * 0.12, maxTimer: 0.7 + i * 0.12,
        color, width: 3 + tier * 0.6,
      });
    }
    // 着弾の閃光
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 42 + tier * 10,
      timer: 0.45, maxTimer: 0.45, color,
    });
    // 8方向の放射光 (T3+)
    if (tier >= 3) {
      this.effects.push({
        type: 'radial_rays', x: px, y: py,
        rayCount: 8,
        range: 150 + tier * 20,
        timer: 0.5, maxTimer: 0.5, color,
      });
    }
  }

  /** デフォルト(未定義のskillType用) */
  _flourishDefault(px, py, color, tier) {
    const ringCount = Math.min(tier, 3);
    for (let i = 0; i < ringCount; i++) {
      this.effects.push({
        type: 'tier_ring', x: px, y: py,
        range: 90 + i * 70,
        timer: 0.65 + i * 0.1, maxTimer: 0.65 + i * 0.1,
        color, width: 3 + tier * 0.8,
      });
    }
    this.effects.push({
      type: 'sparkle_burst', x: px, y: py,
      range: 30 + tier * 10,
      timer: 0.4, maxTimer: 0.4, color,
    });
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
        case 'tier_ring': this._renderTierRing(ctx, camera, fx); break;
        case 'sparkle_burst': this._renderSparkleBurst(ctx, camera, fx); break;
        case 'light_column': this._renderLightColumn(ctx, camera, fx); break;
        case 'radial_rays': this._renderRadialRays(ctx, camera, fx); break;
        case 'magic_circle': this._renderMagicCircle(ctx, camera, fx); break;
        case 'slash_trail': this._renderSlashTrail(ctx, camera, fx); break;
        case 'polygon_barrier': this._renderPolygonBarrier(ctx, camera, fx); break;
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

  /** Tier別リング: 広がる二重光のリング (加算合成で光る) */
  _renderTierRing(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const r = fx.range * progress;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 外側光のリング
    ctx.globalAlpha = (1 - progress) * 0.85;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = fx.width || 3;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    // 内側白コアライン
    ctx.globalAlpha = (1 - progress) * 0.65;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, (fx.width || 3) * 0.4);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 中心のきらめき爆発 */
  _renderSparkleBurst(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const size = fx.range * (0.4 + progress * 1.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.95;
    // 十字の光
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - size, sy); ctx.lineTo(sx + size, sy);
    ctx.moveTo(sx, sy - size); ctx.lineTo(sx, sy + size);
    ctx.stroke();
    // 斜めの光（45度）
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    const d = size * 0.7;
    ctx.beginPath();
    ctx.moveTo(sx - d, sy - d); ctx.lineTo(sx + d, sy + d);
    ctx.moveTo(sx - d, sy + d); ctx.lineTo(sx + d, sy - d);
    ctx.stroke();
    // 中心の白い点
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2, 6 * (1 - progress)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 光の柱: 上空から降る縦長の光 */
  _renderLightColumn(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const h = 400;
    const w = 36 * (1 + progress * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.75;
    // 光柱グラデーション (上透明→下フル)
    const grad = ctx.createLinearGradient(sx, sy - h, sx, sy + 10);
    grad.addColorStop(0, this._hexA(fx.color, 0));
    grad.addColorStop(0.5, this._hexA(fx.color, 0.7));
    grad.addColorStop(1, this._hexA('#fff', 0.9));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx - w, sy - h);
    ctx.lineTo(sx + w, sy - h);
    ctx.lineTo(sx + w * 0.4, sy + 6);
    ctx.lineTo(sx - w * 0.4, sy + 6);
    ctx.closePath();
    ctx.fill();
    // 中央のコア光線
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.globalAlpha = (1 - progress) * 0.95;
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
  }

  /** 放射光線: 中心から外側に広がる光の線 */
  _renderRadialRays(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const reach = fx.range * (0.3 + progress * 0.7);
    const count = fx.rayCount || 8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.9;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 3;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 / count) * i + progress * 0.3;
      const x1 = sx + Math.cos(a) * 12;
      const y1 = sy + Math.sin(a) * 12;
      const x2 = sx + Math.cos(a) * reach;
      const y2 = sy + Math.sin(a) * reach;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 魔法陣: 回転する六芒星+外周輪 */
  _renderMagicCircle(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const r = fx.range * (0.5 + progress * 0.5);
    const rot = progress * Math.PI * 1.5;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.9;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2.5;

    // 外周2重リング
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.stroke();

    // 六芒星 (2つの三角形を重ねる)
    ctx.save();
    ctx.rotate(rot);
    const hexR = r * 0.82;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (Math.PI * 2 / 3) * k - Math.PI / 2;
      const x = Math.cos(a) * hexR;
      const y = Math.sin(a) * hexR;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.rotate(Math.PI);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (Math.PI * 2 / 3) * k - Math.PI / 2;
      const x = Math.cos(a) * hexR;
      const y = Math.sin(a) * hexR;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 外周のルーン点（8つ）
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i - rot * 0.5;
      const x = Math.cos(a) * r * 0.94;
      const y = Math.sin(a) * r * 0.94;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** スラッシュ跡: 中心を通る斜めの光の斬撃軌跡 */
  _renderSlashTrail(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const reach = fx.range * (0.6 + progress * 0.4);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(fx.angle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.95;
    // 外側の色付きスラッシュ
    const grad = ctx.createLinearGradient(-reach, 0, reach, 0);
    grad.addColorStop(0, this._hexA(fx.color, 0));
    grad.addColorStop(0.5, this._hexA(fx.color, 0.9));
    grad.addColorStop(1, this._hexA(fx.color, 0));
    ctx.fillStyle = grad;
    const w = 8 + (1 - progress) * 6;
    ctx.fillRect(-reach, -w / 2, reach * 2, w);
    // 内側の白いコア
    ctx.fillStyle = this._hexA('#fff', (1 - progress) * 0.9);
    ctx.fillRect(-reach, -w / 5, reach * 2, w / 2.5);
    ctx.restore();
  }

  /** 多角形バリア: 正N角形の結界 */
  _renderPolygonBarrier(ctx, camera, fx) {
    const sx = camera.worldToScreenX(fx.x);
    const sy = camera.worldToScreenY(fx.y);
    const progress = 1 - fx.timer / fx.maxTimer;
    const r = fx.range * (0.5 + progress * 0.5);
    const sides = fx.sides || 6;
    const rot = progress * Math.PI * 0.4;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - progress) * 0.85;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 3;

    // 多角形本体
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 頂点にエネルギーノード
    ctx.fillStyle = '#fff';
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 内側の薄いフィル
    ctx.globalAlpha = (1 - progress) * 0.2;
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const x = Math.cos(a) * r * 0.95;
      const y = Math.sin(a) * r * 0.95;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.fill();
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

  /**
   * 属性による状態異常付与を試みる
   * @param {Enemy} enemy - 対象
   * @param {number} hitDamage - そのヒットで敵に与えた実ダメージ（DoT計算の基準）
   * @param {boolean} guaranteed - trueならproc判定スキップ（スキル使用時）
   */
  _tryApplyStatus(enemy, hitDamage = 0, guaranteed = false) {
    if (!this.element || !enemy.active) return;

    // プレイヤー特性による属性ボーナス (発動率 / 効果量)
    const procBonus = this.player?.passives?.elementProcBonus || 0;
    const powerMult = 1 + (this.player?.passives?.elementPowerBonus || 0);

    // 風属性: 敵の既存状態異常を周囲に拡散
    if (this.element === 'wind') {
      this._tryWindSpread(enemy, procBonus, powerMult);
      return;
    }

    const cfg = STATUS_EFFECT_CONFIG[this.element];
    if (!cfg) return;
    const procChance = Math.min(1, cfg.procChance + procBonus);
    if (!guaranteed && Math.random() >= procChance) return;

    const params = { duration: cfg.duration * powerMult };
    if (cfg.type === 'burn' || cfg.type === 'poison') {
      // 実ヒットダメージの割合を DoT dps とする。
      // refresh-if-stronger で弱い DoT は強い DoT に上書きされる。
      params.dps = Math.max(0, hitDamage) * cfg.dpsRatio * powerMult;
    }
    if (cfg.type === 'freeze') {
      params.speedMod = cfg.speedMod * powerMult;
    }
    enemy.applyStatusEffect(cfg.type, params);
  }

  /** 風属性: 敵が状態異常を持っていれば周囲に半減拡散 */
  _tryWindSpread(enemy, procBonus = 0, powerMult = 1) {
    const effects = [];
    // 拡散強度 (基礎40%) に属性効果量ボーナスを乗算
    const spread = 0.4 * powerMult;
    if (enemy._burnTimer > 0) {
      effects.push({ type: 'burn', params: { duration: enemy._burnTimer * spread, dps: enemy._burnDps * spread } });
    }
    if (enemy._poisonTimer > 0) {
      effects.push({ type: 'poison', params: { duration: enemy._poisonTimer * spread, dps: enemy._poisonDps * spread } });
    }
    if (enemy._freezeTimer > 0) {
      effects.push({ type: 'freeze', params: { duration: enemy._freezeTimer * spread, speedMod: -20 * powerMult } });
    }
    if (enemy._shockTimer > 0) {
      effects.push({ type: 'shock', params: { duration: 0.2 * powerMult } });
    }
    if (effects.length > 0) {
      // 拡散半径も属性発動率ボーナスに応じて微増
      const radius = 80 * (1 + procBonus);
      eventBus.emit('statusEffect:windSpread', {
        x: enemy.x, y: enemy.y, radius, source: enemy, effects,
      });
    }
  }
}
