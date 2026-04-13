/**
 * AchievementScreen — 実績一覧画面
 */

import { AchievementDefs, AchievementCategories } from '../data/achievements.js';

export class AchievementScreen {
  constructor(container, achievementSystem) {
    this.container = container;
    this.system = achievementSystem;
    this.el = document.createElement('div');
    this.el.className = 'achievement-screen';
    this.activeCategory = 'all';
  }

  render() {
    const allIds = Object.keys(AchievementDefs);
    const unlockedCount = allIds.filter(id => this.system.isUnlocked(id)).length;
    const totalCount = allIds.length;

    const categories = [
      { key: 'all', label: `全て (${unlockedCount}/${totalCount})` },
      ...Object.entries(AchievementCategories).map(([key, label]) => {
        const catIds = allIds.filter(id => AchievementDefs[id].category === key);
        const catUnlocked = catIds.filter(id => this.system.isUnlocked(id)).length;
        return { key, label: `${label} (${catUnlocked}/${catIds.length})` };
      }),
    ];

    const filtered = this.activeCategory === 'all'
      ? allIds
      : allIds.filter(id => AchievementDefs[id].category === this.activeCategory);

    this.el.innerHTML = `
      <div class="ach-header">
        <h3>実績</h3>
        <div class="ach-progress">達成率: ${unlockedCount} / ${totalCount} (${Math.floor(unlockedCount / totalCount * 100)}%)</div>
      </div>
      <div class="ach-categories">
        ${categories.map(c => `
          <button class="ach-cat-btn ${this.activeCategory === c.key ? 'active' : ''}" data-cat="${c.key}">${c.label}</button>
        `).join('')}
      </div>
      <div class="ach-list">
        ${filtered.map(id => {
          const def = AchievementDefs[id];
          const unlocked = this.system.isUnlocked(id);
          const progress = this.system.getProgress(id);
          const progressPct = Math.floor(progress * 100);
          return `
            <div class="ach-card ${unlocked ? 'unlocked' : 'locked'}">
              <span class="ach-icon">${unlocked ? def.icon : '?'}</span>
              <div class="ach-info">
                <span class="ach-name">${unlocked ? def.name : '???'}</span>
                <span class="ach-desc">${unlocked ? def.desc : '条件を達成すると解放'}</span>
                ${!unlocked ? `<div class="ach-bar"><div class="ach-bar-fill" style="width:${progressPct}%"></div></div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.ach-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.dataset.cat;
        this.container.innerHTML = '';
        this.render();
      });
    });
  }

  destroy() {
    this.el.remove();
  }
}
