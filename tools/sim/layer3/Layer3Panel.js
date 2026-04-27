/**
 * Layer3Panel — ヘッドレスランシム UI
 */

import { ItemBlueprints } from '../../../src/game/data/items.js';
import { AreaDefs } from '../../../src/game/data/areas.js';
import { PetDefs, MAX_PET_LEVEL } from '../../../src/game/data/pets.js';
import { simulateRunsMonteCarlo, simulateBossRush } from './HeadlessSim.js';

function listEquipment(equipType) {
  return Object.values(ItemBlueprints).filter(bp => {
    if (equipType === 'weapon') return bp.type === 'equipment' && ['sword','bow','staff','dagger','spear','shield'].includes(bp.equipType);
    if (equipType === 'armor') return bp.type === 'equipment' && ['armor','robe','shield'].includes(bp.equipType);
    if (equipType === 'accessory') return bp.type === 'accessory';
    return false;
  });
}

export function renderLayer3Panel(container) {
  const weapons = listEquipment('weapon');
  const armors = listEquipment('armor');
  const accs = listEquipment('accessory');
  const pets = Object.values(PetDefs);
  const areas = Object.values(AreaDefs);

  container.innerHTML = `
    <div class="sim-grid">
      <div class="sim-card">
        <h3>装備プリセット</h3>
        ${[0,1,2,3].map(i => `
          <label class="sim-row">
            <span>武器 ${i + 1}</span>
            <select data-l3-weapon="${i}">
              <option value="">未装備</option>
              ${weapons.map(bp => `<option value="${bp.id}">${bp.name}</option>`).join('')}
            </select>
            <input type="number" min="0" max="999" value="50" data-l3-weapon-q="${i}" />
          </label>
        `).join('')}
        <label class="sim-row">
          <span>防具</span>
          <select data-l3-armor>
            <option value="">未装備</option>
            ${armors.map(bp => `<option value="${bp.id}">${bp.name}</option>`).join('')}
          </select>
          <input type="number" min="0" max="999" value="50" data-l3-armor-q />
        </label>
        <label class="sim-row">
          <span>アクセサリ</span>
          <select data-l3-accessory>
            <option value="">未装備</option>
            ${accs.map(bp => `<option value="${bp.id}">${bp.name}</option>`).join('')}
          </select>
          <input type="number" min="0" max="999" value="50" data-l3-accessory-q />
        </label>
        <label class="sim-row">
          <span>ペット</span>
          <select data-l3-pet>
            <option value="">未装備</option>
            ${pets.map(p => `<option value="${p.id}">${p.icon} ${p.name}</option>`).join('')}
          </select>
          <input type="number" min="1" max="${MAX_PET_LEVEL}" value="10" data-l3-pet-level />
        </label>
      </div>

      <div class="sim-card">
        <h3>通常ラン: クリア率シム</h3>
        <label class="sim-row">
          <span>エリア</span>
          <select data-l3-area>
            ${areas.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join('')}
          </select>
        </label>
        <label class="sim-row">
          <span>試行回数</span>
          <input type="number" min="10" max="2000" value="200" data-l3-trials />
        </label>
        <button data-l3-run class="sim-button">▶ ランシム実行</button>
        <div id="l3-run-result"></div>
      </div>
    </div>

    <div class="sim-card">
      <h3>ボスラッシュ完走率シム</h3>
      <label class="sim-row">
        <span>試行回数</span>
        <input type="number" min="10" max="500" value="100" data-l3-br-trials />
      </label>
      <button data-l3-br-run class="sim-button">🏆 ボスラッシュシム</button>
      <div id="l3-br-result"></div>
    </div>

    <div class="sim-card">
      <h3>ペット比較ベンチマーク</h3>
      <p class="sim-hint">同じ装備で全6種ペット (Lv10) のクリア率を比較</p>
      <button data-l3-pet-bench class="sim-button">🐾 ペットベンチ実行</button>
      <div id="l3-pet-bench"></div>
    </div>
  `;

  function readState() {
    const weaponSlots = [0,1,2,3].map(i => {
      const id = container.querySelector(`[data-l3-weapon="${i}"]`).value;
      const quality = parseInt(container.querySelector(`[data-l3-weapon-q="${i}"]`).value, 10) || 0;
      if (!id) return null;
      return { blueprintId: id, quality, traits: [] };
    });
    const aId = container.querySelector('[data-l3-armor]').value;
    const armor = aId ? { blueprintId: aId, quality: parseInt(container.querySelector('[data-l3-armor-q]').value, 10), traits: [] } : null;
    const acId = container.querySelector('[data-l3-accessory]').value;
    const accessory = acId ? { blueprintId: acId, quality: parseInt(container.querySelector('[data-l3-accessory-q]').value, 10), traits: [] } : null;
    const petId = container.querySelector('[data-l3-pet]').value;
    const pet = petId ? { id: petId, level: parseInt(container.querySelector('[data-l3-pet-level]').value, 10) } : null;
    const areaId = container.querySelector('[data-l3-area]').value;
    return { weaponSlots, armor, accessory, pet, areaId };
  }

  // Run sim
  container.querySelector('[data-l3-run]').addEventListener('click', () => {
    const state = readState();
    const trials = parseInt(container.querySelector('[data-l3-trials]').value, 10);
    const out = container.querySelector('#l3-run-result');
    out.innerHTML = '<p class="sim-hint">実行中...</p>';
    setTimeout(() => {
      const r = simulateRunsMonteCarlo(state, trials);
      out.innerHTML = `
        <table class="sim-stats">
          <tr><td>クリア率</td><td><strong style="color:#4f4">${(r.clearRate * 100).toFixed(1)}%</strong></td></tr>
          <tr><td>死亡率</td><td><strong style="color:#f44">${(r.deathRate * 100).toFixed(1)}%</strong></td></tr>
          <tr><td>タイムアウト率</td><td>${(r.timeoutRate * 100).toFixed(1)}%</td></tr>
          <tr><td>生存中央値</td><td>${(r.survivalP50 / 60).toFixed(1)} 分</td></tr>
          <tr><td>生存 p10 - p90</td><td>${(r.survivalP10/60).toFixed(1)} - ${(r.survivalP90/60).toFixed(1)} 分</td></tr>
          <tr><td>平均DPS</td><td>${r.avgDps.toFixed(1)}</td></tr>
        </table>
      `;
    }, 30);
  });

  // Boss Rush
  container.querySelector('[data-l3-br-run]').addEventListener('click', () => {
    const state = readState();
    const trials = parseInt(container.querySelector('[data-l3-br-trials]').value, 10);
    const out = container.querySelector('#l3-br-result');
    out.innerHTML = '<p class="sim-hint">実行中...</p>';
    setTimeout(() => {
      const r = simulateBossRush(state, trials);
      const dist = Object.entries(r.partialDistribution).sort((a, b) => Number(a[0]) - Number(b[0]));
      out.innerHTML = `
        <table class="sim-stats">
          <tr><td>完走率（7撃破）</td><td><strong style="color:#fa4">${(r.fullClearRate * 100).toFixed(1)}%</strong></td></tr>
          <tr><td>平均撃破数</td><td>${r.avgDefeated.toFixed(1)} / 7</td></tr>
          <tr><td>中央値</td><td>${r.medianDefeated} / 7</td></tr>
        </table>
        <p class="sim-hint">撃破数別の分布:</p>
        <div class="bossrush-dist">
          ${dist.map(([n, count]) => `
            <div class="dist-row">
              <span>${n}体</span>
              <div class="bar-container"><div class="bar" style="width:${(count / trials * 100).toFixed(1)}%"></div></div>
              <span class="dist-count">${count}</span>
            </div>
          `).join('')}
        </div>
      `;
    }, 30);
  });

  // Pet bench
  container.querySelector('[data-l3-pet-bench]').addEventListener('click', () => {
    const baseState = readState();
    const out = container.querySelector('#l3-pet-bench');
    out.innerHTML = '<p class="sim-hint">実行中...</p>';
    setTimeout(() => {
      const trials = 100;
      const results = [];
      // 未装備 + 6種
      const variants = [{ id: '__none__', label: '未装備', pet: null }];
      for (const p of pets) variants.push({ id: p.id, label: `${p.icon} ${p.name}`, pet: { id: p.id, level: 10 } });
      for (const v of variants) {
        const r = simulateRunsMonteCarlo({ ...baseState, pet: v.pet }, trials);
        results.push({ label: v.label, clearRate: r.clearRate, survival: r.survivalP50, dps: r.avgDps });
      }
      results.sort((a, b) => b.clearRate - a.clearRate);
      const max = Math.max(...results.map(r => r.clearRate)) || 1;
      out.innerHTML = `
        <table class="sim-rank">
          <thead><tr><th>順位</th><th>ペット</th><th>クリア率</th><th>生存p50</th><th>DPS</th></tr></thead>
          <tbody>
            ${results.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td>${r.label}</td>
                <td><span class="bar" style="width:${(r.clearRate / max * 100).toFixed(1)}%">${(r.clearRate * 100).toFixed(1)}%</span></td>
                <td>${(r.survival / 60).toFixed(1)} 分</td>
                <td>${r.dps.toFixed(1)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }, 30);
  });
}
