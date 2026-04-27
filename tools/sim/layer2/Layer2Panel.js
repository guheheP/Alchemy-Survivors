/**
 * Layer2Panel — 確率シミュレーター UI
 */

import { AreaDefs } from '../../../src/game/data/areas.js';
import { ItemBlueprints, Recipes } from '../../../src/game/data/items.js';
import { montecarloDrops, simulateEliteEncounters, estimateEggCollectRuns } from './MonteCarlo.js';
import { drawHistogram } from '../ui/Histogram.js';

export function renderLayer2Panel(container) {
  const areas = Object.values(AreaDefs);
  const eggRecipes = Object.entries(Recipes).filter(([id, r]) => r.targetId?.startsWith('pet_egg_'));

  container.innerHTML = `
    <div class="sim-grid">
      <div class="sim-card">
        <h3>ドロップ Monte Carlo</h3>
        <label class="sim-row">
          <span>エリア</span>
          <select data-mc-area>
            ${areas.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join('')}
          </select>
        </label>
        <label class="sim-row">
          <span>1ランの撃破数</span>
          <input type="number" min="50" max="5000" value="500" data-mc-kills />
        </label>
        <label class="sim-row">
          <span>★5 確率</span>
          <input type="number" min="0" max="1" step="0.01" value="0.005" data-mc-elite />
          <span class="sim-hint">通常時 0.005, BossRush 0.25</span>
        </label>
        <label class="sim-row">
          <span>試行回数</span>
          <input type="number" min="100" max="10000" value="1000" data-mc-trials />
        </label>
        <button data-mc-run class="sim-button">▶ シミュレート実行</button>
        <p class="sim-hint" data-mc-status></p>
        <div id="mc-result"></div>
      </div>

      <div class="sim-card">
        <h3>★5エリート遭遇</h3>
        <label class="sim-row">
          <span>★5 確率</span>
          <input type="number" min="0" max="1" step="0.01" value="0.25" data-elite-chance />
        </label>
        <label class="sim-row">
          <span>1ランの撃破数</span>
          <input type="number" min="50" max="5000" value="500" data-elite-kills />
        </label>
        <label class="sim-row">
          <span>試行回数</span>
          <input type="number" min="100" max="10000" value="2000" data-elite-trials />
        </label>
        <button data-elite-run class="sim-button">▶ ★5シミュレート</button>
        <div id="elite-result"></div>
        <canvas id="elite-hist" width="500" height="160"></canvas>
      </div>
    </div>

    <div class="sim-card">
      <h3>ペット卵 素材集め推定</h3>
      <label class="sim-row">
        <span>レシピ</span>
        <select data-egg-recipe>
          ${eggRecipes.map(([id]) => `<option value="${id}">${ItemBlueprints[id]?.name || id}</option>`).join('')}
        </select>
      </label>
      <label class="sim-row">
        <span>★5 確率</span>
        <input type="number" min="0" max="1" step="0.01" value="0" data-egg-elite />
      </label>
      <button data-egg-run class="sim-button">▶ 推定実行</button>
      <div id="egg-result"></div>
    </div>
  `;

  // === Drop MC ===
  const mcRun = container.querySelector('[data-mc-run]');
  mcRun.addEventListener('click', () => {
    const areaId = container.querySelector('[data-mc-area]').value;
    const killCount = parseInt(container.querySelector('[data-mc-kills]').value, 10);
    const eliteChance = parseFloat(container.querySelector('[data-mc-elite]').value);
    const trials = parseInt(container.querySelector('[data-mc-trials]').value, 10);
    const status = container.querySelector('[data-mc-status]');
    status.textContent = '実行中...';
    setTimeout(() => {
      const res = montecarloDrops({ areaId, trials, killCount, eliteChance });
      const ids = Object.keys(res.perItem).sort((a, b) => res.perItem[b].mean - res.perItem[a].mean);
      const tableHtml = `
        <table class="sim-stats">
          <thead><tr><th>素材</th><th>平均</th><th>中央値</th><th>p10</th><th>p90</th><th>未入手率</th></tr></thead>
          <tbody>
            ${ids.map(id => {
              const bp = ItemBlueprints[id];
              const s = res.perItem[id];
              return `<tr>
                <td>${bp?.name || id}</td>
                <td>${s.mean.toFixed(1)}</td>
                <td>${s.median}</td>
                <td>${s.p10}</td>
                <td>${s.p90}</td>
                <td>${(s.zeroRate * 100).toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${res.elites ? `<p class="sim-hint">★5 平均: ${res.elites.mean.toFixed(1)} / ラン (中央値 ${res.elites.median}, p10-p90: ${res.elites.p10}-${res.elites.p90})</p>` : ''}
        <button data-mc-csv class="sim-button-mini">📥 CSVダウンロード</button>
      `;
      container.querySelector('#mc-result').innerHTML = tableHtml;
      status.textContent = `完了 (${res.trials} 試行)`;
      // CSV
      const csvBtn = container.querySelector('[data-mc-csv]');
      if (csvBtn) {
        csvBtn.addEventListener('click', () => {
          const rows = [['blueprintId', 'name', 'mean', 'median', 'p10', 'p90', 'zeroRate'].join(',')];
          for (const id of ids) {
            const bp = ItemBlueprints[id];
            const s = res.perItem[id];
            rows.push([id, bp?.name || id, s.mean.toFixed(2), s.median, s.p10, s.p90, s.zeroRate.toFixed(3)].join(','));
          }
          downloadCsv(rows.join('\n'), `drops-${areaId}.csv`);
        });
      }
    }, 30);
  });

  // === Elite ===
  const eliteRun = container.querySelector('[data-elite-run]');
  eliteRun.addEventListener('click', () => {
    const eliteChance = parseFloat(container.querySelector('[data-elite-chance]').value);
    const killCount = parseInt(container.querySelector('[data-elite-kills]').value, 10);
    const trials = parseInt(container.querySelector('[data-elite-trials]').value, 10);
    const r = simulateEliteEncounters({ eliteChance, killCount, trials });
    container.querySelector('#elite-result').innerHTML = `
      <table class="sim-stats">
        <tr><td>平均 ★5/ラン</td><td><strong>${r.mean.toFixed(1)}</strong></td></tr>
        <tr><td>中央値</td><td>${r.p50}</td></tr>
        <tr><td>p10 - p90</td><td>${r.p10} - ${r.p90}</td></tr>
        <tr><td>期待 ★5率</td><td>${((r.mean / killCount) * 100).toFixed(2)}%</td></tr>
      </table>
    `;
    drawHistogram(container.querySelector('#elite-hist'), r.histogram, '★5/ラン 分布');
  });

  // === Egg estimate ===
  const eggRun = container.querySelector('[data-egg-run]');
  eggRun.addEventListener('click', () => {
    const recipeId = container.querySelector('[data-egg-recipe]').value;
    const eliteChance = parseFloat(container.querySelector('[data-egg-elite]').value);
    container.querySelector('#egg-result').innerHTML = '<p class="sim-hint">計算中... 数秒お待ちください</p>';
    setTimeout(() => {
      const res = estimateEggCollectRuns(recipeId, { eliteChance, trials: 100, killCount: 400 });
      const reqLines = Object.entries(res.requiredMaterials).map(([id, n]) => `${ItemBlueprints[id]?.name || id} × ${n}`).join(', ');
      const rows = Object.entries(res.runsByAreaP50)
        .sort((a, b) => a[1].p50 - b[1].p50);
      container.querySelector('#egg-result').innerHTML = `
        <p class="sim-hint">必要素材: ${reqLines || '（カテゴリ素材のみ）'}</p>
        <table class="sim-stats">
          <thead><tr><th>エリア</th><th>中央値ラン数</th><th>p10</th><th>p90</th></tr></thead>
          <tbody>
            ${rows.map(([area, s]) => `
              <tr>
                <td>${AreaDefs[area].icon} ${AreaDefs[area].name}</td>
                <td><strong>${s.p50}</strong></td>
                <td>${s.p10}</td>
                <td>${s.p90}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }, 30);
  });
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
