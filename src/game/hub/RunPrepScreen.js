/**
 * RunPrepScreen — 出撃準備画面
 * Phase 2: マルチ武器表示対応
 */

import { AreaDefs } from '../data/areas.js';
import { ItemBlueprints } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';

export class RunPrepScreen {
  constructor(container, getWeaponSlots) {
    this.container = container;
    this.getWeaponSlots = getWeaponSlots;
    this.el = document.createElement('div');
    this.el.className = 'prep-screen';
    this.selectedArea = 'plains';
  }

  render() {
    const weaponSlots = this.getWeaponSlots();
    const equippedWeapons = weaponSlots.filter(w => w !== null);
    const area = AreaDefs[this.selectedArea];
    const canStart = equippedWeapons.length > 0;

    const weaponListHtml = equippedWeapons.length > 0
      ? equippedWeapons.map((w, i) => {
          const bp = ItemBlueprints[w.blueprintId];
          return `<span class="prep-weapon">${i + 1}. ${w.name} (Q${w.quality})</span>`;
        }).join('')
      : '<span class="prep-no-weapon">未装備</span>';

    this.el.innerHTML = `
      <div class="prep-layout">
        <div class="prep-area">
          <h3>ステージ選択</h3>
          <div class="area-list">
            ${Object.values(AreaDefs).map(a => `
              <div class="area-card ${a.id === this.selectedArea ? 'selected' : ''} ${a.unlocked ? '' : 'locked'}"
                   data-area="${a.id}" ${a.unlocked ? '' : 'aria-disabled="true"'}>
                <span class="area-icon">${a.icon}</span>
                <span class="area-name">${a.name}</span>
                ${!a.unlocked ? '<span class="area-lock">🔒</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="prep-summary">
          <h3>出撃準備</h3>
          <div class="prep-info">
            <div class="prep-row">
              <span>ステージ:</span>
              <span>${area.icon} ${area.name}</span>
            </div>
            <div class="prep-row-weapons">
              <span>武器 (${equippedWeapons.length}/4):</span>
              <div class="prep-weapon-list">${weaponListHtml}</div>
            </div>
          </div>
          ${!canStart ? '<p class="prep-warning">武器を1つ以上装備してください</p>' : ''}
          <button class="prep-start-btn" ${canStart ? '' : 'disabled'}>出撃！</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.area-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedArea = card.dataset.area;
        this.render();
      });
    });

    const startBtn = this.el.querySelector('.prep-start-btn');
    if (startBtn && canStart) {
      startBtn.addEventListener('click', () => {
        eventBus.emit('run:start', {
          weaponSlots: weaponSlots.filter(w => w !== null),
          areaId: this.selectedArea,
        });
      });
    }

    return this.el;
  }

  destroy() {
    this.el.remove();
  }
}
