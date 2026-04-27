/**
 * DpsCalculator — Layer 1 純数値モデル (実コードから抽出した正確な式)
 *
 * 各武器の DPS 計算は実装を逆算した式に統一:
 *   - SwordStrategy:  attack() 毎 cooldown、奇数swing は arc 弧、偶数swing は 360° で damage*0.8
 *   - BowStrategy:    1 projectile per attack、damage 全乗、extraProjectile +1 で複数発
 *   - SpearStrategy:  attack() 毎 cooldown、線形貫通 damage 全乗
 *   - ShieldStrategy: attack() 毎 cooldown、半径内全敵 damage、retaliate 0.3*damage 平均
 *   - StaffStrategy:  3 orbs + extraProjectile が cooldown 毎にスポーン (life 3s)
 *                     各 orb は 0.25s tick で damage * 0.2
 *   - DaggerStrategy: 3 blades 永続周回、各 0.15s tick で damage * 0.22
 *
 * 出力: 単一ターゲットDPS / マルチターゲットDPS (敵密度 N想定)
 */

import { ItemBlueprints, TraitDefs } from '../../../src/game/data/items.js';
import { GameConfig } from '../../../src/game/data/config.js';
import { PetDefs, getPetBehaviorParams, getPetLevelStats } from '../../../src/game/data/pets.js';

const wc = GameConfig.weapon;

/**
 * 武器の基礎ダメージ計算 (WeaponStrategy.constructor の式そのまま)
 */
function calcBaseDamage(weapon) {
  const bp = ItemBlueprints[weapon.blueprintId];
  if (!bp) return 0;
  const dmgMult = bp.baseDamageMultiplier || 1.0;
  return ((bp.baseValue / wc.damageBaseDivisor) + (weapon.quality / wc.damageQualityDivisor)) * dmgMult;
}

/**
 * 攻撃速度倍率 (品質依存)
 */
function calcAttackSpeed(weapon) {
  return wc.speedBase + (weapon.quality / wc.speedQualityDivisor);
}

/**
 * 実効クールダウン (WeaponStrategy.cooldown getter)
 * cooldownReduction はパッシブ累積、ここでは 0 想定
 */
function calcCooldown(weapon, cooldownReduction = 0) {
  const bp = ItemBlueprints[weapon.blueprintId];
  if (!bp) return 1;
  const wt = GameConfig.weaponTypes[bp.equipType] || GameConfig.weaponTypes.sword;
  const atkSpeed = calcAttackSpeed(weapon);
  return Math.max(0.1, wt.baseCooldown / atkSpeed * (1 - cooldownReduction));
}

/**
 * 武器1個の DPS を実装ベースで計算する
 * @param {object} weapon - { blueprintId, quality, traits }
 * @param {{ avgTargets?: number, traitBag?: object, playerBaseDamage?: number }} opts
 *   avgTargets: 同時にエフェクトに巻き込まれる平均敵数 (1=単体, 3-5=ウェーブ)
 * @returns {{ singleTarget:number, multiTarget:number, perAttack:number, cooldown:number }}
 */
