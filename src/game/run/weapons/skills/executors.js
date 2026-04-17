/**
 * SKILL_EXECUTORS — 武器スキルの実装レジストリ
 *
 * WeaponStrategy.executeSkill() から dispatch される。元々は WeaponStrategy.js の
 * 巨大な switch (約700行) に同居していた25種のスキル処理をここへ切り出したもの。
 * 挙動は完全に互換。
 *
 * 各エクゼキュータのシグネチャ:
 *   fn(strategy, ctx) -> { flourishX, flourishY } | void
 *     strategy: WeaponStrategy インスタンス (effects/_emitBurst/_shake/_flash/_emitKill/player/range 参照)
 *     ctx: { enemies, px, py, angle, dmg, color, p, flourishX, flourishY }
 *     遠隔スキル (meteor/burn_zone_at) のみ flourishX/Y を返して発動位置を上書きする。
 */

import { eventBus } from '../../../core/EventBus.js';

export const SKILL_EXECUTORS = {
  shockwave(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 150;
    const knockback = p.knockback || 0;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 2))) strategy._emitKill(enemy);
        else if (knockback > 0) {
          const d = Math.sqrt(distSq);
          if (d > 0.1) enemy.tryKnockback?.(dx, dy, d, knockback);
        }
      }
    }
    const waves = p.waves || 1;
    for (let i = 0; i < waves; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.25, maxTimer: 0.25, color: '#fff' });
    strategy._emitBurst(px, py, 20, { speed: 180, life: 0.5, size: 3, color, shape: 'square' });
    strategy._shake(6 + waves * 2, 0.25 + waves * 0.05);
    strategy._flash(color, 0.2);
  },

  multi_thrust(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
    const lineCount = p.lineCount || 3;
    const lineRange = p.lineRange || 200;
    const width = p.width || 25;
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
          if (enemy.takeDamage(dmg * (p.dmgMult || 2))) strategy._emitKill(enemy);
        }
      }
      strategy.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.35, maxTimer: 0.35, color });
      strategy._emitBurst(px + cos * lineRange, py + sin * lineRange, 6, { speed: 120, life: 0.3, size: 2, color, shape: 'spark' });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 28, timer: 0.2, maxTimer: 0.2, color: '#fff' });
    strategy._shake(5, 0.2);
  },

  multi_thrust_burn(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
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
          if (enemy.takeDamage(dmg * (p.dmgMult || 2.5))) strategy._emitKill(enemy);
        }
      }
      strategy.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.4, maxTimer: 0.4, color });
      const burnSegments = 4;
      for (let s = 1; s <= burnSegments; s++) {
        const bx = px + cos * (lineRange * s / burnSegments);
        const by = py + sin * (lineRange * s / burnSegments);
        strategy.effects.push({ type: 'fill', x: bx, y: by, range: width + 10, timer: 0.8 + s * 0.1, maxTimer: 0.8 + s * 0.1, color: '#f83' });
        strategy._emitBurst(bx, by, 4, { speed: 40, life: 0.6, size: 2, color: '#f64', shape: 'circle', gravity: -30 });
      }
    }
    strategy._shake(7, 0.3);
    strategy._flash(color, 0.2);
  },

  multi_thrust_poison(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
    const lineCount = p.lineCount || 3;
    const lineRange = p.lineRange || 200;
    const width = p.width || 25;
    const poisonDps = (p.poisonDps || 3) * dmg * 0.04;
    const poisonDuration = p.poisonDuration || 4;
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
          if (enemy.takeDamage(dmg * (p.dmgMult || 2))) strategy._emitKill(enemy);
          else {
            enemy.applyStatusEffect?.('poison', { duration: poisonDuration, dps: poisonDps });
          }
        }
      }
      strategy.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.4, maxTimer: 0.4, color });
      const segments = 4;
      for (let s = 1; s <= segments; s++) {
        const bx = px + cos * (lineRange * s / segments);
        const by = py + sin * (lineRange * s / segments);
        strategy.effects.push({ type: 'fill', x: bx, y: by, range: width + 12, timer: 0.9 + s * 0.1, maxTimer: 0.9 + s * 0.1, color: '#6a4' });
        strategy._emitBurst(bx, by, 4, { speed: 35, life: 0.8, size: 2, color: '#8c5', shape: 'circle', gravity: -20 });
      }
    }
    strategy._shake(5, 0.25);
    strategy._flash(color, 0.2);
  },

  multi_chain(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
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
            if (enemy.takeDamage(dmg * (p.dmgMult || 2))) strategy._emitKill(enemy);
          }
          tipHit = enemy;
        }
      }
      strategy.effects.push({ type: 'thrust', x: px, y: py, angle: spreadAngle, range: lineRange, width, timer: 0.3, maxTimer: 0.3, color });
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
        strategy.effects.push({ type: 'line', x: current.x, y: current.y, angle: Math.atan2(next.y - current.y, next.x - current.x), range: Math.sqrt(nd), timer: 0.18 + b * 0.04, maxTimer: 0.18 + b * 0.04, color: '#ff8' });
        allHit.add(next);
        if (next.takeDamage(dmg * (p.dmgMult || 2) * 0.7)) strategy._emitKill(next);
        current = next;
      }
    }
    strategy._emitBurst(px, py, 15, { speed: 140, life: 0.3, size: 2, color: '#ff8', shape: 'spark' });
    strategy._shake(8, 0.3);
    strategy._flash(color, 0.25);
  },

  arrow_rain(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const count = p.arrowCount || 16;
    const radius = strategy.range * 2;
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
      if (target.takeDamage(dmg * 1.5)) strategy._emitKill(target);
      const sx = target.x + (Math.random() - 0.5) * 40;
      const sy = target.y - 200;
      strategy.effects.push({ type: 'arrow_drop', x: sx, y: sy, tx: target.x, ty: target.y, timer: 0.35 + Math.random() * 0.15, maxTimer: 0.5, color });
      strategy._emitBurst(target.x, target.y, 5, { speed: 80, life: 0.25, size: 2, color, shape: 'spark' });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 50, timer: 0.25, maxTimer: 0.25, color });
    strategy.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.5, maxTimer: 0.5, color });
    strategy._shake(4, 0.3);
  },

  arrow_fan(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
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
          if (enemy.takeDamage(dmg * (p.dmgMult || 1.8))) strategy._emitKill(enemy);
        }
      }
      strategy.effects.push({ type: 'arrow_line', x: px, y: py, angle: spreadAngle, range: shotRange, timer: 0.3, maxTimer: 0.3, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 30, timer: 0.18, maxTimer: 0.18, color: '#fff' });
    strategy._shake(3, 0.15);
  },

  meteor(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
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
        if (enemy.takeDamage(dmg * (p.dmgMult || 3))) strategy._emitKill(enemy);
      }
    }
    strategy.effects.push({ type: 'meteor_fall', x: bestX, y: bestY, timer: 0.35, maxTimer: 0.35, color });
    strategy.effects.push({ type: 'fill', x: bestX, y: bestY, range: radius, timer: 0.6, maxTimer: 0.6, color });
    strategy.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius, timer: 0.7, maxTimer: 0.7, color: '#fff' });
    strategy.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius * 1.2, timer: 0.9, maxTimer: 0.9, color });
    strategy._emitBurst(bestX, bestY, 24, { speed: 220, life: 0.6, size: 3, color, shape: 'square', gravity: 60 });
    strategy._shake(10, 0.4);
    strategy._flash(color, 0.25);
    return { flourishX: bestX, flourishY: bestY };
  },

  world_break(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (enemy.takeDamage(dmg * (p.dmgMult || 6))) strategy._emitKill(enemy);
      strategy.effects.push({ type: 'fill', x: enemy.x, y: enemy.y, range: 24, timer: 0.4, maxTimer: 0.4, color });
      strategy._emitBurst(enemy.x, enemy.y, 4, { speed: 60, life: 0.35, size: 2, color, shape: 'triangle' });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 80, timer: 0.35, maxTimer: 0.35, color: '#fff' });
    for (let i = 0; i < 4; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: 60 + i * 80, timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
    }
    strategy._shake(15, 0.6);
    strategy._flash(color, 0.4);
  },

  flurry(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
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
        if (enemy.takeDamage(dmg * (p.dmgMult || 0.5))) strategy._emitKill(enemy);
      }
    }
    const fanCount = Math.min(hitCount * 2, 20);
    for (let i = 0; i < fanCount; i++) {
      strategy.effects.push({ type: 'fan', x: px, y: py, angle: Math.random() * Math.PI * 2, range: radius * (0.5 + Math.random() * 0.5), arc: 0.4 + Math.random() * 0.3, timer: 0.08 + i * 0.03, maxTimer: 0.08 + i * 0.03, color });
    }
    for (const enemy of hitEnemies) {
      strategy._emitBurst(enemy.x, enemy.y, 6, { speed: 100, life: 0.3, size: 2, color, shape: 'spark' });
    }
    strategy.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.4, maxTimer: 0.4, color });
    strategy._shake(6, 0.3);
  },

  barrier(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 130;
    const knockback = p.knockback || 100;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius + enemy.radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 1))) {
          strategy._emitKill(enemy);
        } else if (dist > 0.1) {
          enemy.tryKnockback?.(dx, dy, dist, knockback);
        }
      }
    }
    strategy.player.invincibleTimer = Math.max(strategy.player.invincibleTimer, p.invincDuration || 1.5);
    for (let i = 0; i < 4; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.2), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.5, timer: 0.3, maxTimer: 0.3, color: '#fff' });
    strategy.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
    strategy._emitBurst(px, py, 16, { speed: 150, life: 0.5, size: 3, color, shape: 'square' });
    strategy._shake(5, 0.25);
    strategy._flash(color, 0.2);
  },

  regen_zone(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 120;
    const duration = p.duration || 6;
    const knockback = p.knockback || 40;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius + enemy.radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 0.8))) strategy._emitKill(enemy);
        else if (dist > 0.1) enemy.tryKnockback?.(dx, dy, dist, knockback);
      }
    }
    strategy.effects.push({
      type: 'regen_zone', x: px, y: py, range: radius,
      timer: duration, maxTimer: duration, color,
      regenPerSec: p.regenPerSec || 0.03,
    });
    for (let i = 0; i < 3; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#afa' });
    strategy._emitBurst(px, py, 20, { speed: 80, life: 1.0, size: 3, color, shape: 'triangle', gravity: -40 });
    strategy._flash(color, 0.15);
  },

  barrier_heal(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 130;
    const knockback = p.knockback || 60;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius + enemy.radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 1))) strategy._emitKill(enemy);
        else if (dist > 0.1) {
          enemy.tryKnockback?.(dx, dy, dist, knockback);
        }
      }
    }
    strategy.player.invincibleTimer = Math.max(strategy.player.invincibleTimer, p.invincDuration || 1.5);
    const healAmt = p.heal || Math.floor(strategy.player.effectiveMaxHp * (p.healPct || 0.15));
    strategy.player.hp = Math.min(strategy.player.effectiveMaxHp, strategy.player.hp + healAmt);
    eventBus.emit('damageNumber:heal', { x: strategy.player.x, y: strategy.player.y, value: healAmt });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 80;
      strategy._emitBurst(px, py, 1, { speed: s, life: 0.8, size: 3, color, shape: 'triangle' });
    }
    for (let i = 0; i < 3; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#afa' });
    strategy.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
    strategy._shake(3, 0.2);
    strategy._flash(color, 0.2);
  },

  freeze_barrier(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 120;
    const knockback = p.knockback || 40;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius + enemy.radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 0.8))) strategy._emitKill(enemy);
        else if (dist > 0.1) {
          enemy.tryKnockback?.(dx, dy, dist, knockback);
        }
      }
    }
    eventBus.emit('consumable:debuff', { x: px, y: py, radius, stat: 'spd', amount: p.slowAmount || -40, duration: p.duration || 3 });
    strategy.player.invincibleTimer = Math.max(strategy.player.invincibleTimer, p.invincDuration || 1.2);
    for (let i = 0; i < 3; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.25), timer: 0.5 + i * 0.12, maxTimer: 0.5 + i * 0.12, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.6, maxTimer: 0.6, color });
    strategy.effects.push({ type: 'barrier_orbit', x: px, y: py, radius, timer: p.invincDuration || 1.2, maxTimer: p.invincDuration || 1.2, color, follow: true });
    strategy._emitBurst(px, py, 20, { speed: 160, life: 0.7, size: 3, color: '#cff', shape: 'triangle' });
    strategy._shake(4, 0.25);
    strategy._flash(color, 0.25);
  },

  barrier_shockwave(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 200;
    const knockback = p.knockback || 80;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 3))) strategy._emitKill(enemy);
        else {
          const d = Math.sqrt(distSq);
          if (d > 0.1) enemy.tryKnockback?.(dx, dy, d, knockback);
        }
      }
    }
    strategy.player.invincibleTimer = Math.max(strategy.player.invincibleTimer, p.invincDuration || 1.5);
    for (let i = 0; i < (p.waves || 3); i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.2), timer: 0.5 + i * 0.12, maxTimer: 0.5 + i * 0.12, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.4, timer: 0.3, maxTimer: 0.3, color: '#fff' });
    strategy.effects.push({ type: 'barrier_orbit', x: px, y: py, radius: radius * 0.4, timer: p.invincDuration || 1.5, maxTimer: p.invincDuration || 1.5, color, follow: true });
    strategy._emitBurst(px, py, 30, { speed: 220, life: 0.6, size: 3, color, shape: 'spark' });
    strategy._shake(12, 0.4);
    strategy._flash(color, 0.3);
  },

  burn_zone(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 100;
    const duration = p.duration || 3;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgPerSec || 2) * duration * 0.5)) strategy._emitKill(enemy);
      }
    }
    strategy.effects.push({ type: 'burn_zone', x: px, y: py, range: radius, timer: duration, maxTimer: duration, color });
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.8, maxTimer: 0.8, color });
    strategy.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 1.0, maxTimer: 1.0, color });
    strategy._emitBurst(px, py, 20, { speed: 120, life: 0.8, size: 3, color, shape: 'circle', gravity: -50 });
    strategy._shake(4, 0.2);
  },

  burn_zone_at(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
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
        if (enemy.takeDamage(dmg * (p.dmgPerSec || 3) * duration * 0.5)) strategy._emitKill(enemy);
      }
    }
    strategy.effects.push({ type: 'arrow_drop', x: bestX, y: bestY - 220, tx: bestX, ty: bestY, timer: 0.35, maxTimer: 0.35, color });
    strategy.effects.push({ type: 'burn_zone', x: bestX, y: bestY, range: radius, timer: duration, maxTimer: duration, color });
    strategy.effects.push({ type: 'fill', x: bestX, y: bestY, range: radius, timer: 0.8, maxTimer: 0.8, color });
    strategy.effects.push({ type: 'ring', x: bestX, y: bestY, range: radius * 1.3, timer: 0.8, maxTimer: 0.8, color: '#fff' });
    strategy._emitBurst(bestX, bestY, 25, { speed: 200, life: 0.7, size: 3, color, shape: 'square', gravity: -30 });
    strategy._shake(8, 0.3);
    strategy._flash(color, 0.2);
    return { flourishX: bestX, flourishY: bestY };
  },

  freeze_zone(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 140;
    const duration = p.duration || 3;
    eventBus.emit('consumable:debuff', { x: px, y: py, radius, stat: 'spd', amount: p.slowAmount || -40, duration });
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 0.5))) strategy._emitKill(enemy);
      }
    }
    strategy.effects.push({ type: 'freeze_zone', x: px, y: py, range: radius, timer: duration, maxTimer: duration, color });
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius, timer: 0.7, maxTimer: 0.7, color });
    strategy.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.9, maxTimer: 0.9, color: '#fff' });
    strategy._emitBurst(px, py, 24, { speed: 180, life: 0.6, size: 3, color: '#cff', shape: 'triangle' });
    strategy._shake(5, 0.2);
    strategy._flash(color, 0.2);
  },

  chain_lightning(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
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
    if (current) {
      const d0 = Math.sqrt(minDist);
      strategy.effects.push({ type: 'lightning', x: px, y: py, angle: Math.atan2(current.y - py, current.x - px), range: d0, timer: 0.22, maxTimer: 0.22, color });
    }
    for (let i = 0; i < bounces && current; i++) {
      hit.add(current);
      if (current.takeDamage(dmg * (p.dmgMult || 2))) strategy._emitKill(current);
      strategy._emitBurst(current.x, current.y, 6, { speed: 120, life: 0.25, size: 2, color, shape: 'spark' });
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
        strategy.effects.push({ type: 'lightning', x: cx, y: cy, angle: Math.atan2(next.y - cy, next.x - cx), range: Math.sqrt(nextDist), timer: 0.2 + i * 0.04, maxTimer: 0.2 + i * 0.04, color });
      }
      current = next;
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 40, timer: 0.2, maxTimer: 0.2, color: '#fff' });
    strategy._shake(7, 0.3);
    strategy._flash(color, 0.2);
  },

  lightning_storm(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 250;
    const rays = p.rays || 10;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 3))) strategy._emitKill(enemy);
        strategy._emitBurst(enemy.x, enemy.y, 6, { speed: 100, life: 0.3, size: 2, color, shape: 'spark' });
      }
    }
    for (let i = 0; i < rays; i++) {
      const a = (Math.PI * 2 / rays) * i;
      strategy.effects.push({ type: 'lightning', x: px, y: py, angle: a, range: radius, timer: 0.25 + (i % 3) * 0.05, maxTimer: 0.4, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 60, timer: 0.25, maxTimer: 0.25, color: '#fff' });
    for (let i = 0; i < 3; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.5 + i * 0.25), timer: 0.5 + i * 0.1, maxTimer: 0.5 + i * 0.1, color });
    }
    strategy._shake(12, 0.4);
    strategy._flash(color, 0.3);
  },

  blade_rain(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 350;
    const blades = p.blades || 40;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 5))) strategy._emitKill(enemy);
      }
    }
    for (let i = 0; i < blades; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const bx = px + Math.cos(a) * r;
      const by = py + Math.sin(a) * r;
      strategy.effects.push({ type: 'blade_drop', x: bx, y: by - 180, tx: bx, ty: by, timer: 0.3 + Math.random() * 0.4, maxTimer: 0.7, color });
    }
    for (let i = 0; i < 4; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius * (0.4 + i * 0.2), timer: 0.6 + i * 0.1, maxTimer: 0.6 + i * 0.1, color });
    }
    strategy.effects.push({ type: 'fill', x: px, y: py, range: 80, timer: 0.3, maxTimer: 0.3, color: '#fff' });
    strategy._shake(14, 0.5);
    strategy._flash(color, 0.35);
  },

  blade_storm(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const bladeCount = p.bladeCount || 4;
    const radius = p.radius || 130;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 1) * bladeCount)) strategy._emitKill(enemy);
      }
    }
    const duration = p.duration || 0.6;
    strategy.effects.push({ type: 'spin_blades', x: px, y: py, bladeCount, range: radius, timer: duration, maxTimer: duration, color, follow: true });
    for (let i = 0; i < bladeCount; i++) {
      const a = (Math.PI * 2 / bladeCount) * i;
      strategy.effects.push({ type: 'fan', x: px, y: py, angle: a, range: radius, arc: 0.5, timer: 0.3 + i * 0.05, maxTimer: 0.3 + i * 0.05, color });
    }
    strategy._emitBurst(px, py, 20, { speed: 160, life: 0.5, size: 3, color, shape: 'square' });
    strategy._shake(6, 0.3);
  },

  spin_blade(strategy, ctx) {
    const { enemies, px, py, dmg, color, p } = ctx;
    const radius = p.radius || 160;
    const spins = p.spins || 2;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy < radius * radius) {
        if (enemy.takeDamage(dmg * (p.dmgMult || 2.5))) strategy._emitKill(enemy);
      }
    }
    const duration = 0.6;
    strategy.effects.push({ type: 'spin_blades', x: px, y: py, bladeCount: 6, range: radius, timer: duration, maxTimer: duration, color, follow: true, spins });
    strategy.effects.push({ type: 'fill', x: px, y: py, range: radius * 0.6, timer: 0.3, maxTimer: 0.3, color });
    for (let i = 0; i < 2; i++) {
      strategy.effects.push({ type: 'ring', x: px, y: py, range: radius, timer: 0.4 + i * 0.1, maxTimer: 0.4 + i * 0.1, color });
    }
    strategy._emitBurst(px, py, 30, { speed: 200, life: 0.6, size: 3, color, shape: 'square', gravity: -50 });
    strategy._shake(9, 0.35);
    strategy._flash(color, 0.25);
  },

  piercing_shot(strategy, ctx) {
    const { enemies, px, py, angle, dmg, color, p } = ctx;
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
        if (enemy.takeDamage(dmg * (p.dmgMult || 5))) strategy._emitKill(enemy);
      }
    }
    strategy.effects.push({ type: 'pierce_beam', x: px, y: py, angle, range: shotRange, width, timer: 0.45, maxTimer: 0.45, color });
    strategy.effects.push({ type: 'fill', x: px + cos * shotRange, y: py + sin * shotRange, range: 50, timer: 0.3, maxTimer: 0.3, color: '#fff' });
    strategy.effects.push({ type: 'ring', x: px + cos * shotRange, y: py + sin * shotRange, range: 60, timer: 0.4, maxTimer: 0.4, color });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      strategy._emitBurst(px + cos * shotRange * t, py + sin * shotRange * t, 3, { speed: 60, life: 0.3, size: 2, color, shape: 'spark' });
    }
    strategy._shake(10, 0.35);
    strategy._flash(color, 0.25);
  },
};
