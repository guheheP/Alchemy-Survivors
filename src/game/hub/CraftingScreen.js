/**
 * CraftingScreen — 簡易クラフトUI（パズルなし）
 */

import { ItemBlueprints, Recipes, TraitDefs, MaterialCategories } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { craftItem, isCategorySlot, getCategoryId, materialMatchesSlot } from '../ItemSystem.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';

export class CraftingScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'craft-screen';
    this.selectedRecipeId = null;
    this.assignedMaterials = []; // index corresponds to recipe.materials slot
    this.selectedTraits = [];
  }

  render() {
    this.el.innerHTML = `
      <div class="craft-layout">
        <div class="craft-recipes">
          <h3>レシピ一覧</h3>
          <div class="craft-filter">
            <button class="filter-btn active" data-filter="all">全て</button>
            <button class="filter-btn" data-filter="equipment">装備</button>
            <button class="filter-btn" data-filter="consumable">消耗品</button>
            <button class="filter-btn" data-filter="accessory">アクセサリ</button>
            <button class="filter-btn" data-filter="material">素材</button>
          </div>
          <div class="recipe-list" id="recipe-list"></div>
        </div>
        <div class="craft-workspace">
          <div class="craft-detail" id="craft-detail">
            <p class="craft-placeholder">← レシピを選択してください</p>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    // フィルターボタン
    this.el.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderRecipeList(btn.dataset.filter);
      });
    });

    this._renderRecipeList('all');
    return this.el;
  }

  _renderRecipeList(filter) {
    const listEl = this.el.querySelector('#recipe-list');
    listEl.innerHTML = '';

    for (const [id, recipe] of Object.entries(Recipes)) {
      if (!recipe.unlocked) continue;
      const bp = ItemBlueprints[recipe.targetId];
      if (!bp) continue;
      if (filter !== 'all' && bp.type !== filter) continue;

      const card = document.createElement('div');
      card.className = 'recipe-card' + (id === this.selectedRecipeId ? ' selected' : '');
      card.innerHTML = `
        <img src="${bp.image ? assetPath(bp.image) : ''}" class="recipe-icon" onerror="this.style.display='none'" alt="">
        <div class="recipe-info">
          <span class="recipe-name">${bp.name}</span>
          <span class="recipe-mats">${recipe.materials.length}素材</span>
        </div>
      `;
      card.addEventListener('click', () => this._selectRecipe(id));
      listEl.appendChild(card);
    }
  }

  _selectRecipe(recipeId) {
    this.selectedRecipeId = recipeId;
    this.assignedMaterials = [];
    this.selectedTraits = [];

    // リスト更新
    this.el.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('selected'));
    const cards = this.el.querySelectorAll('.recipe-card');
    const idx = Object.keys(Recipes).filter(k => Recipes[k].unlocked).indexOf(recipeId);
    if (cards[idx]) cards[idx].classList.add('selected');

    this._renderWorkspace();
  }

  _renderWorkspace() {
    const detail = this.el.querySelector('#craft-detail');
    const recipe = Recipes[this.selectedRecipeId];
    const bp = ItemBlueprints[recipe.targetId];

    // 素材スロット初期化
    if (this.assignedMaterials.length !== recipe.materials.length) {
      this.assignedMaterials = new Array(recipe.materials.length).fill(null);
    }

    detail.innerHTML = `
      <h3>${bp.name}</h3>
      <div class="craft-slots">
        <h4>素材スロット</h4>
        ${recipe.materials.map((slot, i) => {
          const assigned = this.assignedMaterials[i];
          const slotLabel = isCategorySlot(slot)
            ? (MaterialCategories[getCategoryId(slot)]?.name || slot)
            : (ItemBlueprints[slot]?.name || slot);
          return `<div class="craft-slot" data-slot="${i}">
            <span class="slot-label">${slotLabel}</span>
            ${assigned
              ? `<div class="slot-assigned">
                  <span>${assigned.name} (Q${assigned.quality})</span>
                  <button class="slot-clear" data-slot="${i}">✕</button>
                </div>`
              : `<button class="slot-select" data-slot="${i}">素材を選択</button>`
            }
          </div>`;
        }).join('')}
      </div>
      <div class="craft-traits" id="craft-traits"></div>
      <button class="craft-btn" id="craft-execute" ${this._canCraft() ? '' : 'disabled'}>
        調合する
      </button>
    `;

    // 素材選択ボタン
    detail.querySelectorAll('.slot-select').forEach(btn => {
      btn.addEventListener('click', () => this._openMaterialPicker(parseInt(btn.dataset.slot)));
    });

    // 素材クリアボタン
    detail.querySelectorAll('.slot-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        this.assignedMaterials[parseInt(btn.dataset.slot)] = null;
        this._renderWorkspace();
      });
    });

    // 調合ボタン
    detail.querySelector('#craft-execute').addEventListener('click', () => this._executeCraft());

    // 特性表示
    this._renderTraits();
  }

  _openMaterialPicker(slotIndex) {
    const recipe = Recipes[this.selectedRecipeId];
    const slot = recipe.materials[slotIndex];
    const usedUids = new Set(this.assignedMaterials.filter(m => m).map(m => m.uid));

    // 対象素材を絞り込み
    const candidates = this.inventory.getItemsByType('material').filter(item => {
      if (usedUids.has(item.uid)) return false;
      return materialMatchesSlot(item.blueprintId, slot);
    });

    // 簡易ピッカーモーダル
    const picker = document.createElement('div');
    picker.className = 'material-picker-overlay';
    picker.innerHTML = `
      <div class="material-picker">
        <h4>素材を選択</h4>
        <div class="picker-list">
          ${candidates.length === 0 ? '<p class="picker-empty">対応する素材がありません</p>' :
            candidates.map(item => `
              <div class="picker-item" data-uid="${item.uid}">
                <span class="picker-name">${item.name}</span>
                <span class="picker-quality">Q${item.quality}</span>
                ${item.traits.length > 0 ? `<span class="picker-traits">${item.traits.join(', ')}</span>` : ''}
              </div>
            `).join('')}
        </div>
        <button class="picker-cancel">キャンセル</button>
      </div>
    `;
    this.el.appendChild(picker);

    picker.querySelector('.picker-cancel').addEventListener('click', () => picker.remove());
    picker.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid;
        const item = this.inventory.getItemByUid(uid);
        if (item) {
          this.assignedMaterials[slotIndex] = item;
          picker.remove();
          this._renderWorkspace();
        }
      });
    });
  }

  _renderTraits() {
    const traitsEl = this.el.querySelector('#craft-traits');
    if (!traitsEl) return;

    // 素材から利用可能な特性を収集
    const traitSet = new Set();
    for (const mat of this.assignedMaterials) {
      if (mat && mat.traits) {
        mat.traits.forEach(t => traitSet.add(t));
      }
    }

    if (traitSet.size === 0) {
      traitsEl.innerHTML = '';
      return;
    }

    traitsEl.innerHTML = `
      <h4>引き継ぎ特性（${GameConfig.maxTraitSlots}枠まで）</h4>
      <div class="trait-list">
        ${[...traitSet].map(t => {
          const def = TraitDefs[t];
          const selected = this.selectedTraits.includes(t);
          return `<button class="trait-toggle ${selected ? 'selected' : ''} rarity-${def?.rarity || 'common'}"
                    data-trait="${t}" ${this.selectedTraits.length >= GameConfig.maxTraitSlots && !selected ? 'disabled' : ''}>
            ${t}
          </button>`;
        }).join('')}
      </div>
    `;

    traitsEl.querySelectorAll('.trait-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const trait = btn.dataset.trait;
        const idx = this.selectedTraits.indexOf(trait);
        if (idx >= 0) {
          this.selectedTraits.splice(idx, 1);
        } else if (this.selectedTraits.length < GameConfig.maxTraitSlots) {
          this.selectedTraits.push(trait);
        }
        this._renderWorkspace();
      });
    });
  }

  _canCraft() {
    if (!this.selectedRecipeId) return false;
    const recipe = Recipes[this.selectedRecipeId];
    return this.assignedMaterials.length === recipe.materials.length &&
           this.assignedMaterials.every(m => m !== null);
  }

  _executeCraft() {
    if (!this._canCraft()) return;

    try {
      const item = craftItem(this.selectedRecipeId, this.assignedMaterials, this.selectedTraits, 0);

      // 素材をインベントリから消費
      for (const mat of this.assignedMaterials) {
        this.inventory.removeItem(mat.uid, true);
      }

      // 完成品をインベントリに追加
      this.inventory.addItem(item);

      eventBus.emit('toast', { message: `✨ ${item.name} (Q${item.quality}) を調合しました！`, type: 'success' });

      // リセット
      this.assignedMaterials = [];
      this.selectedTraits = [];
      this._renderWorkspace();
      this._renderRecipeList(this.el.querySelector('.filter-btn.active')?.dataset.filter || 'all');
    } catch (err) {
      eventBus.emit('toast', { message: `調合失敗: ${err.message}`, type: 'error' });
    }
  }

  destroy() {
    this.el.remove();
  }
}
