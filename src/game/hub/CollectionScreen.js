/**
 * CollectionScreen — コレクション/図鑑
 * 発見したアイテム・撃破ボス・探索エリアを表示
 */

import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { AreaDefs } from '../data/areas.js';
import { Progression } from '../data/progression.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';
import { fmt1, fmtPct1 } from '../ui/NumberFormat.js';

export class CollectionScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'collection-screen';
    this.activeTab = 'items';
    // 事前にアイテム → 産出エリア の逆引きインデックスを構築
    this._materialToAreas = this._buildMaterialAreaIndex();
  }

  /** 全エリアのドロップテーブルを走査し、blueprintId → 産出エリア情報 を構築 */
  _buildMaterialAreaIndex() {
    const idx = {};
    for (const area of Object.values(AreaDefs)) {
      if (!Array.isArray(area.dropTable)) continue;
      const totalWeight = area.dropTable.reduce((s, d) => s + (d.weight || 0), 0) || 1;
      for (const drop of area.dropTable) {
        const id = drop.blueprintId;
        if (!id) continue;
        if (!idx[id]) idx[id] = [];
        idx[id].push({
          areaId: area.id,
          areaName: area.name,
          areaIcon: area.icon,
          areaUnlocked: !!area.unlocked,
          weight: drop.weight || 0,
          percent: ((drop.weight || 0) / totalWeight) * 100,
        });
      }
    }
    // 各エリアの重み順で降順ソート
    for (const id in idx) idx[id].sort((a, b) => b.percent - a.percent);
    return idx;
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
          ${cat.items.map(({ id, bp, discovered }) => {
            // 素材: 産出エリア情報を data-tooltip に埋め込む
            let tooltipAttrs = '';
            if (discovered && bp.type === 'material') {
              const areas = this._materialToAreas[id] || [];
              if (areas.length > 0) {
                const lines = areas.map(a => {
                  const lockIcon = a.areaUnlocked ? '' : '🔒 ';
                  return `${lockIcon}${a.areaIcon} ${a.areaName} (${a.percent.toFixed(0)}%)`;
                }).join(' / ');
                const title = `${bp.name} の産出地`;
                tooltipAttrs = ` tabindex="0" role="button" data-tooltip="${this._escapeAttr(lines)}" data-tooltip-title="${this._escapeAttr(title)}"`;
              } else {
                tooltipAttrs = ` data-tooltip="調合または中間素材" data-tooltip-title="${this._escapeAttr(bp.name)}"`;
              }
            } else if (discovered) {
              tooltipAttrs = ` data-tooltip="${this._escapeAttr(bp.name)}" data-tooltip-title="${this._escapeAttr(bp.name)}"`;
            }
            return `
            <div class="coll-item ${discovered ? 'discovered' : 'undiscovered'}"${tooltipAttrs}>
              ${discovered
                ? `<img src="${bp.image ? assetPath(bp.image) : ''}" class="coll-item-icon" onerror="this.style.display='none'" alt="">
                   <span class="coll-item-name">${bp.name}</span>
                   ${bp.type === 'material' ? this._renderMaterialAreaHint(id) : ''}`
                : `<span class="coll-item-unknown">???</span>`
              }
            </div>
          `;
          }).join('')}
        </div>
      </div>`;
    }

    container.innerHTML = html;
  }

  /** 素材カードの下に表示する短い産出エリアヒント */
  _renderMaterialAreaHint(blueprintId) {
    const areas = this._materialToAreas[blueprintId];
    if (!areas || areas.length === 0) return '<span class="coll-item-source">調合/中間</span>';
    // アイコンのみ (スペース節約)
    const icons = areas.slice(0, 4).map(a => {
      const cls = a.areaUnlocked ? '' : 'coll-area-locked';
      return `<span class="coll-source-area ${cls}" title="${a.areaName} ${a.percent.toFixed(0)}%">${a.areaIcon}</span>`;
    }).join('');
    const more = areas.length > 4 ? `<span class="coll-source-more">+${areas.length - 4}</span>` : '';
    return `<span class="coll-item-source">${icons}${more}</span>`;
  }

  /** 文字列をHTML属性用にエスケープ */
  _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        ${Object.values(AreaDefs).map(area => {
          const unlocked = area.unlocked;
          const drops = Array.isArray(area.dropTable) ? area.dropTable : [];
          const totalWeight = drops.reduce((s, d) => s + (d.weight || 0), 0) || 1;
          const dropListHtml = drops.length > 0
            ? `<div class="coll-area-drops">
                <h5>産出素材 (${drops.length}種)</h5>
                <div class="coll-drop-list">
                  ${drops.map(d => {
                    const bp = ItemBlueprints[d.blueprintId];
                    if (!bp) return '';
                    const percent = ((d.weight || 0) / totalWeight) * 100;
                    const imgSrc = bp.image ? assetPath(bp.image) : '';
                    return `<div class="coll-drop-row" data-tooltip="${this._escapeAttr(bp.name)} (重み ${d.weight})" data-tooltip-title="${this._escapeAttr(bp.name)}">
                      <img src="${imgSrc}" class="coll-drop-icon" onerror="this.style.display='none'" alt="">
                      <span class="coll-drop-name">${bp.name}</span>
                      <span class="coll-drop-tier">T${bp.tier || '-'}</span>
                      <span class="coll-drop-bar"><span class="coll-drop-bar-fill" style="width:${Math.min(100, percent * 2)}%"></span></span>
                      <span class="coll-drop-pct">${percent.toFixed(0)}%</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>`
            : '';
          return `
          <div class="coll-area-card ${unlocked ? 'unlocked' : 'locked'}">
            <div class="coll-area-card-head">
              <div class="coll-area-icon">${area.icon}</div>
              <div class="coll-area-info">
                <span class="coll-area-name">${unlocked ? area.name : '???'}</span>
                ${unlocked ? `
                  <span class="coll-area-desc">${area.description}</span>
                  <span class="coll-area-diff">難易度: ${'★'.repeat(area.difficulty + 1)}</span>
                  <span class="coll-area-quality">品質: Q${area.qualityMin}〜Q${area.qualityMax}</span>
                ` : '<span class="coll-area-hint">未解放</span>'}
              </div>
            </div>
            ${unlocked ? dropListHtml : ''}
          </div>
        `;
        }).join('')}
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
                    runCritChance: '会心率', runCritDamage: '会心ダメ',
                    runElementProc: '属性発動', runElementPower: '属性威力',
                  }[key] || key;
                  runEffects.push(`${label}+${typeof val === 'number' && val < 1 && val > 0 ? fmtPct1(val) + '%' : fmt1(val)}`);
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