export function weaponDps(weapon, opts = {}) {
  if (!weapon) return zero();
  const bp = ItemBlueprints[weapon.blueprintId];
  if (!bp || bp.type !== 'equipment') return zero();
  const wt = GameConfig.weaponTypes[bp.equipType] || GameConfig.weaponTypes.sword;
  const avgTargets = opts.avgTargets ?? 3;
  const traitBag = opts.traitBag || null;
  const playerBaseDamage = opts.playerBaseDamage ?? 0;

  // damage getter 相当 (元素ボーナス + 特性 + クリ平均)
  const baseDmg = calcBaseDamage(weapon);
  const traitDmgFlat = traitBag?.runDamageFlat || 0;
  let dmg = baseDmg + traitDmgFlat + playerBaseDamage;
  if (bp.element === 'none') dmg *= 1.25;
  // クリ平均
  const baseCrit = bp.baseCritChance || 0;
  const traitCrit = traitBag?.runCritChance || 0;
  const totalCrit = Math.min(1, baseCrit + traitCrit);
  const critDmg = 1 + (traitBag?.runCritDamage || 0); // = 2.0 デフォルト
  const expectedDmg = dmg * (1 + totalCrit * (critDmg));
  // ↑ ゲーム実装は「クリ時のみ ×(1+critDamage)」なので加算寄与は totalCrit × critDamage
  // 平均化: dmg + crit_chance × dmg × critDamage = dmg × (1 + crit × (1+critDmg-1)) = dmg × (1 + crit × critDmg)
  // 既存ゲームでは critDamage=0.5 を意味 +50% で計算は dmg × (1 + crit × 0.5) — そのまま簡略

  const cd = calcCooldown(weapon);
  const atkSpeed = calcAttackSpeed(weapon);

  let perAttack = 0;
  let singleTarget = 0;
  let multiTarget = 0;

  switch (bp.equipType) {
    case 'sword': {
      // 奇数: arc 弧 (damage 100%) / 偶数: 360° (damage 80%, range 1.3x)
      // 平均: 1 swing あたり damage × 0.9 として
      const avgDmgPerSwing = expectedDmg * 0.9;
      perAttack = avgDmgPerSwing;
      // 単体: 1 hit / cooldown
      singleTarget = avgDmgPerSwing / cd;
      // 複数: 360° swing で範囲広い、 平均 avgTargets 体ヒット
      multiTarget = avgDmgPerSwing * Math.min(avgTargets, 6) / cd;
      break;
    }
    case 'spear': {
      // 直線貫通: 単体 damage、貫通で複数ヒット
      perAttack = expectedDmg;
      singleTarget = expectedDmg / cd;
      // 直線上に並ぶ敵は限られる — 平均 min(avgTargets, 3)
      multiTarget = expectedDmg * Math.min(avgTargets, 3) / cd;
      break;
    }
    case 'bow': {
      // multiShot 数の矢、それぞれ 1 体ヒット
      const ms = bp.multiShot || 1;
      perAttack = expectedDmg * ms;
      singleTarget = expectedDmg / cd; // 単体には 1 矢が刺さる前提
      // multiShot 数の敵にそれぞれ 1 矢
      multiTarget = expectedDmg * Math.min(ms, avgTargets) / cd;
      break;
    }
    case 'shield': {
      // 半径内全敵
      perAttack = expectedDmg;
      singleTarget = expectedDmg / cd;
      // パルス AoE: 周囲全方位 → avgTargets 体
      multiTarget = expectedDmg * Math.min(avgTargets, 5) / cd;
      break;
    }
    case 'staff': {
      // 3 orbs + extraProjectile、各 orb life 3s、tick 0.25s で damage × 0.2
      // cooldown 毎にスポーン: orb が常時アクティブなら uptime=1 (cd ≤ 3s)
      const orbCount = 3;
      const orbLife = 3.0;
      const tickInterval = 0.25;
      const tickDmg = expectedDmg * 0.2;
      const uptime = Math.min(1, orbLife / cd);
      const ticksPerSecPerOrb = 1 / tickInterval;
      // 単体: 1 orb が ~単体に集中するわけではない、軌道上で当たれば
      const orbsHittingSingle = Math.min(orbCount, 1.5); // 周回するため平均1.5体に同時hit
      singleTarget = tickDmg * ticksPerSecPerOrb * orbsHittingSingle * uptime;
      multiTarget = tickDmg * ticksPerSecPerOrb * orbCount * uptime * Math.min(avgTargets, 3);
      perAttack = expectedDmg;
      break;
    }
    case 'dagger': {
      // 3 blades 永続周回、各 0.15s tick で damage × 0.22
      const bladeCount = 3;
      const tickInterval = 0.15;
      const tickDmg = expectedDmg * 0.22;
      const ticksPerSec = 1 / tickInterval;
      // 単体: 全 blade が 1 体に集中することは稀 → 平均 1.2 blade hit
      singleTarget = tickDmg * ticksPerSec * 1.2;
      multiTarget = tickDmg * ticksPerSec * bladeCount * Math.min(avgTargets, 3);
      perAttack = tickDmg;
      break;
    }
    default:
      break;
  }

  return { singleTarget, multiTarget, perAttack, cooldown: cd, atkSpeed };
}

function zero() {
  return { singleTarget: 0, multiTarget: 0, perAttack: 0, cooldown: 0, atkSpeed: 0 };
}

