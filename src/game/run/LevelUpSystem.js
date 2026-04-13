/**
 * LevelUpSystem — ラン内レベルアップ・パッシブ選択
 * Phase 2: 武器解放を選択肢に追加
 */

import { PassiveDefs } from '../data/passives.js';
import { GameConfig } from '../data/config.js';
import { eventBus } from '../core/EventBus.js';

export class LevelUpSystem {
  constructor(player, weaponSystem) {
    this.player = player;
    this.weaponSystem = weaponSystem;
    this.totalExp = 0;
    this.passiveStacks = {};
    this.pendingLevelUp = false;

    this._unsubExp = eventBus.on('exp:collected', ({ value }) => {
      this.totalExp += value;
      this._checkLevelUp();
      eventBus.emit('player:expChanged', {
        exp: this.totalExp,
        expToNext: this._expToNextLevel(),
        level: this.player.level,
      });
    });
  }

  _expToNextLevel() {
    const { expBase, expScale } = GameConfig.run;
    return Math.floor(expBase * Math.pow(this.player.level, expScale));
  }

  _checkLevelUp() {
    const needed = this._expToNextLevel();
    if (this.totalExp >= needed && !this.pendingLevelUp) {
      this.totalExp -= needed;
      this.player.level++;
      this.pendingLevelUp = true;

      const choices = this._pickChoices(3);
      eventBus.emit('levelup:show', { level: this.player.level, choices });
    }
  }

  _pickChoices(count) {
    const choices = [];

    // 武器解放の候補（ロックされた武器がある場合）
    if (this.weaponSystem.hasLockedWeapons) {
      const nextIdx = this.weaponSystem.unlockedCount;
      const nextStrategy = this.weaponSystem.strategies[nextIdx];
      choices.push({
        id: '__unlock_weapon__',
        name: `${nextStrategy.weaponName} を解放`,
        description: `武器スロット${nextIdx + 1}の${nextStrategy.weaponName}を使用可能にする`,
        icon: '🗡️',
        isWeaponUnlock: true,
      });
    }

    // パッシブ候補（上限未到達のもの）
    const available = PassiveDefs.filter(p => {
      const stacks = this.passiveStacks[p.id] || 0;
      return stacks < p.maxStacks;
    });

    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const passiveCount = count - choices.length;
    choices.push(...shuffled.slice(0, passiveCount));

    // 3択にシャッフル
    return choices.sort(() => Math.random() - 0.5).slice(0, count);
  }

  selectPassive(passiveId) {
    if (passiveId === '__unlock_weapon__') {
      this.weaponSystem.unlockNext();
      this.pendingLevelUp = false;
      eventBus.emit('levelup:selected', { passiveId, isWeaponUnlock: true });
      this._checkLevelUp();
      return;
    }

    const def = PassiveDefs.find(p => p.id === passiveId);
    if (!def) return;

    this.passiveStacks[passiveId] = (this.passiveStacks[passiveId] || 0) + 1;
    this.player.addPassive(def);
    this.pendingLevelUp = false;

    eventBus.emit('levelup:selected', { passiveId, stacks: this.passiveStacks[passiveId] });
    this._checkLevelUp();
  }

  destroy() {
    this._unsubExp();
  }
}
