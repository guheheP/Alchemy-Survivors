/**
 * HeadlessSim — Layer 3 ヘッドレスフルランシム (実コード準拠)
 *
 * 実装:
 *   - PlayerController.takeDamage の式 (def/3 軽減 + 25%最低 + invincible 0.5s)
 *   - EnemySpawner の rate カーブ (spawnRateStart→spawnRateEnd)
 *   - Player regen を考慮
 *   - dodge による完全回避
 *   - ボス HP は実定義値、DPS の 70% をボスに集中
 *   - 全敵にdamageを分散させる動的 enemyHp モデル
 */

import { AreaDefs } from '../../../src/game/data/areas.js';
import { GameConfig } from '../../../src/game/data/config.js';
import { buildSummary } from '../layer1/DpsCalculator.js';
import { BOSS_RUSH_ORDER } from '../../../src/game/run/BossRushManager.js';

const AREA_DIFF_TABLE = {
  0: { hp: 1.0,  dmg: 1.00 },
  1: { hp: 1.25, dmg: 1.10 },
  2: { hp: 1.55, dmg: 1.25 },
  3: { hp: 1.90, dmg: 1.40 },
  4: { hp: 2.30, dmg: 1.55 },
};

const INVINCIBILITY = GameConfig.run.invincibilityDuration; // 0.5s
const BASE_ENEMY_DAMAGE = 6;
const BASE_ENEMY_HP = 30;

/**
 * 1ランをシミュレート (実ダメージモデル)
 */
