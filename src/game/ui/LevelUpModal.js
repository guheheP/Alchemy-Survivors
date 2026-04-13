/**
 * LevelUpModal — レベルアップ時の3択パッシブ選択モーダル
 */

import { eventBus } from '../core/EventBus.js';

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
        <h2 class="levelup-title">レベルアップ！ Lv.${level}</h2>
        <div class="levelup-choices">
          ${choices.map(c => `
            <button class="levelup-card" data-id="${c.id}">
              <span class="levelup-icon">${c.icon}</span>
              <span class="levelup-name">${c.name}</span>
              <span class="levelup-desc">${c.description}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // カード選択イベント
    this.el.querySelectorAll('.levelup-card').forEach(card => {
      card.addEventListener('click', () => {
        const passiveId = card.dataset.id;
        this._hide();
        eventBus.emit('levelup:selected', { passiveId });

        // LevelUpSystemに通知
        eventBus.emit('levelup:choose', { passiveId });
      });
    });
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