/** 武器スロット全体の DPS 合計 */
export function weaponSlotsDps(weaponSlots, opts = {}) {
  let st = 0, mt = 0;
  for (const w of weaponSlots) {
    if (!w) continue;
    const r = weaponDps(w, opts);
    st += r.singleTarget;
    mt += r.multiTarget;
  }
  return { singleTarget: st, multiTarget: mt };
}

/** 装備全体から特性の run* 累積 */
export function accumulateTraits(weaponSlots, armor, accessory) {
  const bag = {
    runDamageFlat: 0, runDamageReduction: 0, runMaxHpFlat: 0,
    runMoveSpeed: 0, runRegenPerSec: 0, runDodge: 0,
    runDropRate: 0, runAttackSpeed: 0, runExpBonus: 0,
    runCritChance: 0, runCritDamage: 0,
    runElementProc: 0, runElementPower: 0,
  };
  const accumulate = (item) => {
    if (!item?.traits) return;
    for (const t of item.traits) {
      const td = TraitDefs[t];
      if (!td?.effects) continue;
      for (const [k, v] of Object.entries(td.effects)) {
        if (k in bag) bag[k] += v;
      }
    }
  };
  for (const w of (weaponSlots || [])) accumulate(w);
  accumulate(armor);
  accumulate(accessory);
  return bag;
}

/** 防御 + HP 補正 (PlayerController に準拠) */
export function calcDefense(armor, accessory, weaponSlots = [], traitBag = null) {
  let def = 0, hpFlat = 0, speedMult = 0, dodge = 0, regen = 0;
  if (armor) {
    const bp = ItemBlueprints[armor.blueprintId];
    if (bp) {
      def += bp.baseValue / 12 + armor.quality / 8;
      hpFlat += armor.quality * 0.5;
    }
  }
  for (const w of (weaponSlots || [])) {
    if (!w) continue;
    const bp = ItemBlueprints[w.blueprintId];
    if (bp?.equipType === 'shield') {
      def += (bp.baseValue / 48) + (w.quality / 32);
    }
  }
  if (accessory) {
    const bp = ItemBlueprints[accessory.blueprintId];
    if (bp) speedMult += bp.baseValue / 2500 + accessory.quality / 5000;
  }
  if (traitBag) {
    def += traitBag.runDamageReduction || 0;
    hpFlat += traitBag.runMaxHpFlat || 0;
    speedMult += traitBag.runMoveSpeed || 0;
    dodge += traitBag.runDodge || 0;
    regen += traitBag.runRegenPerSec || 0;
  }
  return { defense: def, hpFlat, speedMult, dodge, regen };
}

/**
 * EHP 計算。実コード PlayerController.takeDamage の式そのまま:
 *   reduced = amount - def/3
 *   minDamage = max(1, ceil(amount * 0.25))      // 最大75%軽減
 *   effectiveDamage = max(minDamage, round(reduced))
 *
 * 加えて invincibilityDuration (0.5s) で連続被弾は 2 hit/s が上限、
 * dodge で確率回避。
 */
export function calcEhp(armor, accessory, weaponSlots = [], traitBag = null, incomingHitDamage = 6) {
  const { defense, hpFlat, dodge, regen } = calcDefense(armor, accessory, weaponSlots, traitBag);
  const baseHp = GameConfig.run.playerBaseHp + hpFlat;
  // 実コードと同じ式
  const reduced = incomingHitDamage - defense / 3;
  const minDamage = Math.max(1, Math.ceil(incomingHitDamage * 0.25));
  const effectiveHit = Math.max(minDamage, Math.round(reduced));
  // dodge は完全回避なので平均: effectiveHit × (1 - dodge率)
  const avgHitWithDodge = effectiveHit * (1 - Math.min(0.9, dodge));
  const hitsToDie = baseHp / Math.max(0.5, avgHitWithDodge);
  return {
    baseHp,
    defense,
    effectiveHit: avgHitWithDodge,
    rawHit: effectiveHit,
    hitsToDie,
    dodge,
    regen,
    ehp: hitsToDie * incomingHitDamage,
  };
}

