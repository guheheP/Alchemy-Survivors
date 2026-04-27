/**
 * analyze.mjs — シミュレーターを Node で直接実行し、バランス検証レポートを出力する
 * 使い方: node tools/sim/analyze.mjs
 */

import { ItemBlueprints, Recipes } from '../../src/game/data/items.js';
import { AreaDefs } from '../../src/game/data/areas.js';
import { PetDefs } from '../../src/game/data/pets.js';
import { GameConfig } from '../../src/game/data/config.js';
import { weaponDps, buildSummary } from './layer1/DpsCalculator.js';
import { simulateEliteEncounters, montecarloDrops, estimateEggCollectRuns } from './layer2/MonteCarlo.js';
import { simulateRunsMonteCarlo, simulateBossRush } from './layer3/HeadlessSim.js';

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(72));
const h1 = (s) => { line(); line(`■ ${s}`); hr(); };
const h2 = (s) => { line(); line(`▸ ${s}`); };

// ──────────────────────────────────────────────────────
// 1. 武器DPSランキング (Q50, 単独装備, 特性なし)
// ──────────────────────────────────────────────────────
h1('1. 武器 DPS ランキング (Q50, 単独装備, 特性なし)');

const weapons = Object.values(ItemBlueprints).filter(bp =>
  bp.type === 'equipment' && ['sword','bow','staff','dagger','spear','shield'].includes(bp.equipType));

const dpsTable = weapons.map(bp => {
  const probe = { blueprintId: bp.id, quality: 50, traits: [] };
  const r = weaponDps(probe, { avgTargets: 1 });
  const rMulti = weaponDps(probe, { avgTargets: 4 });
  return { name: bp.name, type: bp.equipType, tier: bp.tier || '?', single: r.singleTarget, multi: rMulti.multiTarget };
}).sort((a, b) => b.single - a.single);

line('順位  武器                          種類    Single  Multi(4体)');
dpsTable.slice(0, 20).forEach((w, i) => {
  line(`${String(i + 1).padStart(2)}.  ${w.name.padEnd(28)}  ${w.type.padEnd(6)}  ${w.single.toFixed(1).padStart(6)}  ${w.multi.toFixed(1).padStart(6)}`);
});

h2('種類別 DPS 平均 (Q50)');
const byType = {};
for (const w of dpsTable) {
  if (!byType[w.type]) byType[w.type] = [];
  byType[w.type].push(w);
}
const typeStats = Object.entries(byType).map(([type, list]) => {
  const avgSingle = list.reduce((a, b) => a + b.single, 0) / list.length;
  const avgMulti = list.reduce((a, b) => a + b.multi, 0) / list.length;
  return { type, count: list.length, avgSingle, avgMulti };
}).sort((a, b) => b.avgMulti - a.avgMulti);
line('種類      数  Single平均  Multi平均');
typeStats.forEach(s => {
  line(`${s.type.padEnd(8)}  ${String(s.count).padStart(2)}  ${s.avgSingle.toFixed(1).padStart(8)}  ${s.avgMulti.toFixed(1).padStart(8)}`);
});

// ──────────────────────────────────────────────────────
// 2. ペット DPS 寄与 (Lv 1 / 10 / 30 で比較)
// ──────────────────────────────────────────────────────
h1('2. ペット DPS / 効果 (プレイヤー baseDamage=10 想定)');

const pets = Object.values(PetDefs);
line('ペット            種別       Lv1    Lv10   Lv30   特殊効果');
for (const p of pets) {
  const probeBase = { weaponSlots: [], armor: null, accessory: null };
  const r1 = buildSummary({ ...probeBase, pet: { id: p.id, level: 1 } });
  const r10 = buildSummary({ ...probeBase, pet: { id: p.id, level: 10 } });
  const r30 = buildSummary({ ...probeBase, pet: { id: p.id, level: 30 } });
  line(`${p.name.padEnd(16)}  ${p.type.padEnd(8)}  ${r1.petDps.toFixed(1).padStart(5)}  ${r10.petDps.toFixed(1).padStart(5)}  ${r30.petDps.toFixed(1).padStart(5)}  ${r1.petExtra || ''}`);
}

// ──────────────────────────────────────────────────────
// 3. ★5エリート出現頻度
// ──────────────────────────────────────────────────────
h1('3. ★5 エリート出現頻度シム (1ラン=500体撃破想定)');

[0.005, 0.05, 0.1, 0.15, 0.20, 0.25, 0.30].forEach(chance => {
  const r = simulateEliteEncounters({ eliteChance: chance, killCount: 500, trials: 2000 });
  line(`★5率 ${(chance * 100).toFixed(1).padStart(5)}%: 平均 ${r.mean.toFixed(1).padStart(5)} 体/ラン (中央値 ${r.p50}, p10-p90: ${r.p10}-${r.p90})`);
});

// ──────────────────────────────────────────────────────
// 4. ペット卵レシピの素材集め時間 (草原と最終エリア比較)
// ──────────────────────────────────────────────────────
h1('4. ペット卵レシピ — 素材集め必要ラン数 (中央値)');

const eggRecipes = Object.entries(Recipes).filter(([id, r]) => r.targetId?.startsWith('pet_egg_'));
for (const [id, recipe] of eggRecipes) {
  h2(`${ItemBlueprints[id]?.name || id} (素材: ${recipe.materials.join(', ')})`);
  const res = estimateEggCollectRuns(id, { trials: 50, killCount: 400, eliteChance: 0 });
  line('対象エリア          中央値ラン  p10-p90');
  Object.entries(res.runsByAreaP50)
    .sort((a, b) => a[1].p50 - b[1].p50)
    .slice(0, 5)
    .forEach(([area, s]) => {
      const a = AreaDefs[area];
      line(`${(a.icon + ' ' + a.name).padEnd(18)}  ${String(s.p50).padStart(8)}    ${s.p10}-${s.p90}`);
    });
}

