/**
 * MonteCarlo — Layer 2 確率シミュレーター
 *
 * 検証対象:
 *   - ドロップテーブルからの素材入手シム
 *   - ★5 エリート遭遇頻度
 *   - ペット卵レシピの素材集め期待時間
 */

import { AreaDefs } from '../../../src/game/data/areas.js';
import { ItemBlueprints, Recipes } from '../../../src/game/data/items.js';
import { GameConfig } from '../../../src/game/data/config.js';

/** 重み付き抽選 */
function pickWeighted(table) {
  const total = table.reduce((s, e) => s + (e.weight || 0), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const e of table) {
    r -= e.weight || 0;
    if (r <= 0) return e;
  }
  return table[table.length - 1];
}

/**
 * 単一ランのドロップ集計（既存 DropSystem を簡略化）
 * - 想定: 1ラン中に N体の敵を倒す
 * - 各敵は dropChance の確率で素材ドロップ
 * - エリアのドロップテーブルから重み付き抽選
 *
 * @param {string} areaId
 * @param {{killCount:number, dropChance?:number, eliteChance?:number}} opts
 * @returns {Record<string, number>} blueprintId → 個数
 */
export function simulateRunDrops(areaId, opts = {}) {
  const area = AreaDefs[areaId];
  if (!area || !area.dropTable) return {};
  const killCount = opts.killCount ?? 500;
  const dropChance = opts.dropChance ?? GameConfig.run.dropChance;
  const eliteChance = opts.eliteChance ?? 0;
  const eliteDropMult = opts.eliteDropMult ?? 3;
  const eliteDropBonus = opts.eliteDropBonus ?? 0.25; // ★5 は dropChance を +25%
  const dropMin = area.dropCountMin || 1;
  const dropMax = area.dropCountMax || 1;

  const result = {};
  let elites = 0;
  for (let i = 0; i < killCount; i++) {
    const isElite = Math.random() < eliteChance;
    if (isElite) elites++;
    const effectiveDropChance = isElite ? Math.min(1, dropChance + eliteDropBonus) : dropChance;
    if (Math.random() >= effectiveDropChance) continue;
    const baseN = dropMin + Math.floor(Math.random() * (dropMax - dropMin + 1));
    const n = isElite ? Math.ceil(baseN * eliteDropMult) : baseN;
    for (let k = 0; k < n; k++) {
      const pick = pickWeighted(area.dropTable);
      if (!pick) continue;
      result[pick.blueprintId] = (result[pick.blueprintId] || 0) + 1;
    }
  }
  result.__elites = elites;
  return result;
}

/**
 * 多ラン Monte Carlo: 集計を trial 回繰り返し、各素材の入手数ヒストグラムを返す
 * @param {object} opts
 */
export function montecarloDrops({ areaId, trials = 1000, killCount = 500, dropChance, eliteChance, eliteDropMult }) {
  const samples = [];
  const elitesPerRun = [];
  for (let i = 0; i < trials; i++) {
    const r = simulateRunDrops(areaId, { killCount, dropChance, eliteChance, eliteDropMult });
    elitesPerRun.push(r.__elites || 0);
    delete r.__elites;
    samples.push(r);
  }
  return aggregateSamples(samples, elitesPerRun);
}

/**
 * trial 数のサンプル集合から各 blueprintId ごとに統計を出す
 */
function aggregateSamples(samples, elitesPerRun) {
  const aggregate = {};
  // 全 blueprintId を集める
  const allIds = new Set();
  for (const s of samples) for (const id of Object.keys(s)) allIds.add(id);

  for (const id of allIds) {
    const counts = samples.map(s => s[id] || 0).sort((a, b) => a - b);
    aggregate[id] = {
      mean: counts.reduce((a, b) => a + b, 0) / counts.length,
      median: percentile(counts, 50),
      p10: percentile(counts, 10),
      p90: percentile(counts, 90),
      max: counts[counts.length - 1],
      min: counts[0],
      // 入手0率
      zeroRate: counts.filter(c => c === 0).length / counts.length,
    };
  }
  // ★5 統計
  const elSorted = [...elitesPerRun].sort((a, b) => a - b);
  return {
    perItem: aggregate,
    elites: elitesPerRun.length > 0 ? {
      mean: elitesPerRun.reduce((a, b) => a + b, 0) / elitesPerRun.length,
      median: percentile(elSorted, 50),
      p10: percentile(elSorted, 10),
      p90: percentile(elSorted, 90),
    } : null,
    trials: samples.length,
  };
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor((p / 100) * sortedArr.length)));
  return sortedArr[idx];
}

/**
 * カテゴリ素材 (@cloth_type 等) を全 ItemBlueprint から該当 ID のリストに展開
 */
function expandCategoryToIds(category) {
  const out = [];
  for (const [id, bp] of Object.entries(ItemBlueprints)) {
    if (bp.category === category) out.push(id);
  }
  return out;
}

/**
 * 必要素材の充足判定: 具体素材 + カテゴリ素材を考慮
 * @param {string[]} materials - レシピ素材リスト (具体ID または @category_id)
 * @param {Record<string, number>} totals - 累積ドロップ数
 */