/** ペット DPS 寄与 */
export function petDps(petEntry, playerBaseDamage = GameConfig.run.playerBaseDamage) {
  if (!petEntry?.id) return { dps: 0, kind: 'none' };
  const def = PetDefs[petEntry.id];
  if (!def) return { dps: 0, kind: 'none' };
  const params = getPetBehaviorParams(petEntry.id, petEntry.level || 1);
  const stats = getPetLevelStats(petEntry.id, petEntry.level || 1);
  switch (def.behavior) {
    case 'autoAttack': {
      const baseDmg = playerBaseDamage * (params.damageMult || 0.3) + (stats?.atk || 0);
      const dps = baseDmg / Math.max(0.05, params.cooldown || 1.5);
      return { dps, kind: 'combat' };
    }
    case 'aoe': {
      const baseDmg = playerBaseDamage * (params.damageMult || 1.0) + (stats?.atk || 0);
      const dps = baseDmg * 3 / Math.max(0.5, params.cooldown || 5);
      return { dps, kind: 'combat' };
    }
    case 'projectile': {
      const baseDmg = playerBaseDamage * (params.damageMult || 2.5) + (stats?.atk || 0);
      const dps = baseDmg / Math.max(1, params.cooldown || 10);
      return { dps, kind: 'combat' };
    }
    case 'magnet':
      return { dps: 0, kind: 'support', extra: `磁力 +${Math.round((params.magnetMultiplier || 0) * 100)}%` };
    case 'xpBoost':
      return { dps: 0, kind: 'utility', extra: `EXP +${Math.round((params.expMultiplier || 0) * 100)}%, ドロップ +${Math.round((params.dropBonus || 0) * 100)}%` };
    case 'revive':
      return { dps: 0, kind: 'support', extra: `復活 ×${params.charges || 1} (${Math.round((params.healPercent || 0) * 100)}%HP)` };
    default:
      return { dps: 0, kind: 'none' };
  }
}

/**
 * 推定生存秒数: hitsToDie ÷ (敵接触頻度 contactsPerSec) — invincibility 0.5s で上限
 */
export function estimatedSurvival(ehpInfo, petEntry = null, contactsPerSec = 1.0) {
  // Player invincibility 0.5s -> max 2 hits/s
  const cappedRate = Math.min(2, contactsPerSec);
  let totalHits = ehpInfo.hitsToDie;
  if (petEntry?.id === 'phoenix') {
    const params = getPetBehaviorParams('phoenix', petEntry.level || 1);
    // 復活で +50% hits 程度
    totalHits *= 1 + (params.healPercent || 0.5) * (params.charges || 1);
  }
  return totalHits / Math.max(0.05, cappedRate);
}

/** 一括サマリー */
export function buildSummary({
  weaponSlots = [], armor = null, accessory = null, pet = null,
  avgTargets = 3, contactsPerSec = 1.0, incomingHitDamage = 6,
}) {
  const traits = accumulateTraits(weaponSlots, armor, accessory);
  const wDps = weaponSlotsDps(weaponSlots, { avgTargets, traitBag: traits });
  const ehpInfo = calcEhp(armor, accessory, weaponSlots, traits, incomingHitDamage);
  const petInfo = petDps(pet);
  const totalDpsSingle = wDps.singleTarget + (petInfo.dps || 0);
  const totalDpsMulti = wDps.multiTarget + (petInfo.dps || 0);
  const survivalSec = estimatedSurvival(ehpInfo, pet, contactsPerSec);
  return {
    weaponDpsSingle: wDps.singleTarget,
    weaponDpsMulti: wDps.multiTarget,
    petDps: petInfo.dps,
    petKind: petInfo.kind,
    petExtra: petInfo.extra || '',
    totalDpsSingle,
    totalDpsMulti,
    baseHp: ehpInfo.baseHp,
    defense: ehpInfo.defense,
    effectiveHit: ehpInfo.effectiveHit,
    hitsToDie: ehpInfo.hitsToDie,
    estimatedSurvivalSec: survivalSec,
    dodge: ehpInfo.dodge,
    regen: ehpInfo.regen,
    traits,
    // 旧API互換
    weaponDps: wDps.singleTarget,
    totalDps: totalDpsSingle,
    ehp: ehpInfo.ehp,
    reduction: 1 - (ehpInfo.effectiveHit / Math.max(1, incomingHitDamage)),
  };
}