export function simulateRun(cfg) {
  const summary = buildSummary({
    weaponSlots: cfg.weaponSlots,
    armor: cfg.armor,
    accessory: cfg.accessory,
    pet: cfg.pet,
    avgTargets: 4,
    incomingHitDamage: BASE_ENEMY_DAMAGE,
  });
  const area = AreaDefs[cfg.areaId];
  const areaDiff = area?.difficulty || 0;
  const mult = AREA_DIFF_TABLE[areaDiff] || AREA_DIFF_TABLE[0];

  const duration = cfg.duration ?? 300;
  const dt = 0.1; // 100ms tick
  let elapsed = 0;
  let hp = summary.baseHp;
  let invincibleTimer = 0;
  let killCount = 0;
  let bossDefeated = false;
  let bossActive = false;
  let totalDamageTaken = 0;
  let totalHits = 0;

  // ペット フェニックス: 1回限り復活
  let phoenixCharges = (cfg.pet?.id === 'phoenix') ? 1 : 0;

  // ボス
  const bossSpawnTime = (GameConfig.run.bossSpawnTimes && GameConfig.run.bossSpawnTimes[0]) || 300;
  let bossHp = (cfg.bossHp ?? area?.boss?.maxHp ?? 1000) * (1 + areaDiff * 0.15);

  // 敵プールのモデル: 同時生存数を時間で増やす
  // spawnRate = lerp(start, end, t) [体/秒]
  // 平均敵寿命 ≈ 1.5s (画面外寿命除外)
  // 同時生存数 ≈ spawnRate × 1.5
  while (elapsed < duration && hp > 0) {
    elapsed += dt;
    const t = Math.min(elapsed / GameConfig.run.duration, 1);
    const spawnRate = GameConfig.run.spawnRateStart + (GameConfig.run.spawnRateEnd - GameConfig.run.spawnRateStart) * t;
    const aliveEnemies = spawnRate * 1.5;

    // ── 攻撃: マルチ DPS で敵を減らす ──
    const enemyHp = BASE_ENEMY_HP * mult.hp * (1 + (elapsed / 60) * 0.6);
    const dmgThisTick = summary.totalDpsMulti * dt;
    const enemiesKilled = dmgThisTick / Math.max(1, enemyHp);
    killCount += enemiesKilled;

    // ── 被弾: 接触判定 (DPS-based クリアダイナミクスモデル) ──
    // 実ゲームでは「multiDPS が敵スポーンHP圧を上回ると接触されない」
    // surplusEnemyRate = max(0, spawn_inflow_hp - multiDps) / enemyHp
    if (invincibleTimer > 0) {
      invincibleTimer -= dt;
    } else {
      const inflowHp = spawnRate * enemyHp;            // 1秒に湧く敵総HP
      const cleared = Math.min(inflowHp, summary.totalDpsMulti);
      const surplusEnemiesPerSec = Math.max(0, (inflowHp - cleared) / enemyHp) + 0.2; // 最低 0.2/sec の不可避接触
      // 接触確率/dt = min(2 hits/sec, surplus × 0.4)
      const contactRatePerSec = Math.min(2, surplusEnemiesPerSec * 0.4);
      const contactProb = contactRatePerSec * dt;
      if (Math.random() < contactProb) {
        // dodge 判定
        const dodgeRoll = Math.random();
        if (dodgeRoll >= summary.dodge) {
          // 1ヒットダメージ
          const enemyDmg = BASE_ENEMY_DAMAGE * mult.dmg * (1 + (elapsed / 60) * 0.25);
          // 軽減式: max(ceil(amount*0.25), amount - def/3)
          const reduced = enemyDmg - summary.defense / 3;
          const minDmg = Math.max(1, Math.ceil(enemyDmg * 0.25));
          const effDmg = Math.max(minDmg, Math.round(reduced));
          hp -= effDmg;
          totalDamageTaken += effDmg;
          totalHits++;
          invincibleTimer = INVINCIBILITY;

          // フェニックス復活
          if (hp <= 0 && phoenixCharges > 0) {
            phoenixCharges--;
            hp = summary.baseHp * 0.5;
            invincibleTimer = 2.0;
          }
        }
      }
    }

    // ── 自動回復 (regen 特性) ──
    if (summary.regen > 0) {
      hp = Math.min(summary.baseHp, hp + summary.regen * dt);
    }

    // ── ボス出現 / 撃破 ──
    if (!bossActive && elapsed >= bossSpawnTime) bossActive = true;
    if (bossActive && bossHp > 0) {
      const bossDmg = summary.totalDpsSingle * dt * 0.7; // 70% 集中
      bossHp -= bossDmg;
      // ボス接触ダメ (大きい) — bossActive 中は 1 hit/2s 程度の頻度で被弾
      if (Math.random() < 0.5 * (dt / 0.1) && invincibleTimer <= 0) {
        const bossAtk = (area?.boss?.atk || 25) * (1 + areaDiff * 0.1);
        const reduced = bossAtk - summary.defense / 3;
        const minDmg = Math.max(1, Math.ceil(bossAtk * 0.25));
        const effDmg = Math.max(minDmg, Math.round(reduced));
        hp -= effDmg;
        totalDamageTaken += effDmg;
        totalHits++;
        invincibleTimer = INVINCIBILITY;
      }
      if (bossHp <= 0) {
        bossDefeated = true;
        break;
      }
    }
  }

  let result;
  if (hp <= 0) result = 'death';
  else if (bossDefeated) result = 'clear';
  else result = 'timeout';

  return {
    result,
    survived: elapsed,
    hp,
    dpsSingle: summary.totalDpsSingle,
    dpsMulti: summary.totalDpsMulti,
    killCount: Math.floor(killCount),
    bossDefeated,
    totalHits,
    avgDamageTaken: totalHits > 0 ? totalDamageTaken / totalHits : 0,
  };
}

/**
 * 多回シム → クリア率/生存統計
 */
