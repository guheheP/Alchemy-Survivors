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
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'levelup-title');
    container.appendChild(this.el);

    this._pendingTimeouts = new Set();
    this._onKeyDown = null;
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
          <h2 class="levelup-title" id="levelup-title">\u2B50 LEVEL UP! \u2B50</h2>
          <div class="levelup-sparkle right">\u2726</div>
        </div>
        <div class="levelup-subtitle">Lv.${level} \u2014 \u5F37\u5316\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044</div>
        <div class="levelup-choices" role="group">
          ${choices.map((c, idx) => this._renderCard(c, idx)).join('')}
        </div>
        <div class="levelup-hint">
          <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> キーでも選択できます
        </div>
      </div>
    `;

    // Stagger animation
    const cards = this.el.querySelectorAll('.levelup-card');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 0.1}s`;
    });

    // Click handlers — 連打による多重発火を selectedLocked でガード
    this._selectedLocked = false;
    const handleSelect = (card) => {
      if (this._selectedLocked) return;
      this._selectedLocked = true;
      const passiveId = card.dataset.id;
      card.classList.add('selected');
      const tid = setTimeout(() => {
        this._pendingTimeouts.delete(tid);
        this._hide();
        eventBus.emit('levelup:selected', { passiveId, isWeaponUnlock: passiveId === '__unlock_weapon__' });
        eventBus.emit('levelup:choose', { passiveId });
      }, 200);
      this._pendingTimeouts.add(tid);
    };

    cards.forEach(card => {
      card.addEventListener('click', () => handleSelect(card));
    });

    // Keyboard shortcut (1/2/3)
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    this._onKeyDown = (e) => {
      if (this.el.classList.contains('hidden')) return;
      const n = parseInt(e.key, 10);
      if (Number.isInteger(n) && n >= 1 && n <= cards.length) {
        e.preventDefault();
        handleSelect(cards[n - 1]);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Focus the first card for keyboard accessibility
    if (cards[0]) cards[0].focus();
  }

  _renderCard(choice, index) {
    const isWeapon = choice.isWeaponUnlock;
    let imageHtml = '';

    const shortcut = index + 1;

    if (isWeapon) {
      const cardClass = 'levelup-card weapon-unlock';
      return `
        <button class="${cardClass}" data-id="${choice.id}" aria-label="${choice.name} (武器解放)">
          <span class="levelup-card-shortcut" aria-hidden="true">${shortcut}</span>
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
      <button class="levelup-card" data-id="${choice.id}" aria-label="${choice.name}">
        <span class="levelup-card-shortcut" aria-hidden="true">${shortcut}</span>
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
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    for (const tid of this._pendingTimeouts) clearTimeout(tid);
    this._pendingTimeouts.clear();
    this.el.remove();
  }
}
