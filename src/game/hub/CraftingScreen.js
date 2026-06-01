/**
 * CraftingScreen — アトリエ風UI (Phase C)
 *
 * 3カラム羊皮紙レイアウト:
 *   左 : レシピ書 (Grimoire)
 *   中 : 調合ステージ (Synthesis) — 錬金陣 + フラスコ + 円周配置スロット
 *   右 : 仕様 (Specifications) — 品質バー + 特性 + プレビュー
 *
 * 計算系ヘルパー (_canCraft, _computePreviewResult, _renderConsumablePreview,
 * _compareWithEquipped, etc.) は旧版から完全保持。表示系のみアトリエ準拠に再構築。
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
import { resolveSkillTier } from '../run/weapons/skillTierResolver.js';

export class CraftingScreen {
  constructor(container, inventorySystem, options = {}) {
    this.container = container;
    this.inventory = inventorySystem;
    this.getEquipment = options.getEquipment || (() => ({ weaponSlots: [], armor: null, accessory: null }));
    this.el = document.createElement('div');
    this.el.className = 'craft-screen atl-craft-screen';
    this.selectedRecipeId = null;
    this.assignedMaterials = []; // index corresponds to recipe.materials slot
    this.selectedTraits = [];
    this.typeFilter = 'all';
    this.craftableOnly = false;
    this.searchText = '';
    this._resizeHandler = null;
  }

  render() {
    this.el.innerHTML = `
      <div class="atl-craft-layout">
        <!-- LEFT: Recipe Grimoire -->
        <div class="atelier-parchment atl-craft-recipes">
          <span class="atelier-corner tl"></span><span class="atelier-corner tr"></span>
          <span class="atelier-corner bl"></span><span class="atelier-corner br"></span>
          <div class="atelier-panel-head">
            <div class="atelier-panel-title">
              <span class="atelier-deco">❖</span>レシピ書<span class="atelier-en">Grimoire</span>
            </div>
            <span class="atelier-panel-meta" id="recipe-count">— / —</span>
          </div>
          <div class="atl-craft-recipe-body">
            <div class="atl-recipe-search">
              <input type="text" id="recipe-search" placeholder="レシピを検索..." />
            </div>
            <div class="atl-filter-row">
              <button class="atelier-chip active" data-filter="all">全て</button>
              <button class="atelier-chip" data-filter="equipment">装備</button>
              <button class="atelier-chip" data-filter="consumable">薬品</button>
              <button class="atelier-chip" data-filter="accessory">飾</button>
              <button class="atelier-chip" data-filter="material">素材</button>
            </div>
            <div class="atl-recipe-toggles">
              <label><input type="checkbox" id="craftable-only" /><span>作成可能のみ</span></label>
            </div>
            <div class="atl-recipe-list atelier-scrollarea" id="recipe-list"></div>
          </div>
        </div>

        <!-- CENTER: Synthesis Workspace -->
        <div class="atelier-parchment atl-craft-workspace">
          <span class="atelier-corner tl"></span><span class="atelier-corner tr"></span>
          <span class="atelier-corner bl"></span><span class="atelier-corner br"></span>
          <div class="atelier-panel-head">
            <div class="atelier-panel-title">
              <span class="atelier-deco">✦</span>調合<span class="atelier-en">Synthesis</span>
            </div>
            <span class="atelier-panel-meta" id="ws-meta">Empty Cauldron</span>
          </div>
          <div class="atl-workspace-body">
            <div class="atl-target-card is-empty" id="atl-target-card">
              <div class="atl-seal" id="atl-target-seal">✦</div>
              <div class="atl-target-info">
                <div class="atl-target-tag">SYNTHESIS TARGET — 調合目標</div>
                <div class="atl-target-name" id="atl-target-name">レシピを選択してください</div>
                <div class="atl-target-desc" id="atl-target-desc">左の書から作りたい品を選び、素材を装填せよ。</div>
              </div>
              <div class="atl-target-q" id="atl-target-q">Q —</div>
            </div>
            <div class="atl-cauldron-wrap" id="atl-cauldron">
              <div class="atl-alch-circle-bg"></div>
              <div class="atl-cauldron-glow"></div>
              <div class="atl-flask">${this._buildFlaskSvg()}</div>
              <svg class="atl-slot-link" id="atl-slot-links" preserveAspectRatio="none"></svg>
              <div class="atl-slots-ring" id="atl-slots-ring"></div>
            </div>
            <button class="atelier-brass-btn atl-craft-execute" id="atl-craft-execute" disabled>
              <span class="atelier-deco">❖</span>調合する<span class="atelier-deco">❖</span>
            </button>
            <div id="atl-craft-warning-host"></div>
          </div>
        </div>

        <!-- RIGHT: Specifications -->
        <div class="atelier-parchment atl-craft-detail">
          <span class="atelier-corner tl"></span><span class="atelier-corner tr"></span>
          <span class="atelier-corner bl"></span><span class="atelier-corner br"></span>
          <div class="atelier-panel-head">
            <div class="atelier-panel-title">
              <span class="atelier-deco">◈</span>仕様<span class="atelier-en">Specifications</span>
            </div>
            <span class="atelier-panel-meta" id="atl-detail-meta">— · —</span>
          </div>
          <div class="atl-detail-body atelier-scrollarea" id="atl-detail-body">
            <div class="atl-detail-empty">
              ◇<br>レシピを選ぶと<br>ここに仕様が描かれます<br>◇
            </div>
          </div>
        </div>
      </div>

      <div class="atl-mobile-craft" aria-label="モバイル調合">
        <section class="atl-mobile-recipe-panel">
          <div class="atl-mobile-section-head">
            <div>
              <span class="atl-mobile-eyebrow">Recipe</span>
              <h3>調合レシピ</h3>
            </div>
            <span class="atl-mobile-count" id="mobile-recipe-count">— / —</span>
          </div>
          <div class="atl-mobile-search-row">
            <input type="text" id="mobile-recipe-search" placeholder="レシピ検索" />
            <label class="atl-mobile-craftable">
              <input type="checkbox" id="mobile-craftable-only" />
              <span>作成可</span>
            </label>
          </div>
          <div class="atl-mobile-filter-row">
            <button class="atelier-chip active" data-filter="all">全て</button>
            <button class="atelier-chip" data-filter="equipment">装備</button>
            <button class="atelier-chip" data-filter="consumable">薬品</button>
            <button class="atelier-chip" data-filter="accessory">飾</button>
            <button class="atelier-chip" data-filter="material">素材</button>
          </div>
          <div class="atl-mobile-recipe-list" id="mobile-recipe-list"></div>
        </section>

        <section class="atl-mobile-workbench" id="mobile-workbench">
          <div class="atl-mobile-empty">レシピを選択してください</div>
        </section>
      </div>
    `;
    this.container.appendChild(this.el);

    // Filter chips
    this.el.querySelectorAll('.atl-filter-row .atelier-chip, .atl-mobile-filter-row .atelier-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setTypeFilter(btn.dataset.filter);
      });
    });

    // Craftable-only toggle
    const craftableToggle = this.el.querySelector('#craftable-only');
    craftableToggle.addEventListener('change', (e) => {
      this._setCraftableOnly(e.target.checked);
    });
    const mobileCraftableToggle = this.el.querySelector('#mobile-craftable-only');
    mobileCraftableToggle.addEventListener('change', (e) => {
      this._setCraftableOnly(e.target.checked);
    });

    // Search
    const searchInput = this.el.querySelector('#recipe-search');
    searchInput.addEventListener('input', (e) => {
      this._setSearchText(e.target.value);
    });
    const mobileSearchInput = this.el.querySelector('#mobile-recipe-search');
    mobileSearchInput.addEventListener('input', (e) => {
      this._setSearchText(e.target.value);
    });

    // Craft button
    const craftBtn = this.el.querySelector('#atl-craft-execute');
    craftBtn.addEventListener('click', () => this._executeCraft());

    // Recompute slot positions on resize (positions are pixel-based)
    this._resizeHandler = () => this._layoutSlots();
    window.addEventListener('resize', this._resizeHandler);

    this._renderRecipeList();
    this._renderMobileRecipeList();
    this._renderMobileWorkbench();
    return this.el;
  }

  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this.el.remove();
  }

  // ============================================================
  // Recipe list (left panel)
  // ============================================================

  _setTypeFilter(filter) {
    this.typeFilter = filter || 'all';
    this._syncFilterChips();
    this._renderRecipeList();
    this._renderMobileRecipeList();
  }

  _setCraftableOnly(value) {
    this.craftableOnly = !!value;
    this._syncCraftableToggles();
    this._renderRecipeList();
    this._renderMobileRecipeList();
  }

  _setSearchText(value) {
    this.searchText = String(value || '').trim().toLowerCase();
    this._syncSearchInputs(value || '');
    this._renderRecipeList();
    this._renderMobileRecipeList();
  }

  _syncFilterChips() {
    this.el.querySelectorAll('.atl-filter-row .atelier-chip, .atl-mobile-filter-row .atelier-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === this.typeFilter);
    });
  }

  _syncCraftableToggles() {
    this.el.querySelectorAll('#craftable-only, #mobile-craftable-only').forEach(input => {
      input.checked = this.craftableOnly;
    });
  }

  _syncSearchInputs(value) {
    this.el.querySelectorAll('#recipe-search, #mobile-recipe-search').forEach(input => {
      if (input.value !== value) input.value = value;
    });
  }

  _getFilteredRecipes() {
    let total = 0;
    const entries = [];
    for (const [id, recipe] of Object.entries(Recipes)) {
      if (!recipe.unlocked) continue;
      const bp = ItemBlueprints[recipe.targetId];
      if (!bp) continue;
      total++;
      if (this.typeFilter !== 'all' && bp.type !== this.typeFilter) continue;
      if (this.searchText && !bp.name.toLowerCase().includes(this.searchText)) continue;

      const craftable = this._hasEnoughMaterials(recipe);
      if (this.craftableOnly && !craftable) continue;
      entries.push({ id, recipe, bp, craftable });
    }
    return { entries, total };
  }

  _buildRecipeIconHTML(bp) {
    return bp.image
      ? `<img src="${assetPath(bp.image)}" onerror="this.style.display='none'" alt="">`
      : `<span>${bp.element === 'none' ? '✦' : '◇'}</span>`;
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

      const elemCls = bp.element ? `elem-${bp.element}` : '';
      const card = document.createElement('div');
      card.className = 'atl-recipe-item' + (id === this.selectedRecipeId ? ' active' : '') + (craftable ? '' : ' unavailable');
      const iconHtml = bp.image
        ? `<img src="${assetPath(bp.image)}" onerror="this.style.display='none'" alt="">`
        : `<span>${bp.element === 'none' ? '✦' : '◆'}</span>`;
      card.innerHTML = `
        <div class="atl-recipe-icon ${elemCls}">${iconHtml}</div>
        <div class="atl-recipe-info">
          <div class="atl-recipe-name">${bp.name}</div>
          <div class="atl-recipe-sub">
            ${createElementBadgeHTML(bp.element)}
            ${recipe.materials.length} 素材
            ${craftable ? '' : '<span class="atl-recipe-lacking">不足</span>'}
          </div>
        </div>
      `;
      card.addEventListener('click', () => this._selectRecipe(id));
      listEl.appendChild(card);
      shown++;
    }

    if (countEl) countEl.textContent = `${shown} / ${total}`;
    if (shown === 0) {
      listEl.innerHTML = '<div class="atl-recipe-empty">該当するレシピがありません</div>';
    }
  }

  /** レシピに必要な素材が全て揃っているか判定 */
  _renderMobileRecipeList() {
    const listEl = this.el.querySelector('#mobile-recipe-list');
    const countEl = this.el.querySelector('#mobile-recipe-count');
    if (!listEl) return;
    listEl.innerHTML = '';

    const { entries, total } = this._getFilteredRecipes();
    if (countEl) countEl.textContent = `${entries.length} / ${total}`;
    if (entries.length === 0) {
      listEl.innerHTML = '<div class="atl-mobile-empty">該当するレシピがありません</div>';
      return;
    }

    for (const { id, recipe, bp, craftable } of entries) {
      const elemCls = bp.element ? `elem-${bp.element}` : '';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'atl-mobile-recipe-item' + (id === this.selectedRecipeId ? ' active' : '') + (craftable ? '' : ' unavailable');
      item.innerHTML = `
        <span class="atl-mobile-recipe-icon ${elemCls}">${this._buildRecipeIconHTML(bp)}</span>
        <span class="atl-mobile-recipe-main">
          <span class="atl-mobile-recipe-name">${bp.name}</span>
          <span class="atl-mobile-recipe-meta">${recipe.materials.length}素材 ${craftable ? '作成可' : '不足'}</span>
        </span>
      `;
      item.addEventListener('click', () => this._selectRecipe(id));
      listEl.appendChild(item);
    }
  }

  _getSlotLabel(slot) {
    return isCategorySlot(slot)
      ? (MaterialCategories[getCategoryId(slot)]?.name || slot)
      : (ItemBlueprints[slot]?.name || slot);
  }

  _renderMobileWorkbench() {
    const host = this.el.querySelector('#mobile-workbench');
    if (!host) return;

    const recipe = Recipes[this.selectedRecipeId];
    if (!recipe) {
      host.innerHTML = '<div class="atl-mobile-empty">レシピを選択してください</div>';
      return;
    }

    const bp = ItemBlueprints[recipe.targetId];
    const preview = this._canCraft() ? this._computePreviewResult() : null;
    const finalQ = preview?.finalQ ?? 0;
    const cap = getCurrentQualityCap();
    const pct = Math.max(0, Math.min(100, (finalQ / cap) * 100));
    const filledCount = this.assignedMaterials.filter(Boolean).length;
    const missingCount = Math.max(0, recipe.materials.length - filledCount);
    const canCraft = this._canCraft();
    const iconHtml = bp.image
      ? `<img src="${assetPath(bp.image)}" onerror="this.style.display='none'" alt="">`
      : '<span>✦</span>';

    const slotsHtml = recipe.materials.map((slot, i) => {
      const assigned = this.assignedMaterials[i];
      const assignedBp = assigned ? ItemBlueprints[assigned.blueprintId] : null;
      const slotLabel = this._getSlotLabel(slot);
      const assignedImg = assignedBp?.image
        ? `<img src="${assetPath(assignedBp.image)}" onerror="this.style.display='none'" alt="">`
        : `<span>${assigned ? '◆' : '+'}</span>`;
      return `
        <div class="atl-mobile-material-row ${assigned ? 'is-filled' : 'is-empty'}">
          <button type="button" class="atl-mobile-material-pick" data-slot="${i}">
            <span class="atl-mobile-material-icon">${assignedImg}</span>
            <span class="atl-mobile-material-main">
              <span class="atl-mobile-material-label">${slotLabel}</span>
              <span class="atl-mobile-material-name">${assigned ? `${assigned.name} / Q${assigned.quality}` : '素材を選択'}</span>
            </span>
          </button>
          ${assigned ? `<button type="button" class="atl-mobile-material-clear" data-slot="${i}" aria-label="${assigned.name}を外す">×</button>` : ''}
        </div>
      `;
    }).join('');

    const traitSummary = (preview?.finalTraits || this.selectedTraits || [])
      .slice(0, GameConfig.maxTraitSlots)
      .map(t => {
        const rar = TraitDefs[t]?.rarity || 'common';
        return `<span class="atl-mobile-trait rarity-${rar}">${t}</span>`;
      }).join('');

    host.innerHTML = `
      <div class="atl-mobile-target">
        <span class="atl-mobile-target-icon">${iconHtml}</span>
        <span class="atl-mobile-target-main">
          <span class="atl-mobile-eyebrow">Target</span>
          <strong>${bp.name}</strong>
        </span>
        <span class="atl-mobile-q-pill">Q${finalQ}</span>
      </div>

      <div class="atl-mobile-quality">
        <div class="atl-mobile-quality-head">
          <span>品質</span>
          <span>${finalQ} / ${cap}</span>
        </div>
        <div class="atelier-q-bar">
          <div class="atelier-q-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>

      <div class="atl-mobile-materials">
        <div class="atl-mobile-subhead">素材 ${filledCount}/${recipe.materials.length}</div>
        ${slotsHtml}
      </div>

      ${traitSummary ? `
        <div class="atl-mobile-traits">
          <div class="atl-mobile-subhead">引き継ぎ特性</div>
          <div class="atl-mobile-trait-list">${traitSummary}</div>
        </div>
      ` : ''}

      <div class="atl-mobile-action">
        <button type="button" class="atelier-brass-btn atl-mobile-craft-execute" ${canCraft ? '' : 'disabled'}>
          ${canCraft ? '調合する' : `素材不足 ${missingCount}`}
        </button>
      </div>
    `;

    host.querySelectorAll('.atl-mobile-material-pick').forEach(btn => {
      btn.addEventListener('click', () => this._openMaterialPicker(parseInt(btn.dataset.slot, 10)));
    });
    host.querySelectorAll('.atl-mobile-material-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        this.assignedMaterials[parseInt(btn.dataset.slot, 10)] = null;
        this._renderCauldron();
        this._renderTargetCard();
        this._renderDetail();
        this._updateCraftButton();
        this._renderMobileWorkbench();
      });
    });
    const craftBtn = host.querySelector('.atl-mobile-craft-execute');
    if (craftBtn) craftBtn.addEventListener('click', () => this._executeCraft());
  }

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
    this._autoFillBestMaterials();

    // Update active card highlight
    this.el.querySelectorAll('.atl-recipe-item').forEach(c => c.classList.remove('active'));
    const cards = this.el.querySelectorAll('.atl-recipe-item');
    cards.forEach(card => {
      const name = card.querySelector('.atl-recipe-name')?.textContent;
      const bp = ItemBlueprints[Recipes[recipeId]?.targetId];
      if (bp && name === bp.name) card.classList.add('active');
    });

    this._renderTargetCard();
    this._renderCauldron();
    this._renderDetail();
    this._updateCraftButton();
    this._renderMobileRecipeList();
    this._renderMobileWorkbench();
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

  /** モバイル時に .atl-craft-workspace の末尾までスクロール (デスクトップは無効) */
  _scrollWorkspaceToBottomMobile() {
    if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) return;
    requestAnimationFrame(() => {
      const mobileWorkbench = this.el.querySelector('#mobile-workbench');
      if (mobileWorkbench && window.getComputedStyle(mobileWorkbench).display !== 'none') {
        mobileWorkbench.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const workspace = this.el.querySelector('.atl-craft-workspace');
      const craftLayout = this.el.querySelector('.atl-craft-layout');
      if (workspace && craftLayout) {
        const top = Math.max(0, workspace.offsetTop + workspace.offsetHeight - craftLayout.clientHeight);
        craftLayout.scrollTo({ top, behavior: 'smooth' });
        return;
      }
      if (workspace && typeof workspace.scrollIntoView === 'function') {
        workspace.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      const hubContent = document.querySelector('.hub-content');
      if (hubContent) {
        hubContent.scrollTo({ top: hubContent.scrollHeight, behavior: 'smooth' });
      }
    });
  }

  // ============================================================
  // Target card (top of center panel)
  // ============================================================

  _renderTargetCard() {
    const recipe = Recipes[this.selectedRecipeId];
    const card = this.el.querySelector('#atl-target-card');
    const seal = this.el.querySelector('#atl-target-seal');
    const nameEl = this.el.querySelector('#atl-target-name');
    const descEl = this.el.querySelector('#atl-target-desc');
    const qEl = this.el.querySelector('#atl-target-q');
    const metaEl = this.el.querySelector('#ws-meta');
    const detailMeta = this.el.querySelector('#atl-detail-meta');

    if (!recipe) {
      card.classList.add('is-empty');
      seal.innerHTML = '✦';
      nameEl.textContent = 'レシピを選択してください';
      descEl.textContent = '左の書から作りたい品を選び、素材を装填せよ。';
      qEl.textContent = 'Q —';
      metaEl.textContent = 'Empty Cauldron';
      if (detailMeta) detailMeta.textContent = '— · —';
      return;
    }

    const bp = ItemBlueprints[recipe.targetId];
    card.classList.remove('is-empty');
    seal.innerHTML = bp.image
      ? `<img src="${assetPath(bp.image)}" onerror="this.style.display='none'" alt="">`
      : '✦';
    nameEl.textContent = bp.name;
    const typeLabel = bp.type === 'equipment' ? '装備'
      : bp.type === 'consumable' ? '消耗品'
      : bp.type === 'accessory' ? 'アクセサリ'
      : bp.type === 'material' ? '素材' : bp.type;
    descEl.textContent = bp.description || `${typeLabel}を錬成する。`;

    const preview = this._canCraft() ? this._computePreviewResult() : null;
    qEl.textContent = preview ? `Q ${preview.finalQ}` : 'Q —';
    metaEl.textContent = `${recipe.materials.length} 素材`;
    if (detailMeta) detailMeta.textContent = bp.name;
  }

  // ============================================================
  // Cauldron (alchemy circle + flask + slots ring)
  // ============================================================

  _renderCauldron() {
    const recipe = Recipes[this.selectedRecipeId];
    const ringEl = this.el.querySelector('#atl-slots-ring');
    if (!ringEl) return;

    if (!recipe) {
      ringEl.innerHTML = '';
      this._drawSlotLinks([]);
      this._updateLiquidFill(0);
      return;
    }

    const n = recipe.materials.length;
    ringEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const slot = recipe.materials[i];
      const assigned = this.assignedMaterials[i];
      const isCategory = isCategorySlot(slot);
      const slotLabel = isCategory
        ? (MaterialCategories[getCategoryId(slot)]?.name || slot)
        : (ItemBlueprints[slot]?.name || slot);

      const assignedBp = assigned ? ItemBlueprints[assigned.blueprintId] : null;
      const assignedImg = assignedBp?.image ? assetPath(assignedBp.image) : null;
      const categoryIcon = isCategory ? (MaterialCategories[getCategoryId(slot)]?.icon || '❖') : '';
      const specificBp = !isCategory ? ItemBlueprints[slot] : null;
      const specificImg = specificBp?.image ? assetPath(specificBp.image) : null;

      const rarityTop = assigned ? this._topRarity(assigned) : null;
      const rarityCls = rarityTop ? ` rar-${rarityTop}` : '';
      const filledCls = assigned ? ' is-filled' : ' is-empty';

      const iconHtml = assignedImg
        ? `<img src="${assignedImg}" onerror="this.style.display='none'" alt="">`
        : specificImg
          ? `<img class="atl-slot-icon-ghost" src="${specificImg}" onerror="this.style.display='none'" alt="">`
          : `<span>${categoryIcon || '◆'}</span>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `atl-slot${filledCls}${rarityCls}`;
      btn.dataset.slot = String(i);
      btn.title = assigned ? 'クリックで変更' : `${slotLabel} を選択`;
      btn.innerHTML = `
        <div class="atl-slot-disc">
          <div class="atl-slot-icon">${iconHtml}</div>
          ${assigned ? `<span class="atl-slot-q">Q${assigned.quality}</span>` : ''}
        </div>
        <span class="atl-slot-tag">${assigned ? assigned.name : slotLabel}</span>
        ${assigned ? `<span class="atl-slot-clear" data-slot="${i}" role="button" aria-label="${assigned.name}を外す" title="クリアする">✕</span>` : ''}
      `;
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.atl-slot-clear')) return;
        this._openMaterialPicker(i);
      });
      ringEl.appendChild(btn);
    }

    // Wire clear (✕) handlers
    ringEl.querySelectorAll('.atl-slot-clear').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(b.dataset.slot, 10);
        this.assignedMaterials[idx] = null;
        this._renderCauldron();
        this._renderTargetCard();
        this._renderDetail();
        this._updateCraftButton();
        this._renderMobileWorkbench();
      });
    });

    requestAnimationFrame(() => this._layoutSlots());
    const filledCount = this.assignedMaterials.filter(Boolean).length;
    this._updateLiquidFill(filledCount / Math.max(1, n));
  }

  _topRarity(item) {
    const order = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
    let best = 'common';
    for (const t of (item.traits || [])) {
      const r = TraitDefs[t]?.rarity;
      if (r && order[r] > order[best]) best = r;
    }
    return best;
  }

  /** Position slots around the flask in pixels (parent-size based). */
  _layoutSlots() {
    const wrap = this.el.querySelector('#atl-cauldron');
    const ring = this.el.querySelector('#atl-slots-ring');
    if (!wrap || !ring) return;
    const slots = ring.querySelectorAll('.atl-slot');
    if (slots.length === 0) {
      this._drawSlotLinks([]);
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w === 0 || h === 0) return; // not yet visible
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.42;
    const n = slots.length;
    const startDeg = -90; // top
    const positions = [];
    const formatCssPx = (value) => `${Math.abs(value) < 0.001 ? 0 : Number(value.toFixed(3))}px`;
    slots.forEach((slot, i) => {
      const ang = (startDeg + (360 / n) * i) * Math.PI / 180;
      const x = Math.cos(ang) * radius;
      const y = Math.sin(ang) * radius;
      const cssX = formatCssPx(x);
      const cssY = formatCssPx(y);
      slot.style.setProperty('--x', cssX);
      slot.style.setProperty('--y', cssY);
      slot.style.transform = `translate(${cssX}, ${cssY}) translate(-50%, -50%)`;
      positions.push({ x: cx + x, y: cy + y });
    });
    this._drawSlotLinks(positions);
  }

  /** Draw dashed lines from each slot to the flask center. */
  _drawSlotLinks(positions) {
    const svg = this.el.querySelector('#atl-slot-links');
    if (!svg) return;
    if (positions.length === 0) {
      svg.innerHTML = '';
      svg.removeAttribute('viewBox');
      return;
    }
    const wrap = this.el.querySelector('#atl-cauldron');
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    const cx = r.width / 2, cy = r.height / 2;
    let html = '';
    for (const p of positions) {
      html += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="rgba(138,94,29,0.35)" stroke-width="1" stroke-dasharray="3 4" />`;
    }
    svg.innerHTML = html;
  }

  /** Update the flask liquid fill (ratio 0..1). */
  _updateLiquidFill(ratio) {
    const liquid = this.el.querySelector('#atl-liquid-fill');
    const surface = this.el.querySelector('#atl-liquid-surface');
    if (!liquid) return;
    const minY = 100, maxY = 50;
    const r = Math.max(0, Math.min(1, ratio));
    const y = minY - (minY - maxY) * r;
    const h = minY - y;
    liquid.setAttribute('y', String(y));
    liquid.setAttribute('height', String(h));
    if (surface) {
      surface.setAttribute('cy', String(y));
      surface.setAttribute('rx', r > 0 ? String(13 - r * 4) : '0');
    }
  }

  _buildFlaskSvg() {
    return `
      <svg viewBox="0 0 100 120">
        <defs>
          <linearGradient id="atlFlaskBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff5d8" stop-opacity="0.6"/>
            <stop offset="1" stop-color="#d4a14a" stop-opacity="0.25"/>
          </linearGradient>
          <linearGradient id="atlLiquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f4cf6c"/>
            <stop offset="1" stop-color="#b6822e"/>
          </linearGradient>
          <clipPath id="atlBodyClip">
            <path d="M 38 28 L 38 50 Q 16 78 28 100 Q 50 116 72 100 Q 84 78 62 50 L 62 28 Z"/>
          </clipPath>
        </defs>
        <g opacity="0.8">
          <circle cx="50" cy="20" r="0" fill="#fff5d8" opacity="0.5">
            <animate attributeName="r" values="0;6;0" dur="3s" repeatCount="indefinite"/>
            <animate attributeName="cy" values="22;-4;-10" dur="3s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0.5;0" dur="3s" repeatCount="indefinite"/>
          </circle>
          <circle cx="44" cy="20" r="0" fill="#fff5d8" opacity="0.4">
            <animate attributeName="r" values="0;5;0" dur="3.5s" begin="0.6s" repeatCount="indefinite"/>
            <animate attributeName="cy" values="22;-2;-12" dur="3.5s" begin="0.6s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0.4;0" dur="3.5s" begin="0.6s" repeatCount="indefinite"/>
          </circle>
          <circle cx="56" cy="20" r="0" fill="#fff5d8" opacity="0.4">
            <animate attributeName="r" values="0;4;0" dur="2.7s" begin="1.2s" repeatCount="indefinite"/>
            <animate attributeName="cy" values="22;-3;-10" dur="2.7s" begin="1.2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0.4;0" dur="2.7s" begin="1.2s" repeatCount="indefinite"/>
          </circle>
        </g>
        <path d="M 38 28 L 38 50 Q 16 78 28 100 Q 50 116 72 100 Q 84 78 62 50 L 62 28"
              fill="url(#atlFlaskBody)" stroke="#5e3e10" stroke-width="1.6"/>
        <g clip-path="url(#atlBodyClip)">
          <rect class="atl-liquid-fill" id="atl-liquid-fill" x="0" y="100" width="100" height="0" fill="url(#atlLiquid)"/>
          <ellipse class="atl-liquid-fill" id="atl-liquid-surface" cx="50" cy="100" rx="0" ry="2" fill="#fff5d8" opacity="0.7"/>
        </g>
        <ellipse cx="50" cy="28" rx="13" ry="2.5" fill="none" stroke="#5e3e10" stroke-width="1.4"/>
        <ellipse cx="50" cy="28" rx="13" ry="2.5" fill="#3a2515" opacity="0.4"/>
        <path d="M 42 56 Q 32 76 38 96" stroke="#fff5d8" stroke-width="1.4" fill="none" opacity="0.45" stroke-linecap="round"/>
      </svg>
    `;
  }

  _updateCraftButton() {
    const btn = this.el.querySelector('#atl-craft-execute');
    if (btn) btn.disabled = !this._canCraft();
    this.el.querySelectorAll('.atl-mobile-craft-execute').forEach(mobileBtn => {
      mobileBtn.disabled = !this._canCraft();
    });
    const warningHost = this.el.querySelector('#atl-craft-warning-host');
    if (warningHost) warningHost.innerHTML = this._renderCapacityWarning();
  }

  // ============================================================
  // Detail body (right panel)
  // ============================================================

  _renderDetail() {
    const body = this.el.querySelector('#atl-detail-body');
    if (!body) return;
    const recipe = Recipes[this.selectedRecipeId];
    if (!recipe) {
      body.innerHTML = `<div class="atl-detail-empty">◇<br>レシピを選ぶと<br>ここに仕様が描かれます<br>◇</div>`;
      return;
    }
    const bp = ItemBlueprints[recipe.targetId];

    // Quality bar
    const preview = this._canCraft() ? this._computePreviewResult() : null;
    const cap = getCurrentQualityCap();
    const finalQ = preview?.finalQ ?? 0;
    const pct = Math.max(0, Math.min(100, (finalQ / cap) * 100));

    let html = `
      <div class="atl-q-card">
        <div class="atl-q-row">
          <div class="atl-q-label">品 質 <span class="atelier-en">Quality</span></div>
          <div class="atelier-q-value">${finalQ}<span class="atelier-q-max"> / ${cap}</span></div>
        </div>
        <div class="atelier-q-bar">
          <div class="atelier-q-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;

    if (bp.battleEffect) {
      html += `<div class="atl-craft-effect-info">${this._describeBattleEffect(bp.battleEffect)}</div>`;
    }

    html += `<div class="atl-trait-section" id="atl-trait-section"></div>`;
    html += `<div class="atl-preview-host" id="atl-preview-host"></div>`;

    body.innerHTML = html;

    this._renderTraits();
    this._renderPreview();
  }

  _renderTraits() {
    const traitsEl = this.el.querySelector('#atl-trait-section');
    if (!traitsEl) return;

    // Collect traits from assigned materials
    const traitSet = new Set();
    for (const mat of this.assignedMaterials) {
      if (mat && mat.traits) mat.traits.forEach(t => traitSet.add(t));
    }
    if (traitSet.size === 0) { traitsEl.innerHTML = ''; return; }

    // Drop traits that disappeared, auto-fill empty slots by rarity
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    this.selectedTraits = this.selectedTraits.filter(t => traitSet.has(t));
    const max = GameConfig.maxTraitSlots;
    if (this.selectedTraits.length < max) {
      const prioritized = [...traitSet]
        .filter(t => !this.selectedTraits.includes(t))
        .sort((a, b) => (rarityOrder[TraitDefs[a]?.rarity] ?? 5) - (rarityOrder[TraitDefs[b]?.rarity] ?? 5));
      for (const t of prioritized) {
        if (this.selectedTraits.length >= max) break;
        this.selectedTraits.push(t);
      }
    }

    const fusionMap = this._computeFusionMap();
    const items = [...traitSet]
      .sort((a, b) => (rarityOrder[TraitDefs[a]?.rarity] ?? 5) - (rarityOrder[TraitDefs[b]?.rarity] ?? 5))
      .map(t => {
        const def = TraitDefs[t];
        const selected = this.selectedTraits.includes(t);
        const runFx = this._getTraitRunEffects(def);
        const fusedTo = fusionMap[t];
        const fusedDef = fusedTo ? TraitDefs[fusedTo] : null;
        const rar = def?.rarity || 'common';
        return `<div class="atl-trait-item-wrap">
          <button class="atl-trait-toggle rar-${rar} ${selected ? 'selected' : ''} ${fusedTo ? 'will-fuse' : ''}"
                  data-trait="${t}" ${(this.selectedTraits.length >= max && !selected) ? 'disabled' : ''}>
            <span class="atl-trait-pip"></span>
            <span class="atl-trait-name">${t}</span>
            ${fusedTo ? `<span class="atl-trait-fuse-arrow rarity-${fusedDef?.rarity || 'common'}">→${fusedTo}</span>` : ''}
          </button>
          <div class="atl-trait-tooltip">
            <span class="atl-trait-tt-name rarity-${rar}">${t}</span>
            <span class="atl-trait-tt-rarity">${rar}</span>
            <p class="atl-trait-tt-desc">${def?.description || ''}</p>
            ${runFx ? `<p class="atl-trait-tt-run">${runFx}</p>` : ''}
            ${fusedTo && fusedDef ? `<p class="atl-trait-tt-fuse">✨ 融合: <span class="rarity-${fusedDef.rarity}">${fusedTo}</span> — ${fusedDef.description || ''}</p>` : ''}
          </div>
        </div>`;
      }).join('');

    traitsEl.innerHTML = `
      <div class="atl-trait-section-head">引き継ぎ特性<span class="atl-trait-counter">(${this.selectedTraits.length}/${max} 枠)</span></div>
      <div class="atl-trait-list">${items}</div>
    `;

    traitsEl.querySelectorAll('.atl-trait-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const trait = btn.dataset.trait;
        const idx = this.selectedTraits.indexOf(trait);
        if (idx >= 0) {
          this.selectedTraits.splice(idx, 1);
        } else if (this.selectedTraits.length < max) {
          this.selectedTraits.push(trait);
        }
        this._renderDetail();
        this._renderTargetCard();
      });
    });
  }

  _renderPreview() {
    const host = this.el.querySelector('#atl-preview-host');
    if (!host) return;
    if (!this._canCraft()) { host.innerHTML = ''; return; }

    const recipe = Recipes[this.selectedRecipeId];
    const bp = ItemBlueprints[recipe.targetId];
    const pr = this._computePreviewResult();
    if (!pr) { host.innerHTML = ''; return; }
    const { finalQ, fusionMap, finalTraits, capped } = pr;

    let html = `<h4>完成品プレビュー</h4>`;
    html += `<div class="preview-stats">`;
    if (capped) {
      html += `<div class="preview-row"><span>品質上限:</span><span class="preview-val">Q${finalQ} <span class="preview-cap-badge">上限</span></span></div>`;
    }

    if (bp.type === 'equipment' && bp.equipType === 'shield') {
      html += this._renderShieldDualPreview(bp, finalQ, recipe.targetId);
    } else if (bp.type === 'equipment' && this._isWeaponType(bp.equipType)) {
      const wc = GameConfig.weapon;
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

    // Trait fusion preview
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

    // Final traits (after fusion)
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
    host.innerHTML = html;
  }

  // ============================================================
  // Material picker modal
  // ============================================================

  _openMaterialPicker(slotIndex) {
    const recipe = Recipes[this.selectedRecipeId];
    const slot = recipe.materials[slotIndex];
    const usedUids = new Set(
      this.assignedMaterials
        .filter((m, idx) => m && idx !== slotIndex)
        .map(m => m.uid)
    );

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
      .filter(item => !usedUids.has(item.uid) && materialMatchesSlot(item.blueprintId, slot))
      .sort((a, b) => (b.quality - a.quality) || (traitScore(b) - traitScore(a)));

    const slotLabel = isCategorySlot(slot)
      ? (MaterialCategories[getCategoryId(slot)]?.name || slot)
      : (ItemBlueprints[slot]?.name || slot);

    const overlay = document.createElement('div');
    overlay.className = 'atl-craft-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '素材を選択');
    overlay.innerHTML = `
      <div class="atelier-parchment atl-craft-picker">
        <span class="atelier-corner tl"></span><span class="atelier-corner tr"></span>
        <span class="atelier-corner bl"></span><span class="atelier-corner br"></span>
        <button class="atl-craft-picker-close" aria-label="閉じる">✕</button>
        <div class="atelier-panel-head">
          <div class="atelier-panel-title">
            <span class="atelier-deco">◇</span>素材を選択<span class="atelier-en">Select Material</span>
          </div>
          <span class="atelier-panel-meta">${slotLabel}</span>
        </div>
        <div class="atl-craft-picker-list atelier-scrollarea">
          ${candidates.length === 0 ? '<div class="atl-craft-picker-empty">対応する素材がありません</div>' :
            candidates.map(item => {
              const bp = ItemBlueprints[item.blueprintId];
              const elemCls = bp?.element ? `elem-${bp.element}` : '';
              const iconHtml = bp?.image
                ? `<img src="${assetPath(bp.image)}" onerror="this.style.display='none'" alt="">`
                : '◆';
              const traitBadges = (item.traits || []).map(t => {
                const r = TraitDefs[t]?.rarity || 'common';
                return `<span class="atl-craft-picker-trait rarity-${r}">${t}</span>`;
              }).join('');
              return `
                <div class="atl-craft-picker-item" data-uid="${item.uid}">
                  <div class="atl-craft-picker-icon ${elemCls}">${iconHtml}</div>
                  <div class="atl-craft-picker-info">
                    <div class="atl-craft-picker-name">${item.name}</div>
                    ${traitBadges ? `<div class="atl-craft-picker-traits">${traitBadges}</div>` : ''}
                  </div>
                  <span class="atl-craft-picker-q-pill">Q${item.quality}</span>
                </div>
              `;
            }).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.atl-craft-picker-close').addEventListener('click', close);
    overlay.querySelectorAll('.atl-craft-picker-item').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid;
        const item = this.inventory.getItemByUid(uid);
        if (item) {
          this.assignedMaterials[slotIndex] = item;
          close();
          this._renderCauldron();
          this._renderTargetCard();
          this._renderDetail();
          this._updateCraftButton();
          this._renderMobileWorkbench();
          const allFilled = this.assignedMaterials.length > 0 && this.assignedMaterials.every(m => m != null);
          if (allFilled) this._scrollWorkspaceToBottomMobile();
        }
      });
    });
  }

  // ============================================================
  // Preserved calculation helpers (unchanged from prior version)
  // ============================================================

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

  /** 盾プレビュー — 武器スロット装備時と防具スロット装備時の両方のステータスを表示 */
  _renderShieldDualPreview(bp, finalQ, targetId) {
    let html = '';

    // ── 武器として装備した場合 ──
    const wc = GameConfig.weapon;
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

  /** 効果倍率バッジ — 値が0なら非表示。invert=true はクールダウン等「負が良い」系。 */
  _effectBadge(mult, invert) {
    if (!mult || Math.abs(mult) < 0.001) return '';
    const pct = Math.round(mult * 100);
    const isGood = invert ? pct < 0 : pct > 0;
    const cls = isGood ? 'up' : 'down';
    const arrow = isGood ? '▲' : '▼';
    const sign = pct > 0 ? '+' : '';
    return ` <span class="preview-diff ${cls}">${arrow}${sign}${pct}%</span>`;
  }

  /** 同 equipType の装備中武器と数値比較。 */
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
    const consumed = this.assignedMaterials.length;
    const projectedCount = this.inventory.items.length - consumed + 1;
    if (projectedCount > this.inventory.maxCapacity) return false;
    return true;
  }

  _renderCapacityWarning() {
    const consumed = this.assignedMaterials.length;
    const projectedCount = this.inventory.items.length - consumed + 1;
    if (projectedCount > this.inventory.maxCapacity) {
      return `<div class="atl-craft-warning">⚠️ 倉庫が上限を超えています (${this.inventory.items.length}/${this.inventory.maxCapacity})。倉庫画面で整理してください。</div>`;
    }
    return '';
  }

  // ============================================================
  // Craft execution + success animation
  // ============================================================

  _executeCraft() {
    if (!this._canCraft()) {
      const consumed = this.assignedMaterials.length;
      const projectedCount = this.inventory.items.length - consumed + 1;
      if (projectedCount > this.inventory.maxCapacity) {
        eventBus.emit('toast', { message: '倉庫が上限を超えているため調合できません。', type: 'error' });
      }
      return;
    }

    try {
      const item = craftItem(this.selectedRecipeId, this.assignedMaterials, this.selectedTraits, 0);

      // Detach equipped material UIDs first (prevent ghost UID references)
      const consumedUids = this.assignedMaterials.map(m => m.uid);
      eventBus.emit('inventory:uidsRemoved', { uids: consumedUids });

      // Consume materials
      for (const mat of this.assignedMaterials) {
        this.inventory.removeItem(mat.uid, true);
      }

      const targetBp = ItemBlueprints[item.blueprintId];
      if (targetBp?.type === 'pet_egg' && targetBp.petId) {
        eventBus.emit('pet:hatch', { petId: targetBp.petId, eggBlueprintId: item.blueprintId, quality: item.quality });
        eventBus.emit('toast', { message: `🥚 ${item.name} が孵化した！ ${targetBp.petId} を契約スロットから装備できます`, type: 'success' });
      } else {
        // Detect weapon skill tier unlock before adding to inventory
        let unlockedTierMessage = null;
        const skillDef = WeaponSkillDefs[item.blueprintId];
        if (skillDef) {
          const newTier = resolveSkillTier(item.blueprintId, item);
          let prevMaxTier = 0;
          for (const ex of this.inventory.items) {
            if (ex.blueprintId !== item.blueprintId) continue;
            const t = resolveSkillTier(ex.blueprintId, ex);
            if (t > prevMaxTier) prevMaxTier = t;
          }
          if (newTier > prevMaxTier && newTier > 0) {
            unlockedTierMessage = `✦ 強化T${newTier} 解放！「${skillDef.name}」がパワーアップ`;
          }
        }
        this.inventory.addItem(item);
        if (unlockedTierMessage) {
          setTimeout(() => eventBus.emit('toast', { message: unlockedTierMessage, type: 'success' }), 1400);
        }
      }

      // Atelier success animation: spin alchemy circle, show result toast + spark burst
      const cauldron = this.el.querySelector('#atl-cauldron');
      if (cauldron) cauldron.classList.add('is-crafting');
      this._showResultToast(item);
      this._spawnSparkBurst();

      setTimeout(() => {
        if (cauldron) cauldron.classList.remove('is-crafting');
        this.assignedMaterials = [];
        this.selectedTraits = [];
        this._renderCauldron();
        this._renderTargetCard();
        this._renderDetail();
        this._updateCraftButton();
        this._renderRecipeList();
        this._renderMobileRecipeList();
        this._renderMobileWorkbench();
      }, 1600);
    } catch (err) {
      eventBus.emit('toast', { message: `調合失敗: ${err.message}`, type: 'error' });
    }
  }

  _showResultToast(item) {
    const toast = document.createElement('div');
    toast.className = 'atl-craft-result-toast show';
    toast.innerHTML = `
      <div class="atl-craft-result-card">
        <div class="atl-craft-result-ribbon">— ✦ SYNTHESIS COMPLETE ✦ —</div>
        <div class="atl-craft-result-name">${item.name}</div>
        <div class="atl-craft-result-q">Q ${item.quality}</div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  _spawnSparkBurst() {
    const burst = document.createElement('div');
    burst.className = 'atl-craft-spark-burst';
    const count = 24;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const dist = 120 + Math.random() * 140;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const spark = document.createElement('div');
      spark.className = 'atl-craft-spark';
      spark.style.setProperty('--dx', `${dx}px`);
      spark.style.setProperty('--dy', `${dy}px`);
      spark.style.animationDelay = `${Math.random() * 0.2}s`;
      burst.appendChild(spark);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 2000);
  }
}
