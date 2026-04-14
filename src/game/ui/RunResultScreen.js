/**
 * RunResultScreen — リザルト画面
 */

import { ItemBlueprints } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';
import { assetPath } from '../core/assetPath.js';
import { AreaDefs } from '../data/areas.js';

export class RunResultScreen {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.id = 'run-result';
    this.el.className = 'run-result hidden';
    container.appendChild(this.el);
  }

  show(resultData) {
    const { reason, elapsed, killCount, level, materials } = resultData;
    const area = AreaDefs[resultData.areaId];
    const areaName = area ? `${area.icon} ${area.name}` : resultData.areaId;
    const bossText = resultData.bossDefeated ? 'ボス撃破！' : '';
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
    const isClear = reason === 'clear';
    const isVictory = reason === 'timeout' || isClear;
    const isRetreat = reason === 'retreat';
    const reasonText = isClear ? '🏆 ステージクリア！' : reason === 'timeout' ? '🏆 生存成功！' : isRetreat ? '🏳️ 撤退完了' : '💀 力尽きた...';
    const titleClass = isVictory ? 'result-title result-title-victory' : isRetreat ? 'result-title result-title-retreat' : 'result-title result-title-defeat';

    const materialCount = materials.length;
    const materialHtml = materialCount > 0
      ? materials.map(m => {
          const bp = ItemBlueprints[m.blueprintId];
          return `<div class="result-material" title="${bp?.name || m.blueprintId} (Q${m.quality})">
            <img src="${bp?.image ? assetPath(bp.image) : ''}" alt="${bp?.name || m.blueprintId}" class="result-mat-icon" onerror="this.style.display='none'">
            <span class="result-mat-name">${bp?.name || m.blueprintId}</span>
            <span class="result-mat-quality">Q${m.quality}</span>
          </div>`;
        }).join('')
      : '<div class="result-no-materials">素材を獲得できなかった</div>';

    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="result-overlay"></div>
      <div class="result-content anim-fade-in" role="dialog" aria-labelledby="result-title">
        <h2 class="${titleClass}" id="result-title">${reasonText}</h2>
        <p class="result-area">${areaName}${bossText ? ` — <span class="result-boss-badge">${bossText}</span>` : ''}</p>
        <div class="result-stats">
          <div class="result-stat">
            <span class="result-stat-icon" aria-hidden="true">⏱️</span>
            <span class="result-label">生存時間</span>
            <span class="result-value">${timeStr}</span>
          </div>
          <div class="result-stat">
            <span class="result-stat-icon" aria-hidden="true">⚔️</span>
            <span class="result-label">討伐数</span>
            <span class="result-value">${killCount}</span>
          </div>
          <div class="result-stat">
            <span class="result-stat-icon" aria-hidden="true">💰</span>
            <span class="result-label">ゴールド</span>
            <span class="result-value">${resultData.goldEarned || 0}G</span>
          </div>
          <div class="result-stat">
            <span class="result-stat-icon" aria-hidden="true">⭐</span>
            <span class="result-label">レベル</span>
            <span class="result-value">Lv.${level}</span>
          </div>
        </div>
        <h3 class="result-materials-title">
          <span>📦 獲得素材</span>
          <span class="result-materials-count">${materialCount}個</span>
        </h3>
        <div class="result-materials-wrap">
          <div class="result-materials">${materialHtml}</div>
          ${materialCount > 6 ? '<div class="result-materials-scrollhint">↓ スクロールで全表示</div>' : ''}
        </div>
        <button class="result-btn" id="result-continue-btn">🏠 拠点に戻る</button>
      </div>
    `;

    this.el.querySelector('#result-continue-btn').addEventListener('click', () => {
      this.hide();
      eventBus.emit('result:continue', resultData);
    });
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  destroy() {
    this.el.remove();
  }
}
