/**
 * CraftingScreen — 簡易クラフトUI（パズルなし）
 */

import { ItemBlueprints, Recipes, TraitDefs, TraitFusionTable, MaterialCategories } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { WeaponSkillDefs } from '../data/weaponSkills.js';
import { craftItem, isCategorySlot, getCategoryId, materialMatchesSlot, getCurrentQualityCap } from '../ItemSystem.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';
import { createElementBadgeHTML } from '../ui/UIHelpers.js';
import { fmt1, fmtPct1, fmtInt } from '../ui/NumberFormat.js';
import { resolveTieredEffects } from '../run/ConsumableSystem.js';

export class CraftingScreen {
  constructor(container, inventorySystem, options = {}) {
    this.container = container;
    this.inventory = inventorySystem;
    this.getEquipment = options.getEquipment || (() => ({ weaponSlots: [], armor: null, accessory: null }));
    this.el = document.createElement('div');
    this.el.className = 'craft-screen';
    this.selectedRecipeId = null;
    this.assignedMaterials = []; // index corresponds to recipe.materials slot
    this.selectedTraits = [];
    this.typeFilter = 'all';
    this.craftableOnly = false;
    this.searchText = '';
  }

  render() {
    this.el.innerHTML = `
      <div class="craft-layout">
        <div class="craft-recipes">
          <h3>レシピ一覧 <span class="recipe-count" id="recipe-count"></span></h3>
          <div class="craft-search">
            <input type="text" class="recipe-search-input" id="recipe-search" placeholder="🔍 レシピ名で検索" />
          </div>
          <div class="craft-filter">
            <button class="filter-btn active" data-filter="all">全て</button>
            <button class="filter-btn" data-filter="equipment">装備</button>
            <button class="filter-btn" data-filter="consumable">消耗品</button>
            <button class="filter-btn" data-filter="accessory">アクセサリ</button>
            <button class="filter-btn" data-filter="material">素材</button>
          </div>
          <div class="craft-filter-toggles">
            <label class="craftable-toggle">
              <input type="checkbox" id="craftable-only" />
              <span>作成可能のみ</span>
            </label>
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

    // タイプフィルタ
    this.el.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.typeFilter = btn.dataset.filter;
        this._renderRecipeList();
      });
    });

    // 作成可能のみトグル
    const craftableToggle = this.el.querySelector('#craftable-only');
    craftableToggle.addEventListener('change', (e) => {
      this.craftableOnly = e.target.checked;
      this._renderRecipeList();
    });

    // 検索
    const searchInput = this.el.querySelector('#recipe-search');
    searchInput.addEventListener('input', (e) => {
      this.searchText = e.target.value.trim().toLowerCase();
      this._renderRecipeList();
    });

    this._renderRecipeList();
    return this.el;
  }

  _renderRecipeList() {
    const listEl = this.el.querySelector('#recipe-list');
    const countEl = this.el.querySelector('#recipe-count');
    listEl.innerHTML = '';

    let shown = 0;
    let total = 0;
    for (const [id, recipe] of Object.entries(Recipes)) {
      if (!recipe.unlocked) continue;
      const bp = ItemBlueprints[recipe.targetId];
      if (!bp) continue;
      total++;
      if (this.typeFilter !== 'all' && bp.type !== this.typeFilter) continue;
      if (this.searchText && !bp.name.toLowerCase().includes(this.searchText)) continue;

      const craftable = this._hasEnoughMaterials(recipe);
      if (this.craftableOnly && !craftable) continue;

      const card = document.createElement('div');
      card.className = 'recipe-card' + (id === this.selectedRecipeId ? ' selected' : '') + (craftable ? '' : ' unavailable');
      card.innerHTML = `
        <img src="${bp.image ? assetPath(bp.image) : ''}" class="recipe-icon" onerror="this.style.display='none'" alt="">
        <div class="recipe-info">
          <span class="recipe-name">${bp.name}</span>
          <span class="recipe-mats">${createElementBadgeHTML(bp.element)}${recipe.materials.length}素材${craftable ? '' : ' <span class="recipe-lacking">不足</span>'}</span>
        </div>
      `;
      card.addEventListener('click', () => this._selectRecipe(id));
      listEl.appendChild(card);
      shown++;
    }

    if (countEl) countEl.textContent = `${shown} / ${total}`;
    if (shown === 0) {
      listEl.innerHTML = '<p class="recipe-empty">該当するレシピがありません</p>';
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

    // 最高品質の素材で自動充填
    this._autoFillBestMaterials();

    // 選択状態の更新（再描画ではなくクラス付け替え）
    this.el.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('selected'));
    const cards = this.el.querySelectorAll('.recipe-card');
    cards.forEach(card => {
      const name = card.querySelector('.recipe-name')?.textContent;
      const bp = ItemBlueprints[Recipes[recipeId]?.targetId];
      if (bp && name === bp.name) card.classList.add('selected');
    });

    this._renderWorkspace();

    // モバイル: レシピリストの下に workspace が現れるので末尾まで自動スクロール
    this._scrollWorkspaceToBottomMobile();
  }

  /**
   * 選択中レシピの各スロットに、手持ち最高品質の素材を自動割り当て。
   * スロット順に、未使用素材からマッチする最高品質を選ぶ (greedy)。
   * 特性レアリティをサブキーにし、高レアを優先。
   */
  _autoFillBestMaterials() {
    const recipe = Recipes[this.selectedRecipeId];
    if (!recipe) return;

    const available = this.inventory.getItemsByType('material');
    const used = new Set();
    const rarityScore = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
    const traitScore = (item) => {
      if (!item.traits || item.traits.length === 0) return 0;
      let max = 0;
      for (const t of item.traits) {
        const r = TraitDefs[t]?.rarity;
        if (r && rarityScore[r] > max) max = rarityScore[r];
      }
      return max;
    };

    this.assignedMaterials = recipe.materials.map(slot => {
      const candidates = available
        .filter(item => !used.has(item.uid) && materialMatchesSlot(item.blueprintId, slot))
        .sort((a, b) => (b.quality - a.quality) || (traitScore(b) - traitScore(a)));
      const best = candidates[0];
      if (best) {
        used.add(best.uid);
        return best;
      }
      return null;
    });
  }

  /** モバイル時に .craft-workspace の末尾までスクロール (デスクトップは無効) */
  _scrollWorkspaceToBottomMobile() {
    if (!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches)) return;
    requestAnimationFrame(() => {
      const workspace = this.el.querySelector('.craft-workspace');
      if (workspace && typeof workspace.scrollIntoView === 'function') {
        workspace.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      // フォールバック: 内側スクロールコンテナ (.hub-content) を末尾へ
      const hubContent = document.querySelector('.hub-content');
      if (hubContent) {
        hubContent.scrollTo({ top: hubContent.scrollHeight, behavior: 'smooth' });
      }
    });
  }

  _renderWorkspace() {
    const detail = this.el.querySelector('#craft-detail');
    const recipe = Recipes[this.selectedRecipeId];
    const bp = ItemBlueprints[recipe.targetId];

    // 素材スロット初期化（自動充填で既に埋まっているはず）
    if (this.assignedMaterials.length !== recipe.materials.length) {
      this.assignedMaterials = new Array(recipe.materials.length).fill(null);
    }

    // 消耗品の効果説明
    let effectHtml = '';
    if (bp.battleEffect) {
      effectHtml = `<div class="craft-effect-info">${this._describeBattleEffect(bp.battleEffect)}</div>`;
    }

    // プレビュー結果（中央表示用の予測品質）
    const previewResult = this._canCraft() ? this._computePreviewResult() : null;
    const centerQ = previewResult?.finalQ;
    const n = recipe.materials.length;

    detail.innerHTML = `
      <h3 class="craft-heading">${bp.name}</h3>
      ${effectHtml}
      <div class="craft-grid">
      <div class="craft-grid-left">
      <div class="craft-slots craft-circle-stage" style="--n: ${n};" id="craft-stage">
        <div class="craft-circle-center result-card" aria-hidden="true">
          <div class="result-card-icon-wrap">
            ${bp.image ? `<img class="result-card-icon" src="${assetPath(bp.image)}" alt="" onerror="this.style.display='none'">` : '<span class="result-card-fallback">✦</span>'}
          </div>
          <div class="result-card-body">
            <div class="result-card-name">${bp.name}</div>
            ${centerQ != null
              ? `<div class="result-card-quality">◆ Q${centerQ}</div>`
              : '<div class="result-card-quality placeholder">◆ Q?</div>'
            }
          </div>
        </div>
        ${recipe.materials.map((slot, i) => {
          const assigned = this.assignedMaterials[i];
          const isCategory = isCategorySlot(slot);
          const slotLabel = isCategory
            ? (MaterialCategories[getCategoryId(slot)]?.name || slot)
            : (ItemBlueprints[slot]?.name || slot);
          // アイコン解決: 割当済みなら素材画像、未割当でカテゴリスロットならemoji、特定素材指定なら素材画像
          const assignedBp = assigned ? ItemBlueprints[assigned.blueprintId] : null;
          const assignedImg = assignedBp?.image ? assetPath(assignedBp.image) : null;
          const categoryIcon = isCategory ? (MaterialCategories[getCategoryId(slot)]?.icon || '❖') : '';
          const specificBp = !isCategory ? ItemBlueprints[slot] : null;
          const specificImg = specificBp?.image ? assetPath(specificBp.image) : null;
          const rarityTop = assigned
            ? (() => {
                const order = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
                let best = 'common';
                for (const t of (assigned.traits || [])) {
                  const r = TraitDefs[t]?.rarity;
                  if (r && order[r] > order[best]) best = r;
                }
                return best;
              })()
            : null;
          const iconHtml = assignedImg
            ? `<img class="slot-icon" src="${assignedImg}" alt="" onerror="this.style.display='none'">`
            : specificImg
              ? `<img class="slot-icon slot-icon-ghost" src="${specificImg}" alt="" onerror="this.style.display='none'">`
              : `<span class="slot-icon slot-icon-emoji">${categoryIcon}</span>`;
          // n=2 は左右に、n>=3 は先頭を真上に配置して放射状に
          const offsetDeg = n === 2 ? -90 : 0;
          const angleDeg = (360 / n) * i + offsetDeg;
          const filledCls = assigned ? ' is-filled' : ' is-empty';
          const rarityCls = rarityTop ? ` slot-rarity-${rarityTop}` : '';
          return `<button class="craft-slot slot-select${filledCls}${rarityCls}" data-slot="${i}"
                          style="--i: ${i}; --n: ${n}; --angle: ${angleDeg}deg;"
                          title="${assigned ? 'クリックで変更' : slotLabel + 'を選択'}">
            <div class="slot-icon-wrap">
              ${iconHtml}
              ${assigned ? `<span class="slot-clear" data-slot="${i}" role="button" title="クリアする">✕</span>` : ''}
            </div>
            <div class="slot-body">
              ${assigned
                ? `<span class="slot-name">${assigned.name}</span>
                   <span class="slot-q">Q${assigned.quality}</span>`
                : `<span class="slot-label">${slotLabel}</span>
                   <span class="slot-hint">未装填</span>`
              }
            </div>
          </button>`;
        }).join('')}
      </div>
      </div><!-- /.craft-grid-left -->
      <div class="craft-grid-right">
        <div class="craft-traits" id="craft-traits"></div>
        <div class="craft-preview" id="craft-preview"></div>
      </div>
      </div><!-- /.craft-grid -->
      ${this._renderCapacityWarning()}
      <button class="craft-btn" id="craft-execute" ${this._canCraft() ? '' : 'disabled'}>
        調合する
      </button>
    `;

    // 素材選択ボタン (未選択スロット / 選択済スロットの本体どちらも再選択可)
    detail.querySelectorAll('.slot-select').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // クリア (✕) クリックは伝播させて別ハンドラで処理
        if (e.target.closest('.slot-clear')) return;
        this._openMaterialPicker(parseInt(btn.dataset.slot));
      });
    });

    // 素材クリア (✕) — 親の .slot-select への伝播を止める
    detail.querySelectorAll('.slot-clear').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
    // 現在のスロットに入っている素材は「使用中」から除外（入れ替えを許可）
    const usedUids = new Set(
      this.assignedMaterials
        .filter((m, idx) => m && idx !== slotIndex)
        .map(m => m.uid)
    );

    // 対象素材を絞り込み + 品質降順ソート + 特性レアリティ降順
    const rarityScore = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
    const traitScore = (item) => {
      if (!item.traits || item.traits.length === 0) return 0;
      let max = 0;
      for (const t of item.traits) {
        const r = TraitDefs[t]?.rarity;
        if (r && rarityScore[r] > max) max = rarityScore[r];
      }
      return max;
    };
    const candidates = this.inventory.getItemsByType('material')
      .filter(item => {
        if (usedUids.has(item.uid)) return false;
        return materialMatchesSlot(item.blueprintId, slot);
      })
      .sort((a, b) => (b.quality - a.quality) || (traitScore(b) - traitScore(a)));

    // 簡易ピッカーモーダル
    const picker = document.createElement('div');
    picker.className = 'material-picker-overlay';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-modal', 'true');
    picker.setAttribute('aria-label', '素材を選択');
    picker.innerHTML = `
      <div class="material-picker">
        <h4>素材を選択（品質順）</h4>
        <div class="picker-list">
          ${candidates.length === 0 ? '<p class="picker-empty">対応する素材がありません</p>' :
            candidates.map(item => {
              const traitBadges = (item.traits || []).map(t => {
                const r = TraitDefs[t]?.rarity || 'common';
                return `<span class="picker-trait-badge rarity-${r}" title="${t}">${t}</span>`;
              }).join('');
              return `
                <div class="picker-item" data-uid="${item.uid}">
                  <span class="picker-name">${item.name}</span>
                  <span class="picker-quality">Q${item.quality}</span>
                  ${traitBadges ? `<span class="picker-traits">${traitBadges}</span>` : ''}
                </div>
              `;
            }).join('')}
        </div>
        <button class="picker-cancel">キャンセル</button>
      </div>
    `;
    this.el.appendChild(picker);

    const closePicker = () => {
      if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
      picker.remove();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    };
    window.addEventListener('keydown', onKeyDown);
    // バックドロップクリックで閉じる
    picker.addEventListener('click', (e) => {
      if (e.target === picker) closePicker();
    });
    picker.querySelector('.picker-cancel').addEventListener('click', closePicker);
    picker.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid;
        const item = this.inventory.getItemByUid(uid);
        if (item) {
          this.assignedMaterials[slotIndex] = item;
          closePicker();
          this._renderWorkspace();
          // 全スロットが埋まったらモバイルで末尾(調合ボタン)までスクロール
          const allFilled = this.assignedMaterials.length > 0
            && this.assignedMaterials.every(m => m != null);
          if (allFilled) this._scrollWorkspaceToBottomMobile();
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

    // 素材入れ替えで消えた特性を除去し、空き枠があればレアリティ順に自動補充
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    this.selectedTraits = this.selectedTraits.filter(t => traitSet.has(t));
    if (this.selectedTraits.length < GameConfig.maxTraitSlots) {
      const prioritized = [...traitSet]
        .filter(t => !this.selectedTraits.includes(t))
        .sort((a, b) => {
          const ra = rarityOrder[TraitDefs[a]?.rarity] ?? 5;
          const rb = rarityOrder[TraitDefs[b]?.rarity] ?? 5;
          return ra - rb;
        });
      for (const t of prioritized) {
        if (this.selectedTraits.length >= GameConfig.maxTraitSlots) break;
        this.selectedTraits.push(t);
      }
    }

    const fusionMap = this._computeFusionMap();

    traitsEl.innerHTML = `
      <h4>引き継ぎ特性（${GameConfig.maxTraitSlots}枠まで）</h4>
      <div class="trait-list">
        ${[...traitSet].map(t => {
          const def = TraitDefs[t];
          const selected = this.selectedTraits.includes(t);
          const runFx = this._getTraitRunEffects(def);
          const fusedTo = fusionMap[t];
          const fusedDef = fusedTo ? TraitDefs[fusedTo] : null;
          return `<div class="trait-item-wrap">
            <button class="trait-toggle ${selected ? 'selected' : ''} ${fusedTo ? 'will-fuse' : ''} rarity-${def?.rarity || 'common'}"
                    data-trait="${t}" ${this.selectedTraits.length >= GameConfig.maxTraitSlots && !selected ? 'disabled' : ''}>
              <span class="trait-name">${t}</span>
              ${fusedTo ? `<span class="trait-fuse-arrow" title="融合で${fusedTo}へ昇格">✨→<span class="rarity-${fusedDef?.rarity || 'common'}">${fusedTo}</span></span>` : ''}
            </button>
            <div class="trait-tooltip">
              <span class="trait-tt-name rarity-${def?.rarity || 'common'}">${t}</span>
              <span class="trait-tt-rarity">${def?.rarity || ''}</span>
              <p class="trait-tt-desc">${def?.description || ''}</p>
              ${runFx ? `<p class="trait-tt-run">${runFx}</p>` : ''}
              ${fusedTo && fusedDef ? `<p class="trait-tt-fuse">✨ 融合: <span class="rarity-${fusedDef.rarity}">${fusedTo}</span> — ${fusedDef.description || ''}</p>` : ''}
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
    const pr = this._computePreviewResult();
    if (!pr) { preview.innerHTML = ''; return; }
    const { finalQ, fusionMap, finalTraits, capped } = pr;

    let html = `<h4>完成品プレビュー</h4>`;
    html += `<div class="preview-stats">`;
    html += `<div class="preview-row"><span>予測品質:</span><span class="preview-val">Q${finalQ}${capped ? ' <span class="preview-cap-badge">上限</span>' : ''}</span></div>`;

    if (bp.type === 'equipment' && bp.equipType === 'shield') {
      // 盾は武器スロット・防具スロットどちらにも装備可能なので両方のステータスを表示
      html += this._renderShieldDualPreview(bp, finalQ, recipe.targetId);
    } else if (bp.type === 'equipment' && this._isWeaponType(bp.equipType)) {
      const wc = GameConfig.weapon;
      // 実挙動と整合: baseDamageMultiplier と 無属性(+25%) を反映
      const dmgMult = bp.baseDamageMultiplier || 1.0;
      let dmg = (bp.baseValue / wc.damageBaseDivisor + finalQ / wc.damageQualityDivisor) * dmgMult;
      if (bp.element === 'none') dmg *= 1.25;
      const spd = wc.speedBase + finalQ / wc.speedQualityDivisor;
      const typeConfig = GameConfig.weaponTypes[bp.equipType];
      if (typeConfig) {
        const range = typeConfig.baseRange * (1 + finalQ / wc.rangeQualityDivisor);
        const cmp = this._compareWithEquipped(bp, { dmg, spd, range });
        html += `<div class="preview-row"><span>攻撃力:</span><span class="preview-val">${fmt1(dmg)}${cmp.dmg}</span></div>`;
        html += `<div class="preview-row"><span>攻撃速度:</span><span class="preview-val">${fmt1(spd)}x${cmp.spd}</span></div>`;
        html += `<div class="preview-row"><span>射程:</span><span class="preview-val">${fmtInt(range)}px${cmp.range}</span></div>`;
        html += `<div class="preview-row"><span>パターン:</span><span class="preview-val">${this._getPatternName(bp.equipType)}</span></div>`;
        if (cmp.label) html += `<div class="preview-compare">${cmp.label}</div>`;
        const skillInfo = this._getSkillInfo(bp.equipType, bp.baseValue, recipe.targetId);
        if (skillInfo) {
          html += `<div class="preview-row preview-skill"><span>スキル:</span><span class="preview-val">${skillInfo.name}</span></div>`;
          html += `<div class="preview-row"><span></span><span class="preview-skill-desc">${skillInfo.desc}（CD ${skillInfo.cd}秒）</span></div>`;
        }
      }
    } else if (bp.type === 'equipment' && this._isArmorType(bp.equipType)) {
      const defVal = bp.baseValue / 12 + finalQ / 8;
      const hpBonus = finalQ * 0.5;
      const cmp = this._compareArmor({ def: defVal, hp: hpBonus });
      html += `<div class="preview-row"><span>防御値:</span><span class="preview-val">+${fmt1(defVal)}${cmp.def}</span></div>`;
      html += `<div class="preview-row"><span>最大HP:</span><span class="preview-val">+${fmtInt(hpBonus)}${cmp.hp}</span></div>`;
      html += `<div class="preview-row"><span>種別:</span><span class="preview-val">${this._getArmorTypeName(bp.equipType)}</span></div>`;
      if (cmp.label) html += `<div class="preview-compare">${cmp.label}</div>`;
    } else if (bp.type === 'accessory') {
      const spdBonus = (bp.baseValue / 2500 + finalQ / 5000);
      const cmp = this._compareAccessory(spdBonus);
      html += `<div class="preview-row"><span>移動速度:</span><span class="preview-val">+${fmtPct1(spdBonus)}%${cmp.spd}</span></div>`;
      if (cmp.label) html += `<div class="preview-compare">${cmp.label}</div>`;
    } else if (bp.type === 'consumable' && bp.battleEffect) {
      html += this._renderConsumablePreview(bp, finalQ, finalTraits);
    }

    // 特性融合プレビュー
    const fusionEntries = Object.entries(fusionMap);
    if (fusionEntries.length > 0) {
      html += `<div class="preview-fusion-section"><h5>✨ 特性融合</h5>`;
      for (const [from, to] of fusionEntries) {
        const defFrom = TraitDefs[from];
        const defTo = TraitDefs[to];
        const fromDesc = defFrom?.description || '';
        const toDesc = defTo?.description || '';
        html += `<div class="preview-fusion-row">
          <span class="fusion-from rarity-${defFrom?.rarity || 'common'}">${from}</span>
          <span class="fusion-arrow">×2 →</span>
          <span class="fusion-to rarity-${defTo?.rarity || 'common'}">${to}</span>
        </div>
        <div class="preview-fusion-desc">${fromDesc} → <span class="rarity-${defTo?.rarity || 'common'}">${toDesc}</span></div>`;
      }
      html += `</div>`;
    }

    // 完成品の最終特性（融合適用後）
    if (finalTraits.length > 0) {
      html += `<div class="preview-traits-section"><h5>完成品の特性 (${finalTraits.length}/${GameConfig.maxTraitSlots})</h5>`;
      for (const t of finalTraits) {
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
              runCritChance: '会心率', runCritDamage: '会心ダメ',
              runElementProc: '属性発動', runElementPower: '属性威力',
            }[key] || key;
            runEffects.push(`${label}+${typeof val === 'number' && val < 1 && val > 0 ? fmtPct1(val) + '%' : fmt1(val)}`);
          }
        }
        if (runEffects.length > 0) {
          html += `<div class="preview-trait-fx"><span class="rarity-${def.rarity}">${t}</span>: ${runEffects.join(', ')}</div>`;
        } else if (def.description) {
          html += `<div class="preview-trait-fx"><span class="rarity-${def.rarity}">${t}</span>: ${def.description}</div>`;
        }
      }
      html += `</div>`;
    }

    html += `</div>`;
    preview.innerHTML = html;
  }

  _isWeaponType(equipType) {
    return ['sword', 'spear', 'bow', 'staff', 'dagger'].includes(equipType);
  }

  _isArmorType(equipType) {
    return ['armor', 'robe', 'shield'].includes(equipType);
  }

  _getArmorTypeName(equipType) {
    return { armor: '重装鎧', robe: 'ローブ', shield: '盾' }[equipType] || equipType;
  }

  /** 素材の特性出現回数から融合マップを計算 (craftItem と同一ロジック) */
  _computeFusionMap() {
    const traitCounts = {};
    for (const mat of this.assignedMaterials) {
      if (!mat || !mat.traits) continue;
      const seen = new Set();
      for (const t of mat.traits) {
        if (!seen.has(t)) {
          traitCounts[t] = (traitCounts[t] || 0) + 1;
          seen.add(t);
        }
      }
    }
    const fusionMap = {};
    for (const [trait, count] of Object.entries(traitCounts)) {
      if (count >= 2 && TraitFusionTable[trait] && TraitDefs[TraitFusionTable[trait]]) {
        fusionMap[trait] = TraitFusionTable[trait];
      }
    }
    return fusionMap;
  }

  /** プレビュー用: craftItem と同じロジックで最終品質・最終特性を算出 */
  _computePreviewResult() {
    const recipe = Recipes[this.selectedRecipeId];
    if (!recipe) return null;

    // 素材の最高品質を採用 (craftItem と同ロジック)
    const qualities = this.assignedMaterials.filter(m => m).map(m => m.quality || 0);
    const maxQ = qualities.length > 0 ? Math.max(...qualities) : 0;

    let craftBonus = 0;
    for (const mat of this.assignedMaterials) {
      if (!mat?.traits) continue;
      for (const t of mat.traits) {
        const def = TraitDefs[t];
        if (def?.effects?.craftQualityBonus) craftBonus += def.effects.craftQualityBonus;
      }
    }
    const cap = getCurrentQualityCap();
    const rawQ = Math.max(0, maxQ + craftBonus);
    const finalQ = Math.floor(Math.min(cap, rawQ));
    const capped = rawQ > cap;

    const fusionMap = this._computeFusionMap();
    const allAvailableTraits = new Set();
    for (const mat of this.assignedMaterials) {
      if (mat?.traits) mat.traits.forEach(t => allAvailableTraits.add(t));
    }
    for (const upgraded of Object.values(fusionMap)) allAvailableTraits.add(upgraded);

    let effectiveSelected = [...this.selectedTraits];
    if (effectiveSelected.length === 0) {
      const baseTraits = new Set();
      for (const mat of this.assignedMaterials) {
        if (mat?.traits) mat.traits.forEach(t => baseTraits.add(t));
      }
      effectiveSelected = [...baseTraits];
    }

    const finalTraits = [];
    const usedFusions = new Set();
    for (const t of effectiveSelected) {
      if (fusionMap[t] && !usedFusions.has(t)) {
        finalTraits.push(fusionMap[t]);
        usedFusions.add(t);
      } else if (allAvailableTraits.has(t) && !usedFusions.has(t)) {
        finalTraits.push(t);
      }
    }
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    finalTraits.sort((a, b) => {
      const ra = rarityOrder[TraitDefs[a]?.rarity] ?? 5;
      const rb = rarityOrder[TraitDefs[b]?.rarity] ?? 5;
      return ra - rb;
    });
    finalTraits.length = Math.min(finalTraits.length, GameConfig.maxTraitSlots);

    return { finalQ, maxQ, craftBonus, capped, fusionMap, finalTraits };
  }

  /** 消耗品プレビュー — 品質と最終特性による補正を適用 */
  _renderConsumablePreview(bp, finalQ, finalTraits) {
    const MULT_UPPER = 2.0;
    const MULT_LOWER = -0.9;
    const mods = {
      consumableDamageMult: 0,
      consumableHealMult: 0,
      consumableBuffMult: 0,
      consumableDurationMult: 0,
      consumableCooldownMult: 0,
    };
    let regenAmount = 0;
    let regenDuration = 0;
    for (const t of finalTraits) {
      const def = TraitDefs[t];
      if (!def?.effects) continue;
      for (const key of Object.keys(mods)) {
        if (typeof def.effects[key] === 'number') mods[key] += def.effects[key];
      }
      if (def.effects.consumableRegenAfter) {
        regenAmount += def.effects.consumableRegenAfter.amount || 0;
        regenDuration = Math.max(regenDuration, def.effects.consumableRegenAfter.duration || 0);
      }
    }
    for (const k of Object.keys(mods)) {
      if (mods[k] > MULT_UPPER) mods[k] = MULT_UPPER;
      if (mods[k] < MULT_LOWER) mods[k] = MULT_LOWER;
    }
    const qMult = 1 + Math.max(0, (finalQ || 1) - 1) * 0.01;

    const fx = bp.battleEffect;
    const statNames = { atk: '攻撃力', def: '防御力', spd: '速度', crit: '会心率', critDmg: '会心ダメ', cooldown: 'CD短縮', elemPower: '属性威力', elemProc: '属性発動率', dodge: '回避', range: '武器範囲', magnet: '磁力', maxHp: '最大HP' };
    const target = fx.target === 'all' ? '味方全体' : (fx.target === 'ally' ? '自己' : '敵');

    let html = '';
    html += `<div class="preview-row"><span>対象:</span><span class="preview-val">${target}</span></div>`;

    // tier 形式: 品質閾値による段階効果
    if (Array.isArray(fx.tiers)) {
      html += this._renderTieredConsumablePreview(fx, finalQ, mods, statNames);
      const cdMult = Math.max(0.1, 1 + mods.consumableCooldownMult);
      const cd = 3.0 * cdMult;
      html += `<div class="preview-row"><span>🔄 クールダウン:</span><span class="preview-val">${fmt1(cd)}秒${this._effectBadge(mods.consumableCooldownMult, true)}</span></div>`;
      const uses = fx.uses || 3;
      html += `<div class="preview-row"><span>🔢 使用回数:</span><span class="preview-val">${uses}回</span></div>`;
      if (regenAmount > 0 && regenDuration > 0) {
        html += `<div class="preview-row"><span>🌿 効果後再生:</span><span class="preview-val">+${fmt1(regenAmount)}HP/秒 (${regenDuration}秒)</span></div>`;
      }
      const cmp = this._compareConsumable(bp);
      if (cmp) html += `<div class="preview-compare">${cmp}</div>`;
      return html;
    }

    switch (fx.type) {
      case 'heal': {
        const v = Math.round(fx.value * qMult * (1 + mods.consumableHealMult));
        html += `<div class="preview-row"><span>💚 回復量:</span><span class="preview-val">+${v} HP${this._effectBadge(mods.consumableHealMult, false)}</span></div>`;
        break;
      }
      case 'healfull':
        html += `<div class="preview-row"><span>💚 効果:</span><span class="preview-val">HP全回復</span></div>`;
        break;
      case 'buff': {
        const amt = fx.amount * qMult * (1 + mods.consumableBuffMult);
        const dur = fx.duration * (1 + mods.consumableDurationMult);
        let label;
        let display;
        if (fx.stat === 'atk') { label = '⬆️ 攻撃力:'; display = `+${fmt1(amt)}%`; }
        else if (fx.stat === 'spd') { label = '⬆️ 移動速度:'; display = `+${fmt1(amt)}%`; }
        else if (fx.stat === 'def') { label = '⬆️ 防御値:'; display = `+${fmt1(amt)}`; }
        else { label = `⬆️ ${statNames[fx.stat] || fx.stat}:`; display = `+${fmt1(amt)}`; }
        html += `<div class="preview-row"><span>${label}</span><span class="preview-val">${display}${this._effectBadge(mods.consumableBuffMult, false)}</span></div>`;
        html += `<div class="preview-row"><span>⏱️ 継続:</span><span class="preview-val">${fmt1(dur)}秒${this._effectBadge(mods.consumableDurationMult, false)}</span></div>`;
        break;
      }
      case 'debuff': {
        const dur = fx.duration * (1 + mods.consumableDurationMult);
        html += `<div class="preview-row"><span>⬇️ 敵${statNames[fx.stat] || fx.stat}:</span><span class="preview-val">${fx.amount}</span></div>`;
        html += `<div class="preview-row"><span>⏱️ 継続:</span><span class="preview-val">${fmt1(dur)}秒${this._effectBadge(mods.consumableDurationMult, false)}</span></div>`;
        html += `<div class="preview-row"><span>📏 範囲:</span><span class="preview-val">半径120px</span></div>`;
        break;
      }
      case 'damage': {
        const v = Math.round(fx.value * qMult * (1 + mods.consumableDamageMult));
        html += `<div class="preview-row"><span>💥 ダメージ:</span><span class="preview-val">${v}${this._effectBadge(mods.consumableDamageMult, false)}</span></div>`;
        html += `<div class="preview-row"><span>📏 範囲:</span><span class="preview-val">半径100px</span></div>`;
        break;
      }
      case 'stun': {
        const dur = fx.duration * (1 + mods.consumableDurationMult);
        html += `<div class="preview-row"><span>⚡ スタン:</span><span class="preview-val">${fmt1(dur)}秒${this._effectBadge(mods.consumableDurationMult, false)}</span></div>`;
        html += `<div class="preview-row"><span>📏 範囲:</span><span class="preview-val">半径100px</span></div>`;
        break;
      }
      default:
        html += `<div class="preview-row"><span>効果:</span><span class="preview-val">使用効果あり</span></div>`;
    }

    const cdMult = Math.max(0.1, 1 + mods.consumableCooldownMult);
    const cd = 3.0 * cdMult;
    html += `<div class="preview-row"><span>🔄 クールダウン:</span><span class="preview-val">${fmt1(cd)}秒${this._effectBadge(mods.consumableCooldownMult, true)}</span></div>`;

    const uses = fx.uses || 3;
    html += `<div class="preview-row"><span>🔢 使用回数:</span><span class="preview-val">${uses}回</span></div>`;

    if (regenAmount > 0 && regenDuration > 0) {
      html += `<div class="preview-row"><span>🌿 効果後再生:</span><span class="preview-val">+${fmt1(regenAmount)}HP/秒 (${regenDuration}秒)</span></div>`;
    }

    // 装備中の同名消耗品と比較（簡易）
    const cmp = this._compareConsumable(bp);
    if (cmp) html += `<div class="preview-compare">${cmp}</div>`;

    return html;
  }

  /**
   * tier 形式の消耗品プレビュー。
   * 各 tier を「解放済みチェック」付きで表示し、現在品質での合成結果を最終効果として表示する。
   */
  _renderTieredConsumablePreview(fx, finalQ, mods, statNames) {
    const q = finalQ || 0;
    let html = '';
    // tier リスト
    html += `<div class="preview-row preview-section"><span>📊 品質段階効果:</span></div>`;
    html += `<div class="tier-list">`;
    for (const tier of fx.tiers) {
      const minQ = tier.minQuality || 0;
      const unlocked = q >= minQ;
      const icon = unlocked ? '✓' : '🔒';
      const cls = unlocked ? 'tier-unlocked' : 'tier-locked';
      const label = this._formatTierDeltas(tier, statNames);
      html += `<div class="tier-row ${cls}"><span class="tier-q">${icon} Q${minQ}</span><span class="tier-effect">${label}</span></div>`;
    }
    html += `</div>`;
    // 合成結果
    const resolved = resolveTieredEffects(fx, q);
    if (resolved) {
      const lines = this._formatResolvedEffect(resolved, mods, statNames);
      if (lines.length > 0) {
        html += `<div class="preview-row preview-section"><span>🧪 合成効果 (Q${q}):</span></div>`;
        for (const line of lines) {
          html += `<div class="preview-row tier-resolved-row"><span>${line.label}</span><span class="preview-val">${line.value}</span></div>`;
        }
      }
    }
    return html;
  }

  /** 単一 tier の差分を1行テキストにする */
  _formatTierDeltas(tier, statNames) {
    const parts = [];
    if (tier.heal) parts.push(`HP +${tier.heal}`);
    if (tier.percentHeal) parts.push(`最大HPの${tier.percentHeal}%回復`);
    if (tier.regen) {
      const r = tier.regen;
      const rp = [];
      if (r.hpPerSec) rp.push(`+${fmt1(r.hpPerSec)}HP/秒`);
      if (r.duration) rp.push(`${fmt1(r.duration)}秒`);
      parts.push(`持続回復 ${rp.join(' × ')}`);
    }
    if (tier.shield) {
      const s = tier.shield;
      parts.push(`シールド +${s.amount || 0}HP (${fmt1(s.duration || 0)}秒)`);
    }
    if (Array.isArray(tier.buffs)) {
      for (const b of tier.buffs) {
        const name = statNames[b.stat] || b.stat;
        parts.push(`${name} +${b.amount} (${fmt1(b.duration || 0)}秒)`);
      }
    }
    if (tier.damage) parts.push(`AoEダメ ${tier.damage}`);
    if (tier.statusEffect) {
      const s = tier.statusEffect;
      const typeLabel = { burn: '🔥燃焼', poison: '☠毒', freeze: '❄凍結', shock: '⚡感電' }[s.type] || s.type;
      const bits = [typeLabel];
      if (s.dps) bits.push(`${s.dps}DPS`);
      if (s.duration) bits.push(`${fmt1(s.duration)}秒`);
      parts.push(bits.join(' '));
    }
    if (tier.vulnerable) parts.push(`脆弱化 +${tier.vulnerable.amount || 0}% (${fmt1(tier.vulnerable.duration || 0)}秒)`);
    if (tier.stun) parts.push(`スタン ${fmt1(tier.stun.duration || 0)}秒`);
    return parts.join(' / ') || '—';
  }

  /** 合成効果を行配列で返す (label/value) */
  _formatResolvedEffect(resolved, mods, statNames) {
    const lines = [];
    const healMult = 1 + (mods?.consumableHealMult || 0);
    const buffMult = 1 + (mods?.consumableBuffMult || 0);
    const durMult = 1 + (mods?.consumableDurationMult || 0);
    const dmgMult = 1 + (mods?.consumableDamageMult || 0);
    if (resolved.heal) lines.push({ label: '💚 固定回復:', value: `+${Math.round(resolved.heal * healMult)} HP` });
    if (resolved.percentHeal) lines.push({ label: '💚 割合回復:', value: `最大HPの${fmt1(resolved.percentHeal * healMult)}%` });
    if (resolved.regen && resolved.regen.duration && resolved.regen.hpPerSec) {
      lines.push({ label: '🌿 持続回復:', value: `+${fmt1(resolved.regen.hpPerSec * healMult)}HP/秒 × ${fmt1(resolved.regen.duration * durMult)}秒` });
    }
    if (resolved.shield && resolved.shield.amount && resolved.shield.duration) {
      lines.push({ label: '🛡️ シールド:', value: `+${Math.round(resolved.shield.amount * buffMult)}HP × ${fmt1(resolved.shield.duration * durMult)}秒` });
    }
    if (resolved.buffs) {
      for (const key of Object.keys(resolved.buffs)) {
        const b = resolved.buffs[key];
        const name = statNames[b.stat] || b.stat;
        lines.push({ label: `⬆️ ${name}:`, value: `+${fmt1(b.amount * buffMult)} (${fmt1(b.duration * durMult)}秒)` });
      }
    }
    if (resolved.damage) lines.push({ label: '💥 ダメージ:', value: `${Math.round(resolved.damage * dmgMult)}` });
    if (resolved.statusEffect) {
      const s = resolved.statusEffect;
      const typeLabel = { burn: '🔥燃焼', poison: '☠毒', freeze: '❄凍結', shock: '⚡感電' }[s.type] || s.type;
      const bits = [];
      if (s.dps) bits.push(`${fmt1(s.dps)}DPS`);
      if (s.duration) bits.push(`${fmt1(s.duration * durMult)}秒`);
      lines.push({ label: `${typeLabel}:`, value: bits.join(' × ') });
    }
    if (resolved.vulnerable && resolved.vulnerable.duration) {
      lines.push({ label: '💢 脆弱化:', value: `敵被ダメ +${fmt1(resolved.vulnerable.amount)}% × ${fmt1(resolved.vulnerable.duration * durMult)}秒` });
    }
    if (resolved.stun && resolved.stun.duration) {
      lines.push({ label: '⚡ スタン:', value: `${fmt1(resolved.stun.duration * durMult)}秒` });
    }
    return lines;
  }

  /**
   * 盾プレビュー — 武器スロット装備時と防具スロット装備時の両方のステータスを表示
   */
  _renderShieldDualPreview(bp, finalQ, targetId) {
    let html = '';

    // ── 武器として装備した場合 ──
    const wc = GameConfig.weapon;
    // 実挙動と整合: baseDamageMultiplier と 無属性(+25%) を反映
    const dmgMult = bp.baseDamageMultiplier || 1.0;
    let dmg = (bp.baseValue / wc.damageBaseDivisor + finalQ / wc.damageQualityDivisor) * dmgMult;
    if (bp.element === 'none') dmg *= 1.25;
    const spd = wc.speedBase + finalQ / wc.speedQualityDivisor;
    const typeConfig = GameConfig.weaponTypes.shield;
    const range = typeConfig.baseRange * (1 + finalQ / wc.rangeQualityDivisor);
    const wCmp = this._compareWithEquipped(bp, { dmg, spd, range });

    html += `<div class="preview-dual-section preview-dual-weapon"><h5>⚔️ 武器スロット装備時</h5>`;
    html += `<div class="preview-row"><span>攻撃力:</span><span class="preview-val">${fmt1(dmg)}${wCmp.dmg}</span></div>`;
    html += `<div class="preview-row"><span>攻撃速度:</span><span class="preview-val">${fmt1(spd)}x${wCmp.spd}</span></div>`;
    html += `<div class="preview-row"><span>射程:</span><span class="preview-val">${fmtInt(range)}px${wCmp.range}</span></div>`;
    html += `<div class="preview-row"><span>パターン:</span><span class="preview-val">${this._getPatternName('shield')}</span></div>`;
    if (wCmp.label) html += `<div class="preview-compare">${wCmp.label}</div>`;
    const skillInfo = this._getSkillInfo('shield', bp.baseValue, targetId);
    if (skillInfo) {
      html += `<div class="preview-row preview-skill"><span>スキル:</span><span class="preview-val">${skillInfo.name}</span></div>`;
      html += `<div class="preview-row"><span></span><span class="preview-skill-desc">${skillInfo.desc}（CD ${skillInfo.cd}秒）</span></div>`;
    }
    html += `</div>`;

    // ── 防具として装備した場合 ──
    const defVal = bp.baseValue / 12 + finalQ / 8;
    const hpBonus = finalQ * 0.5;
    const aCmp = this._compareArmor({ def: defVal, hp: hpBonus });

    html += `<div class="preview-dual-section preview-dual-armor"><h5>🛡️ 防具スロット装備時</h5>`;
    html += `<div class="preview-row"><span>防御値:</span><span class="preview-val">+${fmt1(defVal)}${aCmp.def}</span></div>`;
    html += `<div class="preview-row"><span>最大HP:</span><span class="preview-val">+${fmtInt(hpBonus)}${aCmp.hp}</span></div>`;
    if (aCmp.label) html += `<div class="preview-compare">${aCmp.label}</div>`;
    html += `</div>`;

    return html;
  }

  /**
   * 効果倍率バッジ — 値が0なら非表示。invert=true はクールダウン等「負が良い」系。
   */
  _effectBadge(mult, invert) {
    if (!mult || Math.abs(mult) < 0.001) return '';
    const pct = Math.round(mult * 100);
    const isGood = invert ? pct < 0 : pct > 0;
    const cls = isGood ? 'up' : 'down';
    const arrow = isGood ? '▲' : '▼';
    const sign = pct > 0 ? '+' : '';
    return ` <span class="preview-diff ${cls}">${arrow}${sign}${pct}%</span>`;
  }

  /**
   * 同 equipType の装備中武器と数値比較。
   * @returns {{dmg:string, spd:string, range:string, label:string}} 各値に付与する差分表記と一行サマリ
   */
  _compareWithEquipped(newBp, newStats) {
    const empty = { dmg: '', spd: '', range: '', label: '' };
    const eq = this.getEquipment();
    if (!eq || !eq.weaponSlots) return empty;
    const equipped = eq.weaponSlots.find(w => {
      if (!w) return false;
      const bp = ItemBlueprints[w.blueprintId];
      return bp && bp.equipType === newBp.equipType;
    });
    if (!equipped) return { ...empty, label: `現在 ${newBp.equipType} 未装備` };

    const bp = ItemBlueprints[equipped.blueprintId];
    const wc = GameConfig.weapon;
    // 実挙動と整合: baseDamageMultiplier と 無属性(+25%) を反映
    const curDmgMult = bp.baseDamageMultiplier || 1.0;
    let curDmg = (bp.baseValue / wc.damageBaseDivisor + equipped.quality / wc.damageQualityDivisor) * curDmgMult;
    if (bp.element === 'none') curDmg *= 1.25;
    const curSpd = wc.speedBase + equipped.quality / wc.speedQualityDivisor;
    const typeConfig = GameConfig.weaponTypes[bp.equipType];
    const curRange = typeConfig ? typeConfig.baseRange * (1 + equipped.quality / wc.rangeQualityDivisor) : 0;

    return {
      dmg: this._diffBadge(newStats.dmg, curDmg, 1),
      spd: this._diffBadge(newStats.spd, curSpd, 2),
      range: this._diffBadge(newStats.range, curRange, 0),
      label: `現在装備: ${equipped.name} (Q${equipped.quality})`,
    };
  }

  _compareAccessory(newSpdBonus) {
    const eq = this.getEquipment();
    if (!eq?.accessory) return { spd: '', label: '現在 アクセサリ 未装備' };
    const bp = ItemBlueprints[eq.accessory.blueprintId];
    if (!bp) return { spd: '', label: '' };
    const curSpdBonus = bp.baseValue / 2500 + eq.accessory.quality / 5000;
    return {
      spd: this._diffBadge(newSpdBonus * 100, curSpdBonus * 100, 1, '%'),
      label: `現在装備: ${eq.accessory.name} (Q${eq.accessory.quality})`,
    };
  }

  /** 装備中防具と数値比較 */
  _compareArmor(newStats) {
    const empty = { def: '', hp: '', label: '' };
    const eq = this.getEquipment();
    if (!eq?.armor) return { ...empty, label: '現在 防具 未装備' };
    const bp = ItemBlueprints[eq.armor.blueprintId];
    if (!bp) return empty;
    const curDef = bp.baseValue / 12 + eq.armor.quality / 8;
    const curHp = eq.armor.quality * 0.5;
    return {
      def: this._diffBadge(newStats.def, curDef, 1),
      hp: this._diffBadge(newStats.hp, curHp, 0),
      label: `現在装備: ${eq.armor.name} (Q${eq.armor.quality})`,
    };
  }

  /** 持ち込み中の同名消耗品と比較 (簡易) */
  _compareConsumable(newBp) {
    const eq = this.getEquipment();
    const consumables = eq?.consumables || [];
    if (consumables.length === 0) return '';
    const same = consumables.find(c => c.blueprintId === newBp.id);
    if (!same) return '';
    return `持ち込み中: ${same.name} (Q${same.quality})`;
  }

  _diffBadge(next, cur, digits, unit = '') {
    const d = next - cur;
    if (Math.abs(d) < Math.pow(10, -digits) / 2) return ` <span class="preview-diff same">±0</span>`;
    const sign = d > 0 ? '+' : '';
    const cls = d > 0 ? 'up' : 'down';
    const arrow = d > 0 ? '▲' : '▼';
    // digits は閾値計算用としてのみ利用し、表示は全て最大1桁で統一
    const display = digits <= 0 ? fmtInt(d) : fmt1(d);
    return ` <span class="preview-diff ${cls}">${arrow}${sign}${display}${unit}</span>`;
  }

  _getPatternName(equipType) {
    const names = { sword: '回転斬り（225°弧+360°交互）', spear: '長距離貫通突き', bow: '追尾矢', staff: '周回オーブ', dagger: '周回する刃 (3本)', shield: '守護波動+自動反撃' };
    return names[equipType] || equipType;
  }

  _getSkillInfo(equipType, baseValue, blueprintId) {
    const skillDef = WeaponSkillDefs[blueprintId];
    if (!skillDef) return null;
    return { name: skillDef.name, desc: skillDef.description, cd: skillDef.cooldown };
  }

  _getTraitRunEffects(def) {
    if (!def?.effects) return '';
    const labels = {
      runDamageFlat: 'ダメージ', runDamageReduction: '軽減', runMaxHpFlat: 'HP',
      runMoveSpeed: '速度', runRegenPerSec: '回復/秒', runDodge: '回避',
      runDropRate: 'ドロップ率', runAttackSpeed: '攻速', runExpBonus: '経験値',
      runStartInvincible: '開始無敵(秒)',
      runCritChance: '会心率', runCritDamage: '会心ダメ',
      runElementProc: '属性発動', runElementPower: '属性威力',
    };
    const parts = [];
    for (const [key, val] of Object.entries(def.effects)) {
      if (key.startsWith('run') && labels[key]) {
        const display = typeof val === 'number' && val < 1 && val > 0
          ? `+${fmtPct1(val)}%` : `+${fmt1(val)}`;
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
    const materialsReady = this.assignedMaterials.length === recipe.materials.length &&
           this.assignedMaterials.every(m => m !== null);
    if (!materialsReady) return false;
    // 倉庫上限チェック: 素材N個消費→完成品1個追加なので差分 = 1 - N
    // N>=1 のレシピでは基本問題ないが、`isFull` 時は保険で拒否
    const consumed = this.assignedMaterials.length;
    const projectedCount = this.inventory.items.length - consumed + 1;
    if (projectedCount > this.inventory.maxCapacity) return false;
    return true;
  }

  /** 調合実行時点での倉庫容量警告 (UI) */
  _renderCapacityWarning() {
    const consumed = this.assignedMaterials.length;
    const projectedCount = this.inventory.items.length - consumed + 1;
    if (projectedCount > this.inventory.maxCapacity) {
      return `<p class="craft-warning">⚠️ 倉庫が上限を超えています (${this.inventory.items.length}/${this.inventory.maxCapacity})。倉庫画面でアイテムを整理してください。</p>`;
    }
    return '';
  }

  _executeCraft() {
    if (!this._canCraft()) {
      // 倉庫満杯が原因なら明示的に通知
      const consumed = this.assignedMaterials.length;
      const projectedCount = this.inventory.items.length - consumed + 1;
      if (projectedCount > this.inventory.maxCapacity) {
        eventBus.emit('toast', { message: '倉庫が上限を超えているため調合できません。', type: 'error' });
      }
      return;
    }

    try {
      const item = craftItem(this.selectedRecipeId, this.assignedMaterials, this.selectedTraits, 0);

      // 装備中の素材UIDを先に解除通知（亡霊UID防止）
      const consumedUids = this.assignedMaterials.map(m => m.uid);
      eventBus.emit('inventory:uidsRemoved', { uids: consumedUids });

      // 素材をインベントリから消費
      for (const mat of this.assignedMaterials) {
        this.inventory.removeItem(mat.uid, true);
      }

      // 完成品をインベントリに追加
      this.inventory.addItem(item);

      eventBus.emit('toast', { message: `✨ ${item.name} (Q${item.quality}) を調合しました！`, type: 'success' });

      // 錬金陣の成功演出 (1.2秒間)
      const stage = this.el.querySelector('#craft-stage');
      if (stage) {
        stage.classList.add('craft-success');
        setTimeout(() => {
          // リセット & 再描画。クラスは再描画時に消える
          this.assignedMaterials = [];
          this.selectedTraits = [];
          this._renderWorkspace();
          this._renderRecipeList();
        }, 900);
      } else {
        this.assignedMaterials = [];
        this.selectedTraits = [];
        this._renderWorkspace();
        this._renderRecipeList();
      }
    } catch (err) {
      eventBus.emit('toast', { message: `調合失敗: ${err.message}`, type: 'error' });
    }
  }

  destroy() {
    this.el.remove();
  }
}
