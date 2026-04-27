/**
 * skillTierResolver — 武器スキルの品質段階アンロック解決
 *
 * 武器の品質と blueprintId のランクから、スキルの params/flags を段階的に強化する。
 * 消耗品 (ConsumableSystem.resolveTieredEffects) と対称な仕組みで、
 * 序盤武器を磨き込めば終盤でも個性的な役割を持てるようにする。
 *
 * マージ規則:
 *   - 数値 (number): ベース値に加算 (radius +20, dmgMult +0.4 等)
 *   - 真偽値/文字列: 上書き (pierce: true, color: '#ff8' 等)
 *   - 配列: concat (onHit: ['burn'] が tier 毎に追加)
 *   - オブジェクト: 数値フィールドは加算、それ以外は上書き
 */

import { ItemBlueprints, TraitDefs } from '../../data/items.js';
import { WeaponSkillDefs } from '../../data/weaponSkills.js';

/**
 * 武器 blueprintId → ランク (1-8) のマップ。
 * items.js のレシピ区分コメントから抽出。武器以外の装備は対象外。
 * 新規武器を追加した際はここにも追記すること。
 */
export const WEAPON_RANK_MAP = {
  // Rank 1: 初期レシピ
  sword: 1, stone_axe: 1, wooden_bow: 1, shield: 1,
  // Rank 2: 洞窟解放
  fire_sword: 2, ice_shield: 2, silver_dagger: 2, iron_spear: 2,
  // Rank 3: 森解放
  mage_staff: 3, wind_bow: 3, dark_blade: 3, poison_dagger: 3,
  // Rank 4: 火山解放
  holy_sword: 4, flame_lance: 4, moonlight_staff: 4, thunder_hammer: 4, lava_shield: 4,
  // Rank 5: 深海解放
  trident: 5, tidal_bow: 5, mithril_sword: 5, mithril_shield: 5,
  frost_blade: 5, elder_staff: 5, sea_serpent_whip: 5,
  // Rank 6: 竜の巣解放
  dragon_slayer: 6, dragon_bow: 6, void_blade: 6, thunder_spear: 6, scale_shield: 6,
  // Rank 7: 天空解放
  sky_sword: 7, star_shield: 7, aether_staff: 7, sky_bow: 7,
  wind_lance: 7, phoenix_bow: 7,
  // Rank 8: 最終レシピ
  legendary_blade: 8, world_tree_staff: 8, time_blade: 8, cosmos_bow: 8,
  oblivion_shield: 8,
  // 上記マップに無い武器はデフォルト Rank 8 扱い（getWeaponRank の DEFAULT_RANK）
};

/**
 * ランク別の tier 解放閾値 [T1, T2, T3, T4]。
 * Rank 1: 0/70/100/150 (初期上限 Q100 で T3 まで、ボス1体撃破後の Q200 で T4 解放)
 * Rank 8: 120/180/240/300 (ボス2体撃破後の Q300 で全解放)
 * 中間ランクは線形補間で滑らかに繋ぐ。
 */
export const WEAPON_TIER_THRESHOLDS = {
  1: [0, 70, 100, 150],
  2: [20, 85, 120, 170],
  3: [35, 100, 140, 190],
  4: [50, 115, 160, 215],
  5: [70, 135, 180, 235],
  6: [85, 150, 200, 260],
  7: [105, 165, 220, 280],
  8: [120, 180, 240, 300],
};

const DEFAULT_RANK = 8;

/** blueprintId → rank。未登録は最終ランク扱い（強化が出にくい安全側）。 */
export function getWeaponRank(blueprintId) {
  return WEAPON_RANK_MAP[blueprintId] || DEFAULT_RANK;
}

/** rank → 閾値配列 [T1..T4]。 */
export function getTierThresholds(rank) {
  return WEAPON_TIER_THRESHOLDS[rank] || WEAPON_TIER_THRESHOLDS[DEFAULT_RANK];
}

