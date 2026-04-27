/**
 * Layer1Panel — DPS/EHP 計算機 UI
 */

import { ItemBlueprints } from '../../../src/game/data/items.js';
import { PetDefs, MAX_PET_LEVEL } from '../../../src/game/data/pets.js';
import { buildSummary } from './DpsCalculator.js';

/** 武器/防具/アクセサリの全 BP 一覧 */
function listEquipment(equipType) {
  return Object.values(ItemBlueprints).filter(bp => {
    if (equipType === 'weapon') return bp.type === 'equipment' && ['sword','bow','staff','dagger','spear','shield'].includes(bp.equipType);
    if (equipType === 'armor') return bp.type === 'equipment' && ['armor','robe','shield'].includes(bp.equipType);
    if (equipType === 'accessory') return bp.type === 'accessory';
    return false;
  });
}

function makeOption(bp, selected = false) {
  return `<option value="${bp.id}" ${selected ? 'selected' : ''}>${bp.name} (T${bp.tier || '?'})</option>`;
}

export function renderLayer1Panel(container) {
  const weapons = listEquipment('weapon');
  const armors = listEquipment('armor');
  const accs = listEquipment('accessory');
  const pets = Object.values(PetDefs);

  container.innerHTML = `
    <div class="sim-grid">
      <div class="sim-card">
        <h3>装備構成</h3>
        ${[0,1,2,3].map(i => `
          <label class="sim-row">
            <span>武器 ${i + 1}</span>
            <select data-weapon="${i}">
              <option value="">未装備</option>
              ${weapons.map(bp => makeOption(bp, i === 0 && bp.id === 'stone_axe')).join('')}
            </select>
            <input type="number" min="0" max="999" value="50" data-quality-weapon="${i}" title="品質" />
          </label>
        `).join('')}

        <label class="sim-row">
          <span>防具</span>
          <select data-armor>
            <option value="">未装備</option>
            ${armors.map(bp => makeOption(bp)).join('')}
          </select>
          <input type="number" min="0" max="999" value="50" data-quality-armor title="品質" />
        </label>

        <label class="sim-row">
          <span>アクセサリ</span>
          <select data-accessory>
            <option value="">未装備</option>
            ${accs.map(bp => makeOption(bp)).join('')}
          </select>
          <input type="number" min="0" max="999" value="50" data-quality-accessory title="品質" />
        </label>

        <label class="sim-row">
          <span>ペット</span>
          <select data-pet>
            <option value="">未装備</option>
            ${pets.map(p => `<option value="${p.id}">${p.icon} ${p.name}</option>`).join('')}
          </select>
          <input type="number" min="1" max="${MAX_PET_LEVEL}" value="1" data-pet-level title="ペットLv" />
        </label>

        <label class="sim-row">
          <span>想定被弾DPS</span>
          <input type="number" min="0" max="100" step="0.1" value="1.5" data-incoming />
          <span class="sim-hint">敵から受ける平均ダメージ/秒</span>
        </label>
      </div>

      <div class="sim-card">
        <h3>結果</h3>
        <div id="layer1-result" class="sim-result"></div>
      </div>
    </div>

    <div class="sim-card">
      <h3>武器別 DPS 比較</h3>
      <div id="layer1-compare"></div>
    </div>
  `;

  function readState() {
    const weaponSlots = [0,1,2,3].map(i => {
      const id = container.querySelector(`[data-weapon="${i}"]`).value;
      const quality = parseInt(container.querySelector(`[data-quality-weapon="${i}"]`).value, 10) || 0;
      if (!id) return null;
      return { blueprintId: id, quality, traits: [] };
    });
    const aId = container.querySelector('[data-armor]').value;
    const armor = aId ? { blueprintId: aId, quality: parseInt(container.querySelector('[data-quality-armor]').value, 10) || 0, traits: [] } : null;
    const acId = container.querySelector('[data-accessory]').value;
    const accessory = acId ? { blueprintId: acId, quality: parseInt(container.querySelector('[data-quality-accessory]').value, 10) || 0, traits: [] } : null;
    const petId = container.querySelector('[data-pet]').value;
    const pet = petId ? { id: petId, level: parseInt(container.querySelector('[data-pet-level]').value, 10) || 1 } : null;
    const incomingDps = parseFloat(container.querySelector('[data-incoming]').value) || 1.5;
    return { weaponSlots, armor, accessory, pet, incomingDps };
  }

  function refresh() {
    const state = readState();
    const summary = buildSummary(state);
    const r = container.querySelector('#layer1-result');
    r.innerHTML = `
      <table class="sim-stats">
        <tr><th colspan="2">攻撃</th></tr>
        <tr><td>武器 DPS</td><td><strong>${summary.weaponDps.toFixed(1)}</strong> /秒</td></tr>
        <tr><td>ペット DPS</td><td>${summary.petDps.toFixed(1)} /秒 ${summary.petExtra ? `<small>(${summary.petExtra})</small>` : ''}</td></tr>
        <tr><td>合計 DPS</td><td><strong style="color:#ffaa44">${summary.totalDps.toFixed(1)}</strong> /秒</td></tr>
        <tr><th colspan="2">防御</th></tr>
        <tr><td>最大HP</td><td>${summary.baseHp.toFixed(0)}</td></tr>
        <tr><td>防御値</td><td>${summary.defense.toFixed(1)}</td></tr>
        <tr><td>軽減率</td><td>${(summary.reduction * 100).toFixed(1)}%</td></tr>
        <tr><td>有効HP (EHP)</td><td><strong>${summary.ehp.toFixed(0)}</strong></td></tr>
        <tr><th colspan="2">推定生存</th></tr>
        <tr><td>被弾 ${state.incomingDps}DPS 想定</td><td><strong>${(summary.estimatedSurvivalSec / 60).toFixed(1)}</strong> 分 (${summary.estimatedSurvivalSec.toFixed(0)}秒)</td></tr>
      </table>
    `;

    // 武器カタログ全種を試して DPS ランキング表示
    const cmp = container.querySelector('#layer1-compare');
    const candidates = weapons.map(bp => {
      const probe = { blueprintId: bp.id, quality: 50, traits: [] };
      const probeSummary = buildSummary({ weaponSlots: [probe], armor: null, accessory: null, pet: null, incomingDps: state.incomingDps });
      return { name: bp.name, type: bp.equipType, dps: probeSummary.weaponDps };
    }).sort((a, b) => b.dps - a.dps);
    const max = candidates[0]?.dps || 1;
    cmp.innerHTML = `
      <table class="sim-rank">
        ${candidates.slice(0, 25).map((c, i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td>${c.name}</td>
            <td><span class="bar" style="width:${(c.dps / max * 100).toFixed(1)}%">${c.dps.toFixed(1)}</span></td>
          </tr>
        `).join('')}
      </table>
      <p class="sim-hint">※ 全武器を Q50 / 単独装備 / 特性なしで比較</p>
    `;
  }

  container.addEventListener('change', refresh);
  container.addEventListener('input', refresh);
  refresh();
}
