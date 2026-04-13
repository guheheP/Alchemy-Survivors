/**
 * SaveSystem — Alchemy Survivors用セーブシステム
 * localStorage v1
 */

import { createItemInstance } from '../ItemSystem.js';
import { Recipes } from '../data/items.js';
import { AreaDefs } from '../data/areas.js';
import { Progression } from '../data/progression.js';

const SAVE_KEY = 'alchemy_survivors_save_v1';

export class SaveSystem {
  constructor(inventorySystem) {
    this.inventory = inventorySystem;
  }

  save(extraData = {}) {
    const data = {
      version: 1,
      timestamp: Date.now(),
      gold: this.inventory.gold,
      maxCapacity: this.inventory.maxCapacity,
      items: this.inventory.items.map(item => ({
        blueprintId: item.blueprintId,
        quality: item.quality,
        traits: [...item.traits],
        locked: item.locked || false,
      })),
      equippedWeaponUids: extraData.equippedWeaponUids || [null, null, null, null],
      equippedArmorUid: extraData.equippedArmorUid || null,
      equippedAccessoryUid: extraData.equippedAccessoryUid || null,
      unlockedRecipes: Object.entries(Recipes)
        .filter(([, r]) => r.unlocked)
        .map(([id]) => id),
      unlockedAreas: Object.entries(AreaDefs)
        .filter(([, a]) => a.unlocked)
        .map(([id]) => id),
      defeatedBosses: Progression.getDefeatedBosses(),
      purchasedUpgrades: Progression.getPurchasedUpgrades ? [...Progression.getPurchasedUpgrades()] : [],
      stats: extraData.stats || {
        totalRuns: 0,
        totalKills: 0,
        bestSurvivalTime: 0,
        totalMaterialsCollected: 0,
      },
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[SaveSystem] Save failed:', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[SaveSystem] Load failed:', e);
      return null;
    }
  }

  applySaveData(data) {
    if (!data || data.version !== 1) return false;

    // インベントリ復元
    this.inventory.items.length = 0;
    this.inventory.gold = data.gold || 0;
    this.inventory.maxCapacity = data.maxCapacity || 60;

    for (const itemData of data.items) {
      const item = createItemInstance(itemData.blueprintId, itemData.quality, itemData.traits);
      if (itemData.locked) item.locked = true;
      this.inventory.items.push(item);
    }
    this.inventory.rebuildIndexes();

    // レシピ解放
    for (const [id, recipe] of Object.entries(Recipes)) {
      recipe.unlocked = (data.unlockedRecipes || []).includes(id);
    }

    // エリア解放
    for (const [id, area] of Object.entries(AreaDefs)) {
      area.unlocked = (data.unlockedAreas || []).includes(id);
    }

    // 撃破ボス復元
    Progression.loadDefeatedBosses(data.defeatedBosses || []);

    // アップグレード復元
    if (Progression.loadPurchasedUpgrades) {
      Progression.loadPurchasedUpgrades(data.purchasedUpgrades || []);
    }

    // 装備復元（UID → アイテム参照の再構築）
    const restoredEquipment = { weaponSlots: [null, null, null, null], armor: null, accessory: null };
    if (data.equippedWeaponUids) {
      for (let i = 0; i < data.equippedWeaponUids.length; i++) {
        const uid = data.equippedWeaponUids[i];
        if (uid) {
          const item = this.inventory.getItemByUid(uid);
          if (item) restoredEquipment.weaponSlots[i] = item;
        }
      }
    }
    if (data.equippedArmorUid) {
      restoredEquipment.armor = this.inventory.getItemByUid(data.equippedArmorUid);
    }
    if (data.equippedAccessoryUid) {
      restoredEquipment.accessory = this.inventory.getItemByUid(data.equippedAccessoryUid);
    }

    return { ...data, restoredEquipment };
  }

  static hasSaveData() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }
}