export function simulateRunsMonteCarlo(cfg, trials = 100) {
  const stats = { clear: 0, death: 0, timeout: 0 };
  const survivals = [];
  const dpsSingles = [];
  const dpsMultis = [];
  for (let i = 0; i < trials; i++) {
    const r = simulateRun(cfg);
    stats[r.result]++;
    survivals.push(r.survived);
    dpsSingles.push(r.dpsSingle);
    dpsMultis.push(r.dpsMulti);
  }
  survivals.sort((a, b) => a - b);
  return {
    trials,
    clearRate: stats.clear / trials,
    deathRate: stats.death / trials,
    timeoutRate: stats.timeout / trials,
    survivalP50: survivals[Math.floor(trials / 2)],
    survivalP10: survivals[Math.floor(trials / 10)],
    survivalP90: survivals[Math.floor(trials * 0.9)],
    avgDps: dpsSingles.reduce((a, b) => a + b, 0) / dpsSingles.length,
    avgDpsMulti: dpsMultis.reduce((a, b) => a + b, 0) / dpsMultis.length,
  };
}

/**
 * ボスラッシュシム
 */
export function simulateBossRush(cfg, trials = 50) {
  const summary = buildSummary({
    weaponSlots: cfg.weaponSlots, armor: cfg.armor, accessory: cfg.accessory, pet: cfg.pet,
    avgTargets: 4, incomingHitDamage: BASE_ENEMY_DAMAGE,
  });
  const aggregate = { full: 0, partial: {} };
  const defeatedCounts = [];
  for (let i = 0; i < trials; i++) {
    let hpRatio = 1.0; // baseHp に対する比
    let defeated = 0;
    for (const areaId of BOSS_RUSH_ORDER) {
      const area = AreaDefs[areaId];
      if (!area?.boss) break;
      const bossHp = area.boss.maxHp * (1 + (area.difficulty || 0) * 0.15);
      // 簡易: 単独ボス戦シム
      // 想定: ボス戦中 1 hit/2s で被弾、ボスatk×ヒット数
      // ボス HP / 単体DPS = boss kill time
      const killTime = bossHp / Math.max(1, summary.totalDpsSingle);
      // この時間で被弾する hit 数: max 2/s × INVINCIBILITY = 0.5s 間隔
      // 接触確率 0.5 → 平均 1 hit/s → killTime × 1 = expected hits
      const expectedHits = killTime * 0.6;
      const bossAtk = (area.boss.atk || 25) * (1 + (area.difficulty || 0) * 0.1);
      const reduced = bossAtk - summary.defense / 3;
      const minDmg = Math.max(1, Math.ceil(bossAtk * 0.25));
      const effDmg = Math.max(minDmg, Math.round(reduced));
      const totalDmg = expectedHits * effDmg * (1 - Math.min(0.9, summary.dodge));
      const hpAtStart = summary.baseHp * hpRatio;
      const hpAtEnd = hpAtStart - totalDmg + (summary.regen * killTime);
      if (hpAtEnd <= 0) {
        // 死亡 (フェニックス 1回考慮)
        if (cfg.pet?.id === 'phoenix' && i % 2 === 0 /* approximate 1-charge effect 50% */) {
          // 復活して継続 (簡略: HP半分回復)
          hpRatio = 0.5 - (totalDmg - hpAtStart - summary.baseHp * 0.5) / summary.baseHp;
          if (hpRatio <= 0) break;
        } else {
          break;
        }
      } else {
        hpRatio = hpAtEnd / summary.baseHp;
      }
      defeated++;
      // ロビー回復 30%
      hpRatio = Math.min(1, hpRatio + 0.3);
    }
    defeatedCounts.push(defeated);
    if (defeated >= 7) aggregate.full++;
    aggregate.partial[defeated] = (aggregate.partial[defeated] || 0) + 1;
  }
  defeatedCounts.sort((a, b) => a - b);
  return {
    trials,
    fullClearRate: aggregate.full / trials,
    partialDistribution: aggregate.partial,
    avgDefeated: defeatedCounts.reduce((a, b) => a + b, 0) / defeatedCounts.length,
    medianDefeated: defeatedCounts[Math.floor(trials / 2)],
  };
}
