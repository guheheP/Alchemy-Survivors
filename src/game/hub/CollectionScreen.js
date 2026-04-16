/**
 * CollectionScreen — コレクション/図鑑
 * 発見したアイテム・撃破ボス・探索エリアを表示
 */

import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { AreaDefs } from '../data/areas.js';
import { Progression } from '../data/progression.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';

export class CollectionScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'collection-screen';
    this.activeTab = 'items';
  }

  render() {
    // 発見済みアイテム（インベントリに一度でも入ったことがあるBP）
    const discoveredBps = new Set();
    for (const item of this.inventory.items) {
      discoveredBps.add(item.blueprintId);
    }

    const totalBps = Object.keys(ItemBlueprints).length;
    const defeatedBosses = Progression.getDefeatedBosses();
    const unlockedAreas = Object.values(AreaDefs).filter(a => a.unlocked);

    this.el.innerHTML = `
      <div class="coll-layout">
        <div class="coll-header">
          <h3>図鑑</h3>
          <div class="coll-summary">
            <span>アイテム: ${discoveredBps.size}/${totalBps}</span>
            <span>ボス撃破: ${defeatedBosses.length}/7</span>
            <span>エリア: ${unlockedAreas.length}/8</span>
          </div>
        </div>
        <div class="coll-tabs">
          <button class="coll-tab ${this.activeTab === 'items' ? 'active' : ''}" data-tab="items">アイテム</button>
          <button class="coll-tab ${this.activeTab === 'bosses' ? 'active' : ''}" data-tab="bosses">ボス</button>
          <button class="coll-tab ${this.activeTab === 'areas' ? 'active' : ''}" data-tab="areas">エリア</button>
          <button class="coll-tab ${this.activeTab === 'traits' ? 'active' : ''}" data-tab="traits">特性</button>
        </div>
        <div class="coll-content" id="coll-content"></div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.coll-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.el.querySelectorAll('.coll-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderContent(discoveredBps, defeatedBosses);
      });
    });

    this._renderContent(discoveredBps, defeatedBosses);
    return this.el;
  }

  _renderContent(discoveredBps, defeatedBosses) {
    const content = this.el.querySelector('#coll-content');

    switch (this.activeTab) {
      case 'items':
        this._renderItems(content, discoveredBps);
        break;
      case 'bosses':
        this._renderBosses(content, defeatedBosses);
        break;
      case 'areas':
        this._renderAreas(content);
        break;
      case 'traits':
        this._renderTraits(content);
        break;
    }
  }

  _renderItems(container, discoveredBps) {
    const categories = {
      material: { label: '素材', items: [] },
      equipment: { label: '装備', items: [] },
      accessory: { label: 'アクセサリ', items: [] },
      consumable: { label: '消耗品', items: [] },
    };

    for (const [id, bp] of Object.entries(ItemBlueprints)) {
      const discovered = discoveredBps.has(id);
      const cat = categories[bp.type];
      if (cat) cat.items.push({ id, bp, discovered });
    }

    let html = '';
    for (const [type, cat] of Object.entries(categories)) {
      const discoveredCount = cat.items.filter(i => i.discovered).length;
      html += `<div class="coll-category">
        <h4>${cat.label} (${discoveredCount}/${cat.items.length})</h4>
        <div class="coll-grid">
          ${cat.items.map(({ id, bp, discovered }) => `
            <div class="coll-item ${discovered ? 'discovered' : 'undiscovered'}">
              ${discovered
                ? `<img src="${bp.image ? assetPath(bp.image) : ''}" class="coll-item-icon" onerror="this.style.display='none'" alt="">
                   <span class="coll-item-name">${bp.name}</span>`
                : `<span class="coll-item-unknown">???</span>`
              }
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    container.innerHTML = html;
  }

  _renderBosses(container, defeatedBosses) {
    const defeatedSet = new Set(defeatedBosses);
    const bosses = Object.values(AreaDefs)
      .filter(a => a.boss)
      .map(a => ({ area: a, boss: a.boss, defeated: defeatedSet.has(a.boss.id) }));

    container.innerHTML = `
      <div class="coll-boss-grid">
        ${bosses.map(({ area, boss, defeated }) => `
          <div class="coll-boss-card ${defeated ? 'defeated' : 'locked'}">
            <div class="coll-boss-icon">${defeated ? boss.icon : '❓'}</div>
            <div class="coll-boss-info">
              <span class="coll-boss-name">${defeated ? boss.name : '???'}</span>
              <span class="coll-boss-area">${area.icon} ${area.name}</span>
              ${defeated ? `
                <div class="coll-boss-stats">
                  <span>HP: ${boss.maxHp}</span>
                  <span>ATK: ${boss.atk}</span>
                  <span>DEF: ${boss.def}</span>
                </div>
                <div class="coll-boss-phases">
                  ${boss.phases.map(p => `<span class="coll-phase">${p.name}</span>`).join('')}
                </div>
              ` : '<span class="coll-boss-hint">このボスはまだ撃破されていません</span>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderAreas(container) {
    container.innerHTML = `
      <div class="coll-area-grid">
        ${Object.values(AreaDefs).map(area => `
          <div class="coll-area-card ${area.unlocked ? 'unlocked' : 'locked'}">
            <div class="coll-area-icon">${area.icon}</div>
            <div class="coll-area-info">
              <span class="coll-area-name">${area.unlocked ? area.name : '???'}</span>
              ${area.unlocked ? `
                <span class="coll-area-desc">${area.description}</span>
                <span class="coll-area-diff">難易度: ${'★'.repeat(area.difficulty + 1)}</span>
                <span class="coll-area-quality">品質: Q${area.qualityMin}〜Q${area.qualityMax}</span>
              ` : '<span class="coll-area-hint">未解放</span>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderTraits(container) {
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const grouped = {};
    for (const rarity of rarityOrder) grouped[rarity] = [];

    for (const [name, def] of Object.entries(TraitDefs)) {
      if (grouped[def.rarity]) grouped[def.rarity].push({ name, def });
    }

    const rarityLabels = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' };

    container.innerHTML = rarityOrder.map(rarity => {
      const traits = grouped[rarity];
      if (traits.length === 0) return '';
      return `<div class="coll-trait-group">
        <h4 class="rarity-${rarity}">${rarityLabels[rarity]} (${traits.length})</h4>
        <div class="coll-trait-list">
          ${traits.map(({ name, def }) => {
            const runEffects = [];
            let hasEquip = false, hasCraft = false;
            if (def.effects) {
              for (const [key, val] of Object.entries(def.effects)) {
                if (key.startsWith('run')) {
                  hasEquip = true;
                  const label = {
                    runDamageFlat: 'ダメージ', runDamageReduction: '軽減', runMaxHpFlat: 'HP',
                    runMoveSpeed: '速度', runRegenPerSec: '回復/秒', runDodge: '回避',
                    runDropRate: 'ドロップ', runAttackSpeed: '攻速', runExpBonus: '経験値',
                    runStartInvincible: '開始無敵',
                    runCritChance: 'クリ率', runCritDamage: 'クリダメ',
                    runElementProc: '属性発動', runElementPower: '属性威力',
                  }[key] || key;
                  runEffects.push(`${label}+${typeof val === 'number' && val < 1 ? (val * 100).toFixed(0) + '%' : val}`);
                } else if (key === 'craftQualityBonus') {
                  hasCraft = true;
                }
              }
            }
            const pills = (hasEquip ? `<span class="trait-cat-pill trait-cat-equip" title="装備中に発動">装</span>` : '')
              + (hasCraft ? `<span class="trait-cat-pill trait-cat-craft" title="素材として調合時に発動">素</span>` : '');
            return `<div class="coll-trait-item rarity-${rarity}">
              <span class="coll-trait-name">${pills}${name}</span>
              <span class="coll-trait-desc">${def.description}</span>
              ${runEffects.length > 0 ? `<span class="coll-trait-run">${runEffects.join(' / ')}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  }

  destroy() {
    this.el.remove();
  }
}
