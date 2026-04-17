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

    // 発動位置を先にキャプチャする。
    // _applyEffect 内の AoE ダメージで source 敵自身が死ぬと、pool.release → Entity.reset()
    // で enemy.x/y が (0,0) にリセットされてしまい、以降の演出/トーストがワールド原点に出る。
    const fxX = enemy.x;
    const fxY = enemy.y;

    // 効果適用 — 発生ダメージ合計を取得してコンボ演出に渡す
    const player = this.ctx.getPlayer?.();
    const powerMult = 1 + (player?.passives?.elementPowerBonus || 0);
    const totalDamage = this._applyEffect(combo, enemy, powerMult, hitParams);

    // 状態異常消費
    if (combo.consume && combo.consume.length > 0) {
      this._consumeStatus(enemy, combo.consume);
    }

    // クールダウンセット — source が AoE で死んで pool に返却されている場合は設定しない
    // (そうでないと次に再利用される敵に stale な CD が残り、スポーン直後はコンボ不発になる)
    if (enemy.active) {
      enemy._comboCdTimer = combo.cooldown || 1.5;
    }

    // 演出 (キャプチャ済み座標を使用)
    this._emitFx(combo, fxX, fxY);

    // UI 通知（ダメージ集計は整数化してから渡す）
    eventBus.emit('combo:fired', {
      combo,
      x: fxX,
      y: fxY,
      totalDamage: Math.max(0, Math.round(totalDamage || 0)),
    });
  }

  _applyEffect(combo, sourceEnemy, powerMult, hitParams) {
    const eff = combo.effect;
    if (!eff) return 0;
    const allEnemies = this.ctx.getAllEnemies?.() || [];
    const baseDamage = this._resolveDamageBase(eff, sourceEnemy, hitParams);
    const dmg = baseDamage * (eff.damageMult || 1) * powerMult;
    let totalDealt = 0;

    switch (eff.kind) {
      case 'aoe_damage': {
        const r2 = (eff.radius || 80) * (eff.radius || 80);
        // sourceEnemy 自身も AoE で死ぬ場合があるため、起点座標を先にキャプチャ
        const srcX = sourceEnemy.x;
        const srcY = sourceEnemy.y;
        for (const target of allEnemies) {
          if (!target.active) continue;
          const dx = target.x - srcX;
          const dy = target.y - srcY;
          if (dx * dx + dy * dy > r2) continue;
          // takeDamage で死亡 → pool.release → reset で target.x/y がクリアされる前に値を控える
          const tx = target.x;
          const ty = target.y;
          if (dmg > 0) {
            // 被ダメ乗算（vulnerable 等）を合算後ダメージに反映させるため、
            // targetの _incomingDamageMult を使って実効ダメを集計
            const effectiveDmg = dmg * (typeof target._incomingDamageMult === 'function' ? target._incomingDamageMult() : 1);
            totalDealt += effectiveDmg;
            if (target.takeDamage(dmg)) {
              eventBus.emit('enemy:killed', { enemy: target, x: tx, y: ty, isBoss: target.isBoss, color: target.color });
            }
          }
          // 死亡後(active=false)は状態異常を付与しない (プール内の敵に stale タイマーが残るのを防ぐ)
          if (eff.appliesStatus && target.active) {
            this._applyStatusToTarget(target, eff.appliesStatus, sourceEnemy, powerMult);
          }
        }
        break;
      }
      case 'chain': {
        // 近い敵 chainCount 体まで順に連鎖
        const r2 = (eff.radius || 160) * (eff.radius || 160);
        const hit = new Set([sourceEnemy]);
        let current = sourceEnemy;
        // source も takeDamage で死亡→reset される可能性があるので起点座標をキャプチャ
        let currentX = sourceEnemy.x;
        let currentY = sourceEnemy.y;
        const maxChain = eff.chainCount || 3;
        for (let i = 0; i < maxChain; i++) {
          let next = null;
          let nd = Infinity;
          for (const t of allEnemies) {
            if (!t.active || hit.has(t)) continue;
            const dx = t.x - currentX;
            const dy = t.y - currentY;
            const d = dx * dx + dy * dy;
            if (d < r2 && d < nd) { nd = d; next = t; }
          }
          if (!next) break;
          hit.add(next);
          // takeDamage で死ぬと pool.release → reset で next.x/y が (0,0) になるため先に記憶
          const nextX = next.x;
          const nextY = next.y;
          if (dmg > 0) {
            const effectiveDmg = dmg * (typeof next._incomingDamageMult === 'function' ? next._incomingDamageMult() : 1);
            totalDealt += effectiveDmg;
            if (next.takeDamage(dmg)) {
              eventBus.emit('enemy:killed', { enemy: next, x: nextX, y: nextY, isBoss: next.isBoss, color: next.color });
            }
          }
          if (eff.appliesStatus && next.active) {
            this._applyStatusToTarget(next, eff.appliesStatus, sourceEnemy, powerMult);
          }
          // 連鎖の雷ビジュアル (キャプチャ済み座標で表示位置のズレを防ぐ)
          eventBus.emit('particles:burst', {
            x: (currentX + nextX) / 2, y: (currentY + nextY) / 2,
            count: 6, config: { speed: 140, life: 0.3, size: 2, color: combo.color, shape: 'spark' },
          });
          current = next;
          currentX = nextX;
          currentY = nextY;
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
    return totalDealt;
  }

  /**
   * ダメージ計算基準値を解決。
   *
   * 'hitDamage' は「プレイヤーの武器攻撃力」を指す。優先度順に解決する:
   *   1. hitParams._sourceHitDamage — 今回の status 付与で同梱された武器ダメージ
   *   2. enemy._lastHitDamage       — 少し前の武器ヒットでキャッシュされた値
   *   3. DoT DPS × 3                — 武器コンテキストが失われた経路 (DoT tick, 感染拡散)
   *   4. 固定値 15                   — 安全フロア
   *
   * これにより、旧実装が参照していた `enemy.maxHp * 10%` (ボスで過剰スケール) を回避しつつ、
   * 武器強化・特性による攻撃力向上がコンボ威力にも反映される。
   */
  _resolveDamageBase(eff, enemy, hitParams) {
    switch (eff.damageBase) {
      case 'hitDamage': {
        const fromParams = hitParams && typeof hitParams._sourceHitDamage === 'number'
          ? hitParams._sourceHitDamage : 0;
        if (fromParams > 0) return fromParams;
        if (enemy && enemy._lastHitDamage > 0) return enemy._lastHitDamage;
        const dot = Math.max(enemy?._burnDps || 0, enemy?._poisonDps || 0);
        if (dot > 0) return dot * 3;
        return 15;
      }
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

  _emitFx(combo, x, y) {
    const fx = combo.fx || {};
    if (fx.shockwave) {
      eventBus.emit('fx:shockwave', {
        x, y, color: combo.color || '#fff',
        maxRadius: combo.effect?.radius || 100, duration: 0.45,
      });
    }
    if (fx.burst) {
      eventBus.emit('particles:burst', {
        x, y, count: fx.burst,
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
