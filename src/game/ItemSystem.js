import { ItemBlueprints, Recipes, TraitDefs, TraitFusionTable, MaterialCategories } from './data/items.js';
import { GameConfig } from './data/config.js';
import { eventBus } from './core/EventBus.js';

// Re-export for convenience
export { ItemBlueprints, Recipes };

/** 現在の装備品質上限（Phase 1: 固定100） */
export function getCurrentQualityCap() {
  return 100;
}

/** カテゴリスロットかどうか判定 */
export function isCategorySlot(slot) {
  return typeof slot === 'string' && slot.startsWith('@');
}

/** カテゴリIDを取得 ('@wood_type' → 'wood_type') */
export function getCategoryId(slot) {
  return slot.slice(1);
}

/** 素材がスロット要件を満たすか判定 */
export function materialMatchesSlot(blueprintId, slot) {
  if (isCategorySlot(slot)) {
    const catId = getCategoryId(slot);
    const bp = ItemBlueprints[blueprintId];
    return bp && bp.category === catId;
  }
  return blueprintId === slot;
}

/**
 * 個別のアイテムインスタンスを生成する
 */
export function createItemInstance(blueprintId, quality, traits = []) {
  const bp = ItemBlueprints[blueprintId];
  if (!bp) throw new Error(`Unknown blueprint: ${blueprintId}`);

  const instance = {
    uid: crypto.randomUUID(),
    blueprintId,
    name: bp.name,
    type: bp.type,
    quality: Math.floor(quality),
    traits: [...traits],
    value: Math.round(bp.baseValue * (quality / 50)),
  };
  return instance;
}

/**
 * クラフト（調合）ロジック — パズルなし簡易版
 * qualityBonus は将来の拡張用（Phase 1では常に0）
 */
export function craftItem(recipeId, materialInstances, selectedTraits = [], qualityBonus = 0) {
  const recipe = Recipes[recipeId];
  if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);

  // 1. レシピ条件チェック（カテゴリ対応）
  if (recipe.materials.length !== materialInstances.length) {
    throw new Error('素材の数が合いません');
  }
  const usedIndices = new Set();
  for (const slot of recipe.materials) {
    let matched = false;
    for (let i = 0; i < materialInstances.length; i++) {
      if (usedIndices.has(i)) continue;
      if (materialMatchesSlot(materialInstances[i].blueprintId, slot)) {
        usedIndices.add(i);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`素材が条件を満たしていません: ${slot}`);
    }
  }

  // 2. 品質計算 (素材の平均品質)
  const totalQuality = materialInstances.reduce((sum, item) => sum + item.quality, 0);
  const avgQuality = materialInstances.length > 0 ? (totalQuality / materialInstances.length) : 50;

  // 3. 特性引き継ぎ + 融合
  const traitCounts = {};
  materialInstances.forEach(item => {
    const seen = new Set();
    item.traits.forEach(t => {
      if (!seen.has(t)) {
        traitCounts[t] = (traitCounts[t] || 0) + 1;
        seen.add(t);
      }
    });
  });

  const fusionMap = {};
  for (const [trait, count] of Object.entries(traitCounts)) {
    if (count >= 2 && TraitFusionTable[trait] && TraitDefs[TraitFusionTable[trait]]) {
      fusionMap[trait] = TraitFusionTable[trait];
    }
  }

  const allAvailableTraits = new Set();
  materialInstances.forEach(item => {
    item.traits.forEach(t => allAvailableTraits.add(t));
  });
  for (const upgraded of Object.values(fusionMap)) {
    allAvailableTraits.add(upgraded);
  }

  const finalTraits = [];
  const usedFusions = new Set();
  for (const t of selectedTraits) {
    if (fusionMap[t] && !usedFusions.has(t)) {
      finalTraits.push(fusionMap[t]);
      usedFusions.add(t);
    } else if (allAvailableTraits.has(t)) {
      if (!usedFusions.has(t)) {
        finalTraits.push(t);
      }
    }
  }

  const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
  finalTraits.sort((a, b) => {
    const ra = rarityOrder[TraitDefs[a]?.rarity] ?? 5;
    const rb = rarityOrder[TraitDefs[b]?.rarity] ?? 5;
    return ra - rb;
  });
  finalTraits.length = Math.min(finalTraits.length, GameConfig.maxTraitSlots);

  // 素材特性の調合品質ボーナス
  let craftTraitBonus = 0;
  for (const mat of materialInstances) {
    for (const t of (mat.traits || [])) {
      const def = TraitDefs[t];
      if (def && def.effects && def.effects.craftQualityBonus) {
        craftTraitBonus += def.effects.craftQualityBonus;
      }
    }
  }
  const qualityCap = getCurrentQualityCap();
  const finalQuality = Math.min(qualityCap, Math.max(0, avgQuality + qualityBonus + craftTraitBonus));

  // 4. アイテムインスタンスの作成
  const item = createItemInstance(recipe.targetId, finalQuality, finalTraits);

  eventBus.emit('item:crafted', { item, recipeId });
  return item;
}
