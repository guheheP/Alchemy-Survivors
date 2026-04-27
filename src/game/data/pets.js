/**
 * pets.js — ペット（使い魔）データ定義
 *
 * ペットは装備とは別の「契約」スロットに装着する相棒。
 * ラン中はプレイヤーに追従し、behavior に応じた行動を取る。
 *
 * behavior 種別:
 *   - 'magnet'     : マグネット範囲拡大（補助）
 *   - 'autoAttack' : 近接敵への自動噛みつき（戦闘）
 *   - 'revive'     : 瀕死時に1回復活（補助、ラン1回限定）
 *   - 'xpBoost'    : 経験値・ドロップブースト（採集）
 *   - 'aoe'        : 周期AoE爆発（戦闘）
 *   - 'projectile' : 周期遠距離ブレス（戦闘）
 */

/**
 * @typedef {Object} PetDef
 * @property {string} id
 * @property {string} name
 * @property {string} icon  - 絵文字（アイコンスプライト未準備時のフォールバック）
 * @property {string} spriteColor - 簡易描画用の色
 * @property {string} description
 * @property {'combat'|'support'|'utility'} type
 * @property {string} behavior
 * @property {object} behaviorParams
 * @property {{hp:number, atk:number, speed:number}} baseStats
 * @property {string} eggBlueprintId
 * @property {'common'|'rare'|'legendary'} rarity
 */

/** @type {Record<string, PetDef>} */
export const PetDefs = {
  slime: {
    id: 'slime',
    name: 'スライム',
    icon: '🟢',
    spriteColor: '#7eb87e',
    description: 'アイテム自動回収半径 +50%、XPオーブを優先吸引',
    type: 'support',
    behavior: 'magnet',
    behaviorParams: { magnetMultiplier: 0.5, xpVacuum: true },
    baseStats: { hp: 50, atk: 0, speed: 0.7 },
    eggBlueprintId: 'pet_egg_slime',
    rarity: 'common',
  },
  wolf: {
    id: 'wolf',
    name: '子狼',
    icon: '🐺',
    spriteColor: '#9a7e58',
    description: '近くの敵を自動で追跡して噛みつく（武器DPSの約30%）',
    type: 'combat',
    behavior: 'autoAttack',
    behaviorParams: { range: 90, cooldown: 1.5, damageMult: 0.3 },
    baseStats: { hp: 80, atk: 1, speed: 1.2 },
    eggBlueprintId: 'pet_egg_wolf',
    rarity: 'common',
  },
  phoenix: {
    id: 'phoenix',
    name: 'フェニックス',
    icon: '🔥',
    spriteColor: '#ff7744',
    description: 'ラン中1回、HP0時に最大HPの50%で復活する',
    type: 'support',
    behavior: 'revive',
    behaviorParams: { healPercent: 0.5, charges: 1 },
    baseStats: { hp: 60, atk: 0, speed: 1.0 },
    eggBlueprintId: 'pet_egg_phoenix',
    rarity: 'rare',
  },
  owl: {
    id: 'owl',
    name: 'フクロウ',
    icon: '🦉',
    spriteColor: '#8a6e4e',
    description: '取得経験値 +20%、ボスドロップ確率 +15%',
    type: 'utility',
    behavior: 'xpBoost',
    behaviorParams: { expMultiplier: 0.2, dropBonus: 0.15 },
    baseStats: { hp: 40, atk: 0, speed: 1.0 },
    eggBlueprintId: 'pet_egg_owl',
    rarity: 'rare',
  },
  imp: {
    id: 'imp',
    name: 'インプ',
    icon: '👹',
    spriteColor: '#cc4488',
    description: '5秒毎に小範囲爆発（魔法ダメージ）',
    type: 'combat',
    behavior: 'aoe',
    behaviorParams: { radius: 70, cooldown: 5, damageMult: 1.0 },
    baseStats: { hp: 50, atk: 1, speed: 1.0 },
    eggBlueprintId: 'pet_egg_imp',
    rarity: 'rare',
  },
  dragonling: {
    id: 'dragonling',
    name: '子龍',
    icon: '🐲',
    spriteColor: '#ddaa44',
    description: '10秒毎に高威力ブレス、ボス被ダメージ +20%',
    type: 'combat',
    behavior: 'projectile',
    behaviorParams: { range: 220, cooldown: 10, damageMult: 2.5, bossBonus: 0.2 },
    baseStats: { hp: 100, atk: 2, speed: 0.8 },
    eggBlueprintId: 'pet_egg_dragonling',
    rarity: 'legendary',
  },
};

export const MAX_PET_LEVEL = 30;

/**
 * Lv N に必要な累計経験値（緩いカーブで Lv30 ≈ 4500 EXP）
 * @param {number} level
 * @returns {number}
 */
export function expForLevel(level) {
  if (level <= 1) return 0;
  // Lv n: 50 * (n-1)^1.6
  return Math.floor(50 * Math.pow(level - 1, 1.6));
}

/**
 * 累計 exp から現在 Lv を解決する
 * @param {number} totalExp
 * @returns {number}
 */
export function levelFromExp(totalExp) {
  let lv = 1;
  while (lv < MAX_PET_LEVEL && expForLevel(lv + 1) <= totalExp) lv++;
  return lv;
}

/**
 * Lv に応じた最終ステータス。Lv30 でベースの約2.5倍。
 * @param {string} petId
 * @param {number} level
 */
export function getPetLevelStats(petId, level) {
  const def = PetDefs[petId];
  if (!def) return null;
  const lvMult = 1 + (level - 1) * 0.05;
  return {
    hp: def.baseStats.hp * lvMult,
    atk: def.baseStats.atk * lvMult,
    speed: def.baseStats.speed,
    level,
  };
}

/**
 * Lv に応じた behavior パラメータの調整値。
 * 周期攻撃系は damageMult が Lv で伸び、CD が短縮される。
 * @param {string} petId
 * @param {number} level
 */
export function getPetBehaviorParams(petId, level) {
  const def = PetDefs[petId];
  if (!def) return {};
  const params = { ...def.behaviorParams };
  const lvMult = 1 + (level - 1) * 0.05;
  if (typeof params.damageMult === 'number') params.damageMult *= lvMult;
  if (typeof params.cooldown === 'number') {
    // Lv30 で約20%短縮
    params.cooldown *= Math.max(0.8, 1 - (level - 1) * 0.007);
  }
  if (typeof params.magnetMultiplier === 'number') params.magnetMultiplier *= lvMult;
  if (typeof params.expMultiplier === 'number') params.expMultiplier *= lvMult;
  return params;
}

/**
 * 全ペット定義の配列を返す
 */
export function listAllPets() {
  return Object.values(PetDefs);
}
