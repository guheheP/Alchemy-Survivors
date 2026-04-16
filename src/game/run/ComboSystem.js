/**
 * ComboSystem — 属性コンボ効果の実行
 *
 * 敵の applyStatusEffect → _checkCombo から emit される 'combo:triggered' を受信し、
 * elementCombos.js のコンボ定義に従って効果を適用する。
 *
 * 効果種別:
 * - aoe_damage: 発動敵を中心とした範囲ダメージ
 * - chain: 発動敵から近くの敵へ連鎖ダメージ
 * - slow_field: 周囲の敵を凍結 (スロー)
 *
 * 発動時は `combo:fired` を emit し、UI/Achievement が利用する。
 */

import { eventBus } from '../core/EventBus.js';
import { ElementCombos } from '../data/elementCombos.js';

export class ComboSystem {
  /**
   * @param {object} ctx - { getAllEnemies: ()=>Enemy[], getPlayer: ()=>PlayerController }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._unsub = eventBus.on('combo:triggered', (data) => this._handle(data));
  }

  destroy() {
    if (this._unsub) this._unsub();
  }

  _handle({ enemy, comboKey, hitParams }) {
    const combo = ElementCombos[comboKey];
    if (!combo || !enemy || !enemy.active) return;
    if (enemy._comboCdTimer > 0) return;

    // 効果適用
    const player = this.ctx.getPlayer?.();
    const powerMult = 1 + (player?.passives?.elementPowerBonus || 0);
    this._applyEffect(combo, enemy, powerMult);

    // 状態異常消費
    if (combo.consume && combo.consume.length > 0) {
      this._consumeStatus(enemy, combo.consume);
    }

    // クールダウンセット
    enemy._comboCdTimer = combo.cooldown || 1.5;

    // 演出
    this._emitFx(combo, enemy);

    // UI 通知
    eventBus.emit('combo:fired', {
      combo,
      x: enemy.x,
      y: enemy.y,
    });
  }

  _applyEffect(combo, sourceEnemy, powerMult) {
    const eff = combo.effect;
    if (!eff) return;
    const allEnemies = this.ctx.getAllEnemies?.() || [];
    const baseDamage = this._resolveDamageBase(eff, sourceEnemy);
    const dmg = baseDamage * (eff.damageMult || 1) * powerMult;

    switch (eff.kind) {
      case 'aoe_damage': {
        const r2 = (eff.radius || 80) * (eff.radius || 80);
        for (const target of allEnemies) {
          if (!target.active) continue;
          const dx = target.x - sourceEnemy.x;
          const dy = target.y - sourceEnemy.y;
          if (dx * dx + dy * dy > r2) continue;
          if (dmg > 0) {
            if (target.takeDamage(dmg)) {
              eventBus.emit('enemy:killed', { enemy: target, x: target.x, y: target.y, isBoss: target.isBoss, color: target.color });
            }
          }
          if (eff.appliesStatus) this._applyStatusToTarget(target, eff.appliesStatus, sourceEnemy, powerMult);
        }
        break;
      }
      case 'chain': {
        // 近い敵 chainCount 体まで順に連鎖
        const r2 = (eff.radius || 160) * (eff.radius || 160);
        const hit = new Set([sourceEnemy]);
        let current = sourceEnemy;
        const maxChain = eff.chainCount || 3;
        for (let i = 0; i < maxChain; i++) {
          let next = null;
          let nd = Infinity;
          for (const t of allEnemies) {
            if (!t.active || hit.has(t)) continue;
            const dx = t.x - current.x;
            const dy = t.y - current.y;
            const d = dx * dx + dy * dy;
            if (d < r2 && d < nd) { nd = d; next = t; }
          }
          if (!next) break;
          hit.add(next);
          if (dmg > 0) {
            if (next.takeDamage(dmg)) {
              eventBus.emit('enemy:killed', { enemy: next, x: next.x, y: next.y, isBoss: next.isBoss, color: next.color });
            }
          }
          if (eff.appliesStatus) this._applyStatusToTarget(next, eff.appliesStatus, sourceEnemy, powerMult);
          // 連鎖の雷ビジュアル
          eventBus.emit('particles:burst', {
            x: (current.x + next.x) / 2, y: (current.y + next.y) / 2,
            count: 6, config: { speed: 140, life: 0.3, size: 2, color: combo.color, shape: 'spark' },
          });
          current = next;
        }
        break;
      }
      case 'slow_field': {
        const r2 = (eff.radius || 100) * (eff.radius || 100);
        for (const target of allEnemies) {
          if (!target.active) continue;
          const dx = target.x - sourceEnemy.x;
          const dy = target.y - sourceEnemy.y;
          if (dx * dx + dy * dy > r2) continue;
          if (eff.appliesStatus) this._applyStatusToTarget(target, eff.appliesStatus, sourceEnemy, powerMult);
        }
        break;
      }
      case 'debuff':
      default:
        if (eff.appliesStatus) this._applyStatusToTarget(sourceEnemy, eff.appliesStatus, sourceEnemy, powerMult);
        break;
    }
  }

  /** ダメージ計算基準値を解決 */
  _resolveDamageBase(eff, enemy) {
    switch (eff.damageBase) {
      case 'hitDamage':
        // enemy.maxHp に対して妥当な相対値 (1%) をフォールバックに
        return Math.max(10, (enemy.maxHp || 100) * 0.10);
      case 'burnDps':
        return (enemy._burnDps || 0) * 3; // 3秒分相当
      case 'poisonDps':
        return (enemy._poisonDps || 0) * 3;
      case 'fixed':
        return eff.damageValue || 20;
      default:
        return 0;
    }
  }

