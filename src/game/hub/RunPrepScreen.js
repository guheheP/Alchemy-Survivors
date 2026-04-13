/**
 * RunPrepScreen — 出撃準備画面
 * Phase 2: マルチ武器表示対応
 */

import { AreaDefs } from '../data/areas.js';
import { ItemBlueprints } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';

export class RunPrepScreen {
  constructor(container, getWeaponSlots, getArmor, getAccessory, inventory) {
    this.container = container;
    this.getWeaponSlots = getWeaponSlots;
    this.getArmor = getArmor;
    this.getAccessory = getAccessory;
    this.inventory = inventory;
    this.selectedConsumables = [];
    this.el = document.createElement('div');
    this.el.className = 'prep-screen';
    this.selectedArea = 'plains';
  }

  render() {
    const weaponSlots = this.getWeaponSlots();
    const equippedWeapons = weaponSlots.filter(w => w !== null);
    const armor = this.getArmor();
    const accessory = this.getAccessory();
    const area = AreaDefs[this.selectedArea];
    const canStart = equippedWeapons.length > 0;

    const weaponListHtml = equippedWeapons.length > 0
      ? equippedWeapons.map((w, i) => {
          const bp = ItemBlueprints[w.blueprintId];
          return `<span class="prep-weapon">${i + 1}. ${w.name} (Q${w.quality})</span>`;
        }).join('')
      : '<span class="prep-no-weapon">未装備</span>';

    const armorHtml = armor ? `🛡 ${armor.name} (Q${armor.quality})` : '未装備';
    const accessoryHtml = accessory ? `💍 ${accessory.name} (Q${accessory.quality})` : '未装備';

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
            <div class="prep-row">
              <span>防具:</span>
              <span>${armorHtml}</span>
            </div>
            <div class="prep-row">
              <span>アクセサリ:</span>
              <span>${accessoryHtml}</span>
            </div>
            <div class="prep-consumables">
              <h4>消耗品 (${this.selectedConsumables.length}/3)</h4>
              <div class="prep-consumable-slots">
                ${[0, 1, 2].map(i => {
                  const c = this.selectedConsumables[i];
                  const cBp = c ? ItemBlueprints[c.blueprintId] : null;
                  const cEffect = cBp?.battleEffect ? this._describeBattleEffect(cBp.battleEffect) : '';
                  return c
                    ? `<div class="prep-cons-slot filled" data-idx="${i}">
                        <span class="cons-key">${i + 1}</span>
                        <div class="cons-slot-info">
                          <span>${c.name}</span>
                          <span class="cons-slot-effect">${cEffect}</span>
                        </div>
                        <button class="cons-remove" data-idx="${i}">✕</button>
                      </div>`
                    : `<div class="prep-cons-slot empty" data-idx="${i}">
                        <span class="cons-key">${i + 1}</span>
                        <button class="cons-add" data-idx="${i}">+追加</button>
                      </div>`;
                }).join('')}
              </div>
            </div>
            <div class="prep-stage-info">
              <h4>ステージ情報</h4>
              <div class="prep-row"><span>難易度:</span><span>${'★'.repeat(area.difficulty + 1)}</span></div>
              <div class="prep-row"><span>ドロップ品質:</span><span>Q${area.qualityMin}〜Q${area.qualityMax}</span></div>
              <div class="prep-row"><span>ボス:</span><span>${area.boss ? `${area.boss.icon} ${area.boss.name} (HP${area.boss.maxHp})` : 'なし'}</span></div>
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

    // 消耗品スロットのイベント
    this.el.querySelectorAll('.cons-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this._showConsumablePicker(idx);
      });
    });
    this.el.querySelectorAll('.cons-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.selectedConsumables.splice(idx, 1);
        this.render();
      });
    });

    const startBtn = this.el.querySelector('.prep-start-btn');
    if (startBtn && canStart) {
      startBtn.addEventListener('click', () => {
        eventBus.emit('run:start', {
          weaponSlots: weaponSlots.filter(w => w !== null),
          areaId: this.selectedArea,
          consumables: [...this.selectedConsumables],
        });
      });
    }

    return this.el;
  }

  _showConsumablePicker(slotIdx) {
    const consumables = this.inventory
      ? this.inventory.items.filter(item => {
          const bp = ItemBlueprints[item.blueprintId];
          return bp && bp.type === 'consumable' && !this.selectedConsumables.some(sc => sc.uid === item.uid);
        })
      : [];

    const overlay = document.createElement('div');
    overlay.className = 'cons-picker-overlay';
    overlay.innerHTML = `
      <div class="cons-picker">
        <h4>消耗品を選択 (スロット ${slotIdx + 1})</h4>
        ${consumables.length > 0
          ? consumables.map((item, i) => {
              const bp = ItemBlueprints[item.blueprintId];
              const effectDesc = bp?.battleEffect ? this._describeBattleEffect(bp.battleEffect) : '';
              return `<div class="cons-picker-item" data-item-idx="${i}">
                <span class="cons-picker-name">${item.name} (Q${item.quality})</span>
                <span class="cons-picker-effect">${effectDesc}</span>
              </div>`;
            }).join('')
          : '<p style="color:#888;text-align:center;">使用可能な消耗品がありません</p>'
        }
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        return;
      }
      const pickerItem = e.target.closest('.cons-picker-item');
      if (pickerItem) {
        const itemIdx = parseInt(pickerItem.dataset.itemIdx, 10);
        const selected = consumables[itemIdx];
        if (selected) {
          if (slotIdx < this.selectedConsumables.length) {
            this.selectedConsumables[slotIdx] = selected;
          } else {
            this.selectedConsumables.push(selected);
          }
          overlay.remove();
          this.render();
        }
      }
    });

    document.body.appendChild(overlay);
  }

  _describeBattleEffect(fx) {
    const statNames = { atk: '攻撃力', def: '防御力', spd: '速度' };
    switch (fx.type) {
      case 'heal': return `💚 HP${fx.value}回復`;
      case 'healfull': return `💚 HP全回復`;
      case 'buff': return `⬆️ ${statNames[fx.stat] || fx.stat}+${fx.amount} (${fx.duration}秒)`;
      case 'debuff': return `⬇️ 敵${statNames[fx.stat] || fx.stat}${fx.amount} (${fx.duration}秒)`;
      case 'damage': return `💥 周囲ダメージ${fx.value}`;
      case 'stun': return `⚡ スタン${fx.duration}秒`;
      default: return '';
    }
  }

  destroy() {
    const picker = document.querySelector('.cons-picker-overlay');
    if (picker) picker.remove();
    this.el.remove();
  }
}
