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

      const craftable = this._hasEnoughMaterials(recipe);
      const card = document.createElement('div');
      card.className = 'recipe-card' + (id === this.selectedRecipeId ? ' selected' : '') + (craftable ? '' : ' unavailable');
      card.innerHTML = `
        <img src="${bp.image ? assetPath(bp.image) : ''}" class="recipe-icon" onerror="this.style.display='none'" alt="">
        <div class="recipe-info">
          <span class="recipe-name">${bp.name}</span>
          <span class="recipe-mats">${recipe.materials.length}素材${craftable ? '' : ' <span class="recipe-lacking">不足</span>'}</span>
        </div>
      `;
      card.addEventListener('click', () => this._selectRecipe(id));
      listEl.appendChild(card);
    }
  }

  /** レシピに必要な素材が全て揃っているか判定 */
  _hasEnoughMaterials(recipe) {
    const available = this.inventory.getItemsByType('material');
    const used = new Set();
    for (const slot of recipe.materials) {
      let found = false;
      for (const item of available) {
        if (used.has(item.uid)) continue;
        if (materialMatchesSlot(item.blueprintId, slot)) {
          used.add(item.uid);
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
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

    // 消耗品の効果説明
    let effectHtml = '';
    if (bp.battleEffect) {
      effectHtml = `<div class="craft-effect-info">${this._describeBattleEffect(bp.battleEffect)}</div>`;
    }

    detail.innerHTML = `
      <h3>${bp.name}</h3>
      ${effectHtml}
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
      <div class="craft-preview" id="craft-preview"></div>
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
    this._renderPreview();
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
          const runFx = this._getTraitRunEffects(def);
          return `<div class="trait-item-wrap">
            <button class="trait-toggle ${selected ? 'selected' : ''} rarity-${def?.rarity || 'common'}"
                    data-trait="${t}" ${this.selectedTraits.length >= GameConfig.maxTraitSlots && !selected ? 'disabled' : ''}>
              ${t}
            </button>
            <div class="trait-tooltip">
              <span class="trait-tt-name rarity-${def?.rarity || 'common'}">${t}</span>
              <span class="trait-tt-rarity">${def?.rarity || ''}</span>
              <p class="trait-tt-desc">${def?.description || ''}</p>
              ${runFx ? `<p class="trait-tt-run">${runFx}</p>` : ''}
            </div>
          </div>`;
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

  _renderPreview() {
    const preview = this.el.querySelector('#craft-preview');
    if (!preview || !this._canCraft()) {
      if (preview) preview.innerHTML = '';
      return;
    }

    const recipe = Recipes[this.selectedRecipeId];
    const bp = ItemBlueprints[recipe.targetId];

    // 品質予測
    const totalQ = this.assignedMaterials.reduce((sum, m) => sum + (m?.quality || 0), 0);
    const avgQ = this.assignedMaterials.length > 0 ? Math.floor(totalQ / this.assignedMaterials.length) : 0;

    let html = `<h4>完成品プレビュー</h4>`;
    html += `<div class="preview-stats">`;
    html += `<div class="preview-row"><span>予測品質:</span><span class="preview-val">Q${avgQ}</span></div>`;

    if (bp.type === 'equipment' && bp.equipType) {
      const wc = GameConfig.weapon;
      const dmg = (bp.baseValue / wc.damageBaseDivisor + avgQ / wc.damageQualityDivisor).toFixed(1);
      const spd = (wc.speedBase + avgQ / wc.speedQualityDivisor).toFixed(2);
      const typeConfig = GameConfig.weaponTypes[bp.equipType];
      if (typeConfig) {
        const range = (typeConfig.baseRange * (1 + avgQ / wc.rangeQualityDivisor)).toFixed(0);
        html += `<div class="preview-row"><span>攻撃力:</span><span class="preview-val">${dmg}</span></div>`;
        html += `<div class="preview-row"><span>攻撃速度:</span><span class="preview-val">${spd}x</span></div>`;
        html += `<div class="preview-row"><span>射程:</span><span class="preview-val">${range}px</span></div>`;
        html += `<div class="preview-row"><span>パターン:</span><span class="preview-val">${this._getPatternName(bp.equipType)}</span></div>`;
      }
    } else if (bp.type === 'accessory') {
      const spdBonus = (bp.baseValue / 500 + avgQ / 1000);
      html += `<div class="preview-row"><span>移動速度:</span><span class="preview-val">+${(spdBonus * 100).toFixed(1)}%</span></div>`;
    }

    // 選択中特性のラン効果
    if (this.selectedTraits.length > 0) {
      html += `<div class="preview-traits-section"><h5>特性のラン効果</h5>`;
      for (const t of this.selectedTraits) {
        const def = TraitDefs[t];
        if (!def?.effects) continue;
        const runEffects = [];
        for (const [key, val] of Object.entries(def.effects)) {
          if (key.startsWith('run')) {
            const label = {
              runDamageFlat: 'ダメージ', runDamageReduction: '軽減',
              runMaxHpFlat: 'HP', runMoveSpeed: '速度', runRegenPerSec: '回復/秒',
              runDodge: '回避', runDropRate: 'ドロップ率', runAttackSpeed: '攻速',
              runExpBonus: '経験値', runStartInvincible: '開始無敵',
            }[key] || key;
            runEffects.push(`${label}+${typeof val === 'number' && val < 1 ? (val * 100).toFixed(0) + '%' : val}`);
          }
        }
        if (runEffects.length > 0) {
          html += `<div class="preview-trait-fx"><span class="rarity-${def.rarity}">${t}</span>: ${runEffects.join(', ')}</div>`;
        }
      }
      html += `</div>`;
    }

    html += `</div>`;
    preview.innerHTML = html;
  }

  _getPatternName(equipType) {
    const names = { sword: '回転斬り（前方弧+360°交互）', spear: '長距離貫通突き', bow: '追尾矢', staff: '周回オーブ', dagger: '3方向乱舞斬り', shield: '守護波動+自動反撃' };
    return names[equipType] || equipType;
  }

  _getTraitRunEffects(def) {
    if (!def?.effects) return '';
    const labels = {
      runDamageFlat: 'ダメージ', runDamageReduction: '軽減', runMaxHpFlat: 'HP',
      runMoveSpeed: '速度', runRegenPerSec: '回復/秒', runDodge: '回避',
      runDropRate: 'ドロップ率', runAttackSpeed: '攻速', runExpBonus: '経験値',
      runStartInvincible: '開始無敵(秒)',
    };
    const parts = [];
    for (const [key, val] of Object.entries(def.effects)) {
      if (key.startsWith('run') && labels[key]) {
        const display = typeof val === 'number' && val < 1 && val > 0
          ? `+${(val * 100).toFixed(0)}%` : `+${val}`;
        parts.push(`${labels[key]}${display}`);
      }
    }
    return parts.length > 0 ? `ラン効果: ${parts.join(', ')}` : '';
  }

  _describeBattleEffect(fx) {
    const statNames = { atk: '攻撃力', def: '防御力', spd: '速度' };
    switch (fx.type) {
      case 'heal': return `💚 HP ${fx.value} 回復`;
      case 'healfull': return `💚 HP全回復`;
      case 'buff': return `⬆️ ${statNames[fx.stat] || fx.stat}+${fx.amount} (${fx.duration}秒)`;
      case 'debuff': return `⬇️ 敵の${statNames[fx.stat] || fx.stat}${fx.amount} (${fx.duration}秒)`;
      case 'damage': return `💥 周囲にダメージ ${fx.value}`;
      case 'stun': return `⚡ 周囲の敵をスタン (${fx.duration}秒)`;
      default: return `使用効果あり`;
    }
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