// ──────────────────────────────────────────────────────
// 5. 通常ラン クリア率シム — 装備プリセット別
// ──────────────────────────────────────────────────────
h1('5. 通常ラン クリア率 (草原, 200試行)');

const presets = [
  { label: '初期 (石斧Q20のみ)',
    weaponSlots: [{ blueprintId: 'stone_axe', quality: 20, traits: [] }],
    armor: null, accessory: null, pet: null },
  { label: '初期 + 子狼Lv5',
    weaponSlots: [{ blueprintId: 'stone_axe', quality: 20, traits: [] }],
    armor: null, accessory: null, pet: { id: 'wolf', level: 5 } },
  { label: '中盤 (剣Q50 + 鎧Q50 + 子狼Lv10)',
    weaponSlots: [{ blueprintId: 'sword', quality: 50, traits: [] }],
    armor: { blueprintId: 'leather_armor', quality: 50, traits: [] }, accessory: null,
    pet: { id: 'wolf', level: 10 } },
  { label: '中盤 4武器',
    weaponSlots: [
      { blueprintId: 'sword', quality: 60, traits: [] },
      { blueprintId: 'wooden_bow', quality: 60, traits: [] },
      { blueprintId: 'silver_dagger', quality: 60, traits: [] },
      { blueprintId: 'iron_spear', quality: 60, traits: [] },
    ],
    armor: { blueprintId: 'leather_armor', quality: 60, traits: [] },
    accessory: null,
    pet: { id: 'phoenix', level: 15 } },
  { label: '終盤 4武器 + フェニックスLv25',
    weaponSlots: [
      { blueprintId: 'fire_sword', quality: 90, traits: [] },
      { blueprintId: 'wind_bow', quality: 90, traits: [] },
      { blueprintId: 'poison_dagger', quality: 90, traits: [] },
      { blueprintId: 'mage_staff', quality: 90, traits: [] },
    ],
    armor: { blueprintId: 'chainmail', quality: 90, traits: [] },
    accessory: null,
    pet: { id: 'phoenix', level: 25 } },
];

for (const preset of presets) {
  const r = simulateRunsMonteCarlo({ ...preset, areaId: 'plains' }, 200);
  line(`${preset.label.padEnd(38)}  クリア${(r.clearRate*100).toFixed(0).padStart(3)}%  死亡${(r.deathRate*100).toFixed(0).padStart(3)}%  生存p50 ${(r.survivalP50/60).toFixed(1)}分  DPS-S ${r.avgDps.toFixed(0)} DPS-M ${r.avgDpsMulti.toFixed(0)}`);
}

// ──────────────────────────────────────────────────────
// 6. ボスラッシュ完走率 — ペット別比較
// ──────────────────────────────────────────────────────
h1('6. ボスラッシュ完走率 (4武器Q90セット, ペット別, 100試行)');

const brBase = {
  weaponSlots: [
    { blueprintId: 'fire_sword', quality: 90, traits: [] },
    { blueprintId: 'wind_bow', quality: 90, traits: [] },
    { blueprintId: 'poison_dagger', quality: 90, traits: [] },
    { blueprintId: 'mage_staff', quality: 90, traits: [] },
  ],
  armor: { blueprintId: 'chainmail', quality: 90, traits: [] },
  accessory: null,
};
const petVariants = [
  { label: 'ペットなし', pet: null },
  ...pets.map(p => ({ label: `${p.name} Lv25`, pet: { id: p.id, level: 25 } })),
];
line('ペット             完走率   平均撃破  中央値');
for (const v of petVariants) {
  const r = simulateBossRush({ ...brBase, pet: v.pet }, 100);
  line(`${v.label.padEnd(18)}  ${(r.fullClearRate*100).toFixed(0).padStart(4)}%   ${r.avgDefeated.toFixed(1).padStart(5)} /7  ${r.medianDefeated}/7`);
}

// ──────────────────────────────────────────────────────
// 7. EHP / 防具評価
// ──────────────────────────────────────────────────────
h1('7. 防具別 EHP (Q50, 武器なし、被弾DPS=10)');

const armors = Object.values(ItemBlueprints).filter(bp =>
  bp.type === 'equipment' && ['armor', 'robe'].includes(bp.equipType));
line('防具                            DEF    軽減率   EHP    生存秒');
const armorRows = armors.map(bp => {
  const probe = { blueprintId: bp.id, quality: 50, traits: [] };
  const s = buildSummary({ weaponSlots: [], armor: probe, accessory: null, pet: null, incomingDps: 10 });
  return { name: bp.name, def: s.defense, red: s.reduction, ehp: s.ehp, survSec: s.estimatedSurvivalSec };
}).sort((a, b) => b.ehp - a.ehp);
armorRows.slice(0, 12).forEach(a => {
  line(`${a.name.padEnd(30)}  ${a.def.toFixed(1).padStart(5)}  ${(a.red*100).toFixed(1).padStart(5)}%  ${a.ehp.toFixed(0).padStart(5)}  ${a.survSec.toFixed(0)}`);
});

line();
hr();
line('完了。各セクションの数値を元にバランス検討してください。');
