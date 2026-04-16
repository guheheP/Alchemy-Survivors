/**
 * EquipmentPresets — 装備プリセット管理
 *
 * 保存対象: 武器4スロット + 防具 + アクセサリ (UID 配列として保持)
 * 最大 5 プリセット。名前編集可。消耗品は含まない (別管理)。
 *
 * データ構造:
 *   { id: string, name: string, weaponUids: (string|null)[4],
 *     armorUid: string|null, accessoryUid: string|null }
 *
 * UID がクラフト/売却で消失した場合、apply 時に空スロット扱いとし、
 * 呼び出し側 (main.js) が不足数をトースト通知する。
 */

const MAX_PRESETS = 5;

function makeId() {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export class EquipmentPresetsManager {
  constructor(initialPresets = []) {
    this.presets = Array.isArray(initialPresets)
      ? initialPresets.filter(p => p && typeof p === 'object').slice(0, MAX_PRESETS)
      : [];
    // 後方互換: id がない旧データには付与
    for (const p of this.presets) {
      if (!p.id) p.id = makeId();
      if (typeof p.name !== 'string') p.name = 'プリセット';
      if (!Array.isArray(p.weaponUids)) p.weaponUids = [null, null, null, null];
      while (p.weaponUids.length < 4) p.weaponUids.push(null);
      p.weaponUids = p.weaponUids.slice(0, 4);
    }
  }

  get list() {
    return this.presets;
  }

  get canAdd() {
    return this.presets.length < MAX_PRESETS;
  }

  get maxPresets() {
    return MAX_PRESETS;
  }

  /** 現在装備中の内容から新規プリセット作成 */
  createFromCurrent(name, current) {
    if (!this.canAdd) return null;
    const preset = {
      id: makeId(),
      name: String(name || `セット${this.presets.length + 1}`).slice(0, 20),
      weaponUids: [0, 1, 2, 3].map(i => current.weaponSlots?.[i]?.uid || null),
      armorUid: current.armor?.uid || null,
      accessoryUid: current.accessory?.uid || null,
    };
    this.presets.push(preset);
    return preset;
  }

  /** 指定プリセットの内容を現装備で上書き */
  overwrite(id, current) {
    const p = this.presets.find(x => x.id === id);
    if (!p) return false;
    p.weaponUids = [0, 1, 2, 3].map(i => current.weaponSlots?.[i]?.uid || null);
    p.armorUid = current.armor?.uid || null;
    p.accessoryUid = current.accessory?.uid || null;
    return true;
  }

  rename(id, newName) {
    const p = this.presets.find(x => x.id === id);
    if (!p) return false;
    p.name = String(newName || '').slice(0, 20) || 'プリセット';
    return true;
  }

  remove(id) {
    const idx = this.presets.findIndex(x => x.id === id);
    if (idx < 0) return false;
    this.presets.splice(idx, 1);
    return true;
  }

  /**
   * プリセット適用。 UID から inventory を引いて実アイテム配列に解決。
   * 失われた UID は null として返し、欠損数も含めて返す。
   * @returns {{weaponSlots, armor, accessory, missingCount}} 失われたUID数
   */
  resolve(id, inventory) {
    const p = this.presets.find(x => x.id === id);
    if (!p) return null;
    let missingCount = 0;
    const resolveUid = (uid) => {
      if (!uid) return null;
      const item = inventory.getItemByUid?.(uid);
      if (!item) { missingCount++; return null; }
      return item;
    };
    return {
      weaponSlots: p.weaponUids.map(resolveUid),
      armor: resolveUid(p.armorUid),
      accessory: resolveUid(p.accessoryUid),
      missingCount,
    };
  }

  /**
   * プリセット内の消失 UID を静かにクリーンアップ (在庫変更通知時)。
   * @param {Set<string>} removedUids
   */
  cleanupRemovedUids(removedUids) {
    if (!removedUids || removedUids.size === 0) return;
    for (const p of this.presets) {
      p.weaponUids = p.weaponUids.map(u => (u && removedUids.has(u)) ? null : u);
      if (p.armorUid && removedUids.has(p.armorUid)) p.armorUid = null;
      if (p.accessoryUid && removedUids.has(p.accessoryUid)) p.accessoryUid = null;
    }
  }

  /** セーブデータ用にプレーンな配列を返す */
  toJSON() {
    return this.presets.map(p => ({
      id: p.id,
      name: p.name,
      weaponUids: [...p.weaponUids],
      armorUid: p.armorUid,
      accessoryUid: p.accessoryUid,
    }));
  }
}
