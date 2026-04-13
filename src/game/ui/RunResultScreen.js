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
    const reasonText = reason === 'timeout' ? '生存成功！' : '力尽きた...';

    const materialHtml = materials.length > 0
      ? materials.map(m => {
          const bp = ItemBlueprints[m.blueprintId];
          return `<div class="result-material">
            <img src="${bp?.image ? assetPath(bp.image) : ''}" alt="${bp?.name || m.blueprintId}" class="result-mat-icon" onerror="this.style.display='none'">
            <span>${bp?.name || m.blueprintId} (Q${m.quality})</span>
          </div>`;
        }).join('')
      : '<div class="result-no-materials">素材を獲得できなかった</div>';

    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="result-overlay"></div>
      <div class="result-content">
        <h2 class="result-title">${reasonText}</h2>
        <p class="result-area">${areaName}${bossText ? ` — ${bossText}` : ''}</p>
        <div class="result-stats">
          <div class="result-stat">
            <span class="result-label">生存時間</span>
            <span class="result-value">${timeStr}</span>
          </div>
          <div class="result-stat">
            <span class="result-label">討伐数</span>
            <span class="result-value">${killCount}</span>
          </div>
          <div class="result-stat">
            <span class="result-label">獲得ゴールド</span>
            <span class="result-value">${resultData.goldEarned || 0}G</span>
          </div>
          <div class="result-stat">
            <span class="result-label">到達レベル</span>
            <span class="result-value">Lv.${level}</span>
          </div>
        </div>
        <h3 class="result-materials-title">獲得素材</h3>
        <div class="result-materials">${materialHtml}</div>
        <button class="result-btn" id="result-continue-btn">拠点に戻る</button>
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