  /** 指定タイプの状態異常を消費 (タイマーを0に) */
  _consumeStatus(enemy, types) {
    for (const t of types) {
      switch (t) {
        case 'burn':
          enemy._burnTimer = 0; enemy._burnDps = 0; enemy._burnAccum = 0; break;
        case 'poison':
          enemy._poisonTimer = 0; enemy._poisonDps = 0; enemy._poisonAccum = 0; break;
        case 'freeze':
          enemy._freezeTimer = 0; break;
        case 'shock':
          enemy._shockTimer = 0; break;
        case 'vulnerable':
          enemy._vulnerableTimer = 0; enemy._vulnerableMult = 0; break;
      }
    }
  }

  /** applyStatus 適用時は _checkCombo が再帰しないようクールダウンを利用 */
  _applyStatusToTarget(target, statusDef, sourceEnemy, powerMult) {
    if (!target.applyStatusEffect) return;
    const params = { ...statusDef.params };
    // duration を powerMult 倍 (既存と同じ挙動)
    if (params.duration) params.duration = params.duration * powerMult;
    // dpsMult が指定されていれば source の既存DPSから算出
    if (statusDef.type === 'poison' && statusDef.params?.dpsMult) {
      params.dps = (sourceEnemy._poisonDps || 10) * statusDef.params.dpsMult * powerMult;
      delete params.dpsMult;
    }
    if (statusDef.type === 'burn' && statusDef.params?.dpsMult) {
      params.dps = (sourceEnemy._burnDps || 10) * statusDef.params.dpsMult * powerMult;
      delete params.dpsMult;
    }
    target.applyStatusEffect(statusDef.type, params);
  }

  _emitFx(combo, enemy) {
    const fx = combo.fx || {};
    if (fx.shockwave) {
      eventBus.emit('fx:shockwave', {
        x: enemy.x, y: enemy.y, color: combo.color || '#fff',
        maxRadius: combo.effect?.radius || 100, duration: 0.45,
      });
    }
    if (fx.burst) {
      eventBus.emit('particles:burst', {
        x: enemy.x, y: enemy.y, count: fx.burst,
        config: { speed: 160, life: 0.5, size: 3, color: combo.color || '#ff8', shape: 'square', gravity: 40 },
      });
    }
    if (fx.shake) {
      eventBus.emit('camera:shake', { power: fx.shake, duration: 0.2 });
    }
    if (fx.flash) {
      eventBus.emit('ui:flash', { duration: 0.1, color: this._toRgba(combo.color, 0.25) });
    }
  }

  _toRgba(hex, alpha) {
    const h = (hex || '#fff').replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
