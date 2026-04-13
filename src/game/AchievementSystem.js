/**
 * AchievementSystem — 実績トラッキング + 判定
 */

import { AchievementDefs } from './data/achievements.js';
import { Progression } from './data/progression.js';
import { eventBus } from './core/EventBus.js';

export class AchievementSystem {
  constructor(stats, unlockedIds = []) {
    this.stats = stats;
    this.unlocked = new Set(unlockedIds);
  }

  /** 全実績を判定し、新たに解放された実績を通知 */
  check() {
    const newlyUnlocked = [];

    for (const [id, def] of Object.entries(AchievementDefs)) {
      if (this.unlocked.has(id)) continue;

      if (this._evaluate(def.condition)) {
        this.unlocked.add(id);
        newlyUnlocked.push({ id, ...def });
        eventBus.emit('achievement:unlocked', { id, name: def.name, icon: def.icon, desc: def.desc });
        eventBus.emit('toast', { message: `${def.icon} 実績解放: ${def.name}`, type: 'special' });
      }
    }

    return newlyUnlocked;
  }

  _evaluate(condition) {
    switch (condition.type) {
      case 'stat':
        return (this.stats[condition.stat] || 0) >= condition.value;
      case 'count':
        return this._getCounter(condition.counter) >= condition.value;
      default:
        return false;
    }
  }

  _getCounter(counter) {
    switch (counter) {
      case 'defeatedBossCount':
        return Progression.getDefeatedCount();
      default:
        return 0;
    }
  }

  /** セーブ用にIDリストを返す */
  getUnlockedIds() {
    return [...this.unlocked];
  }

  /** 特定の実績が解放済みか */
  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  /** 進捗率を取得（stat系の場合） */
  getProgress(id) {
    const def = AchievementDefs[id];
    if (!def) return 0;
    if (this.unlocked.has(id)) return 1;
    const { condition } = def;
    if (condition.type === 'stat') {
      const current = this.stats[condition.stat] || 0;
      return Math.min(1, current / condition.value);
    }
    if (condition.type === 'count') {
      return Math.min(1, this._getCounter(condition.counter) / condition.value);
    }
    return 0;
  }
}
