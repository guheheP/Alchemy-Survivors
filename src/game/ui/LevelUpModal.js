/**
 * LevelUpModal — レベルアップ時の3択パッシブ選択モーダル（豪華版）
 */

import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints } from '../data/items.js';
import { assetPath } from '../core/assetPath.js';

export class LevelUpModal {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.id = 'levelup-modal';
    this.el.className = 'levelup-modal hidden';
    container.appendChild(this.el);

    this._unsub = eventBus.on('levelup:show', ({ level, choices }) => {
      this._show(level, choices);
    });
  }

  _show(level, choices) {
    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="levelup-overlay"></div>
      <div class="levelup-content">
        <div class="levelup-header">
          <div class="levelup-sparkle left">\u2726</div>
          <h2 class="levelup-title">\u2B50 LEVEL UP! \u2B50</h2>
          <div class="levelup-sparkle right">\u2726</div>
        </div>
        <div class="levelup-subtitle">Lv.${level} \u2014 \u5F37\u5316\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044</div>
        <div class="levelup-choices">
          ${choices.map((c, idx) => this._renderCard(c, idx)).join('')}
        </div>
      </div>
    `;

    // Stagger animation
    const cards = this.el.querySelectorAll('.levelup-card');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 0.1}s`;
    });

    // Click handlers
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const passiveId = card.dataset.id;
        // Flash selected card
        card.classList.add('selected');
        setTimeout(() => {
          this._hide();
          eventBus.emit('levelup:selected', { passiveId, isWeaponUnlock: passiveId === '__unlock_weapon__' });
          eventBus.emit('levelup:choose', { passiveId });
        }, 200);
      });
    });
  }

  _renderCard(choice, index) {
    const isWeapon = choice.isWeaponUnlock;
    let imageHtml = '';

    if (isWeapon) {
      // Try to find weapon image from description
      const cardClass = 'levelup-card weapon-unlock';
      return `
        <button class="${cardClass}" data-id="${choice.id}">
          <div class="levelup-card-glow"></div>
          <div class="levelup-card-inner">
            <div class="levelup-card-ribbon">\u6B66\u5668\u89E3\u653E</div>
            <div class="levelup-icon-wrap weapon-icon">
              <span class="levelup-icon">${choice.icon}</span>
            </div>
            <span class="levelup-name">${choice.name}</span>
            <span class="levelup-desc">${choice.description}</span>
          </div>
        </button>
      `;
    }

    return `
      <button class="levelup-card" data-id="${choice.id}">
        <div class="levelup-card-glow"></div>
        <div class="levelup-card-inner">
          <div class="levelup-icon-wrap">
            <span class="levelup-icon">${choice.icon}</span>
          </div>
          <span class="levelup-name">${choice.name}</span>
          <span class="levelup-desc">${choice.description}</span>
        </div>
      </button>
    `;
  }

  _hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  destroy() {
    this._unsub();
    this.el.remove();
  }
}