/**
 * 解放済み tier 数を返す (0-4)。
 *   0 = T0 のみ（基底効果）
 *   1 = T1 解放
 *   4 = T4 まで全解放
 */
export function resolveSkillTier(blueprintId, item) {
  const quality = item?.quality || 0;
  const rank = getWeaponRank(blueprintId);
  const thresholds = getTierThresholds(rank);
  let unlocked = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (quality >= thresholds[i]) unlocked = i + 1;
    else break;
  }
  return unlocked;
}

/**
 * 武器が指定の trait を持つかを判定。
 * `requireTraits: ['fire_aspect']` のような条件を tier に付ける場合に使う。
 */
function hasAllTraits(item, requiredTraits) {
  if (!Array.isArray(requiredTraits) || requiredTraits.length === 0) return true;
  if (!Array.isArray(item?.traits) || item.traits.length === 0) return false;
  for (const t of requiredTraits) {
    if (!item.traits.includes(t)) return false;
  }
  return true;
}

/** 単一フィールドのマージ。数値=加算、配列=concat、オブジェクト=再帰、それ以外=上書き。 */
function mergeField(dest, key, value) {
  if (value === undefined || value === null) return;
  const cur = dest[key];
  if (typeof value === 'number') {
    dest[key] = (typeof cur === 'number' ? cur : 0) + value;
  } else if (Array.isArray(value)) {
    dest[key] = Array.isArray(cur) ? cur.concat(value) : value.slice();
  } else if (typeof value === 'object') {
    const target = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? { ...cur } : {};
    for (const k of Object.keys(value)) mergeField(target, k, value[k]);
    dest[key] = target;
  } else {
    dest[key] = value;
  }
}

/** ベース params のディープコピー（後段の加算で破壊しないように）。 */
function clonePlainObject(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === 'object') out[k] = clonePlainObject(v);
    else out[k] = v;
  }
  return out;
}

/**
 * 武器スキルの params/flags を品質で解決する。
 *
 * @param {string} blueprintId - 武器の blueprint ID
 * @param {{ quality?: number, traits?: string[] }} item - 武器インスタンス
 * @returns {{ params: object, flags: object, unlockedTier: number }}
 *   - params: executor に渡す解決済み params（base + 通過 tier の partial を加算/concat）
 *   - flags: tier で付与される質的アンロックフラグ (pierce/aftershock/extraStatus 等)
 *   - unlockedTier: 解放済み tier 数 (0-4)
 */
export function resolveWeaponSkillTiers(blueprintId, item) {
  const def = WeaponSkillDefs[blueprintId];
  if (!def) {
    return { params: {}, flags: {}, unlockedTier: 0 };
  }
  const params = clonePlainObject(def.params || {});
  const flags = {};
  const unlockedTier = resolveSkillTier(blueprintId, item);

  if (!Array.isArray(def.tiers) || unlockedTier === 0) {
    return { params, flags, unlockedTier };
  }

  const quality = item?.quality || 0;
  for (const tier of def.tiers) {
    if (quality < (tier.minQuality || 0)) continue;
    if (!hasAllTraits(item, tier.requireTraits)) continue;
    if (tier.params) {
      for (const k of Object.keys(tier.params)) mergeField(params, k, tier.params[k]);
    }
    if (tier.flags) {
      for (const k of Object.keys(tier.flags)) flags[k] = tier.flags[k];
    }
  }
  return { params, flags, unlockedTier };
}

/**
 * 次に解放される tier の閾値を返す。UI 表示用 (「あと Q◯◯ で次の強化」)。
 * 全 tier 解放済みの場合は null。
 */
export function getNextTierThreshold(blueprintId, item) {
  const quality = item?.quality || 0;
  const rank = getWeaponRank(blueprintId);
  const thresholds = getTierThresholds(rank);
  for (const t of thresholds) {
    if (quality < t) return t;
  }
  return null;
}

// 内部ユーティリティのテスト用エクスポート
export const _internal = { hasAllTraits, mergeField, clonePlainObject };
