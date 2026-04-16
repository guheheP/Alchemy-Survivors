/**
 * StatsScreen — 統計・記録画面
 */

import { AreaDefs } from '../data/areas.js';

const WEAPON_NAMES = {
  sword: '剣', spear: '槍', bow: '弓', staff: '杖', dagger: '短剣', shield: '盾',
};

export class StatsScreen {
  constructor(container, stats) {
    this.container = container;
    this.stats = stats;
    this.el = document.createElement('div');
    this.el.className = 'stats-screen';
  }

  render() {
    const s = this.stats;
    const playH = Math.floor(s.totalPlayTime / 3600);
    const playM = Math.floor((s.totalPlayTime % 3600) / 60);
    const survH = Math.floor(s.bestSurvivalTime / 60);
    const survS = Math.floor(s.bestSurvivalTime % 60);

    this.el.innerHTML = `
      <h3>統計・記録</h3>

      <div class="stats-section">
        <h4>総合統計</h4>
        <div class="stats-grid">
          <div class="stats-item"><span class="stats-label">総ラン数</span><span class="stats-value">${s.totalRuns}</span></div>
          <div class="stats-item"><span class="stats-label">総討伐数</span><span class="stats-value">${s.totalKills.toLocaleString()}</span></div>
          <div class="stats-item"><span class="stats-label">総プレイ時間</span><span class="stats-value">${playH}時間${playM}分</span></div>
          <div class="stats-item"><span class="stats-label">総ゴールド獲得</span><span class="stats-value">${s.totalGoldEarned.toLocaleString()}G</span></div>
          <div class="stats-item"><span class="stats-label">総素材収集</span><span class="stats-value">${s.totalMaterialsCollected}</span></div>
          <div class="stats-item"><span class="stats-label">総クラフト数</span><span class="stats-value">${s.totalCrafted}</span></div>
          <div class="stats-item"><span class="stats-label">生存回数</span><span class="stats-value">${s.totalSurvivals}</span></div>
          <div class="stats-item"><span class="stats-label">死亡回数</span><span class="stats-value">${s.totalDeaths}</span></div>
          <div class="stats-item"><span class="stats-label">ボス撃破数</span><span class="stats-value">${s.totalBossesDefeated}</span></div>
          <div class="stats-item"><span class="stats-label">ハードクリア</span><span class="stats-value">${s.hardModeClears || 0}</span></div>
          <div class="stats-item"><span class="stats-label">チャレンジクリア</span><span class="stats-value">${s.challengeClears || 0}</span></div>
          <div class="stats-item"><span class="stats-label">ナイトメアクリア</span><span class="stats-value">${s.nightmareClears || 0}</span></div>
        </div>
      </div>

      <div class="stats-section">
        <h4>ベスト記録</h4>
        <div class="stats-grid">
          <div class="stats-item"><span class="stats-label">最長生存</span><span class="stats-value">${survH}分${survS}秒</span></div>
          <div class="stats-item"><span class="stats-label">最高レベル</span><span class="stats-value">Lv.${s.highestLevel}</span></div>
          <div class="stats-item"><span class="stats-label">最大ダメージ</span><span class="stats-value">${s.highestDamageDealt}</span></div>
        </div>
      </div>

      <div class="stats-section">
        <h4>エリア別統計</h4>
        <div class="stats-area-list">
          ${Object.entries(AreaDefs).map(([id, area]) => {
            const as = s.perArea[id];
            if (!as) return `<div class="stats-area-row dim"><span>${area.icon} ${area.name}</span><span>未挑戦</span></div>`;
            const bestM = Math.floor(as.bestTime / 60);
            const bestS = Math.floor(as.bestTime % 60);
            return `
              <div class="stats-area-row">
                <span>${area.icon} ${area.name}</span>
                <span>挑戦${as.runs}回 / クリア${as.clears}回 / 討伐${as.kills}体 / 最長${bestM}:${String(bestS).padStart(2, '0')}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="stats-section">
        <h4>武器種別統計</h4>
        <div class="stats-weapon-list">
          ${Object.entries(WEAPON_NAMES).map(([type, name]) => {
            const ws = s.perWeaponType[type];
            if (!ws) return `<div class="stats-area-row dim"><span>${name}</span><span>未使用</span></div>`;
            return `<div class="stats-area-row"><span>${name}</span><span>使用${ws.runsUsed}回</span></div>`;
          }).join('')}
        </div>
      </div>
    `;
    this.container.appendChild(this.el);
  }

  destroy() {
    this.el.remove();
  }
}