function satisfiesRecipe(materials, totals) {
  // 具体素材の必要数とカテゴリ素材の必要数を集計
  const concreteNeeded = {};
  const categoryNeeded = {};
  for (const m of materials) {
    if (m.startsWith('@')) {
      const cat = m.slice(1);
      categoryNeeded[cat] = (categoryNeeded[cat] || 0) + 1;
    } else {
      concreteNeeded[m] = (concreteNeeded[m] || 0) + 1;
    }
  }
  // 具体素材は厳密チェック、消費は仮想
  const remaining = { ...totals };
  for (const [id, need] of Object.entries(concreteNeeded)) {
    if ((remaining[id] || 0) < need) return false;
    remaining[id] = remaining[id] - need;
  }
  // カテゴリ素材: 残りのプールから category 指定されたものの合計を確認
  for (const [cat, need] of Object.entries(categoryNeeded)) {
    const ids = expandCategoryToIds(cat);
    let sum = 0;
    for (const id of ids) sum += remaining[id] || 0;
    if (sum < need) return false;
    // 概算消費: 重み順に減算 (粗い近似)
    let toConsume = need;
    for (const id of ids) {
      if (toConsume <= 0) break;
      const have = remaining[id] || 0;
      const take = Math.min(have, toConsume);
      remaining[id] = have - take;
      toConsume -= take;
    }
  }
  return true;
}

/**
 * ペット卵レシピで必要な素材を、指定エリアで集めるのに必要なラン数を推定
 * @param {string} eggRecipeId  - 'pet_egg_phoenix' 等
 * @param {object} opts
 */
export function estimateEggCollectRuns(eggRecipeId, opts = {}) {
  const recipe = Recipes[eggRecipeId];
  if (!recipe) return { requiredMaterials: {}, requiredCategories: {}, eligibleAreas: [], runsByAreaP50: {} };
  const concrete = {};
  const categoryReq = {};
  for (const m of recipe.materials) {
    if (m.startsWith('@')) {
      const cat = m.slice(1);
      categoryReq[cat] = (categoryReq[cat] || 0) + 1;
    } else {
      concrete[m] = (concrete[m] || 0) + 1;
    }
  }

  const result = {};
  const eligibleAreas = [];
  for (const areaId of Object.keys(AreaDefs)) {
    const area = AreaDefs[areaId];
    if (!area.dropTable) continue;
    const dropIds = new Set(area.dropTable.map(d => d.blueprintId));
    // エリアが全必要素材 (具体 + カテゴリのいずれか1個) を提供できるか?
    let allConcreteAvail = true;
    for (const id of Object.keys(concrete)) {
      if (!dropIds.has(id)) { allConcreteAvail = false; break; }
    }
    let allCategoryAvail = true;
    for (const cat of Object.keys(categoryReq)) {
      const ids = expandCategoryToIds(cat);
      const found = ids.some(id => dropIds.has(id));
      if (!found) { allCategoryAvail = false; break; }
    }
    if (!allConcreteAvail || !allCategoryAvail) continue;
    eligibleAreas.push(areaId);
    // ラン数推定
    const trials = opts.trials ?? 200;
    const killCount = opts.killCount ?? 400;
    const eliteChance = opts.eliteChance ?? 0;
    const samples = [];
    for (let i = 0; i < trials; i++) {
      const totals = simulateRunDrops(areaId, { killCount, eliteChance });
      delete totals.__elites;
      let runsThisIter = 1;
      while (!satisfiesRecipe(recipe.materials, totals)) {
        runsThisIter += 1;
        const r2 = simulateRunDrops(areaId, { killCount, eliteChance });
        delete r2.__elites;
        for (const [id, n] of Object.entries(r2)) totals[id] = (totals[id] || 0) + n;
        if (runsThisIter > 200) break;
      }
      samples.push(runsThisIter);
    }
    samples.sort((a, b) => a - b);
    result[areaId] = {
      p50: percentile(samples, 50),
      p10: percentile(samples, 10),
      p90: percentile(samples, 90),
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    };
  }
  return { requiredMaterials: concrete, requiredCategories: categoryReq, eligibleAreas, runsByAreaP50: result };
}

/**
 * ★5 エリート遭遇シミュレーション
 * @param {{killCount:number, eliteChance:number, trials:number}} opts
 */
export function simulateEliteEncounters({ killCount = 500, eliteChance = 0.25, trials = 1000 }) {
  const counts = [];
  for (let i = 0; i < trials; i++) {
    let n = 0;
    for (let k = 0; k < killCount; k++) if (Math.random() < eliteChance) n++;
    counts.push(n);
  }
  counts.sort((a, b) => a - b);
  return {
    mean: counts.reduce((a, b) => a + b, 0) / counts.length,
    p10: percentile(counts, 10),
    p50: percentile(counts, 50),
    p90: percentile(counts, 90),
    histogram: bucketize(counts, 20),
    trials,
  };
}

/** 値配列をビン分割してヒストグラム化 */
function bucketize(values, bins = 20) {
  if (!values.length) return [];
  const min = values[0];
  const max = values[values.length - 1];
  if (max === min) return [{ start: min, end: max, count: values.length }];
  const step = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    start: min + i * step,
    end: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    out[idx].count++;
  }
  return out;
}

export { bucketize, percentile };
