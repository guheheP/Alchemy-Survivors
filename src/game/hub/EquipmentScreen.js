/**
 * EquipmentScreen — 装備変更UI（4武器スロット）
 */

import { ItemBlueprints } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';

const MAX_WEAPON_SLOTS = 4;

export class EquipmentScreen {
  constructor(container, inventorySystem) {
    this.container = container;
    this.inventory = inventorySystem;
    this.el = document.createElement('div');
    this.el.className = 'equip-screen';
    this.weaponSlots = [null, null, null, null]; // 4 weapon slots
  }

  render() {
    const allWeapons = this.inventory.getItemsByType('equipment').filter(item => {
      const bp = ItemBlueprints[item.blueprintId];
      return bp && bp.equipType;
    });

    // Get UIDs of equipped weapons to mark them
    const equippedUids = new Set(this.weaponSlots.filter(w => w).map(w => w.uid));

    this.el.innerHTML = `
      <div class="equip-layout">
        <div class="equip-current">
          <h3>装備セット</h3>
          <p class="equip-hint">武器を4枠まで装備可能。ラン中にレベルアップで順番に解放されます。</p>
          <div class="equip-slots">
            ${this.weaponSlots.map((weapon, i) => {
              const bp = weapon ? ItemBlueprints[weapon.blueprintId] : null;
              const wc = GameConfig.weapon;
              let statsHtml = '';
              if (weapon && bp) {
                const dmg = (bp.baseValue / wc.damageBaseDivisor + weapon.quality / wc.damageQualityDivisor).toFixed(1);
                statsHtml = `<span class="slot-stats">ATK:${dmg} Q${weapon.quality}</span>`;
              }
              return `<div class="weapon-slot ${weapon ? 'filled' : 'empty'}" data-slot="${i}">
                <span class="slot-number">${i + 1}</span>
                ${weapon
                  ? `<img src="${bp?.image ? assetPath(bp.image) : ''}" class="slot-icon" onerror="this.style.display='none'" alt="">
                     <span class="slot-name">${weapon.name}</span>
                     ${statsHtml}
                     <button class="slot-remove" data-slot="${i}">✕</button>`
                  : `<span class="slot-empty-label">${i === 0 ? '初期武器（必須）' : '空きスロット'}</span>`
                }
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="equip-inventory">
          <h4>装備可能な武器</h4>
          <div class="equip-list">
            ${allWeapons.length === 0
              ? '<p class="equip-no-weapons">装備可能な武器がありません。錬金工房で作りましょう！</p>'
              : allWeapons.map(w => {
                  const bp = ItemBlueprints[w.blueprintId];
                  const isEquipped = equippedUids.has(w.uid);
                  return `<div class="equip-weapon-card ${isEquipped ? 'equipped' : ''}" data-uid="${w.uid}">
                    <img src="${bp?.image ? assetPath(bp.image) : ''}" class="equip-card-icon" onerror="this.style.display='none'" alt="">
                    <div class="equip-card-info">
                      <span class="equip-card-name">${w.name}</span>
                      <span class="equip-card-quality">Q${w.quality}</span>
                      ${w.traits.length > 0 ? `<span class="equip-card-traits">${w.traits.join(', ')}</span>` : ''}
                    </div>
                    ${isEquipped ? '<span class="equip-badge">装備中</span>' : ''}
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    // Click weapon card to equip into first empty slot
    this.el.querySelectorAll('.equip-weapon-card:not(.equipped)').forEach(card => {
      card.addEventListener('click', () => {
        const uid = card.dataset.uid;
        const item = this.inventory.getItemByUid(uid);
        if (!item) return;

        // Find first empty slot
        const emptyIdx = this.weaponSlots.indexOf(null);
        if (emptyIdx === -1) return; // all full

        this.weaponSlots[emptyIdx] = item;
        this._emitChange();
        this.render();
      });
    });

    // Remove buttons
    this.el.querySelectorAll('.slot-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.slot);
        this.weaponSlots[idx] = null;
        // Compact: shift weapons down to fill gaps
        this._compactSlots();
        this._emitChange();
        this.render();
      });
    });

    return this.el;
  }

  _compactSlots() {
    const filled = this.weaponSlots.filter(w => w !== null);
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
      this.weaponSlots[i] = filled[i] || null;
    }
  }

  _emitChange() {
    eventBus.emit('equipment:changed', {
      weaponSlots: [...this.weaponSlots],
    });
  }

  destroy() {
    this.el.remove();
  }
}
