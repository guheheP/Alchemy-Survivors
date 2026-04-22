/**
 * simulate_rtm.mjs — Road to Millionaire の機械割・AT期待度シミュレータ
 *
 * DoD:
 *   - 全設定で目標機械割 ±2.5% に収束 (large-game検証)
 *   - AT初当り率・平均連数・モード滞在率を報告
 *   - 天井到達率が過剰でないこと
 *
 * 使用例:
 *   node scripts/casino/simulate_rtm.mjs                     # 設定4のみ、10万G
 *   node scripts/casino/simulate_rtm.mjs --all-settings      # 全設定
 *   node scripts/casino/simulate_rtm.mjs --games=500000      # 50万G
 *   node scripts/casino/simulate_rtm.mjs --all-settings --assert
 */

import { RoadToMillionaireMachine } from '../../src/game/casino/roadToMillionaire/RoadToMillionaireMachine.js';
import { Rng } from '../../src/game/casino/util/rng.js';

function parseArgs() {
  const args = {
    games: 100000,
    setting: null,
    allSettings: false,
    assert: false,
    seed: 23456,
    tolerance: 2.5,
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--games=')) args.games = parseInt(a.slice(8), 10);
    else if (a.startsWith('--setting=')) args.setting = parseInt(a.slice(10), 10);
    else if (a === '--all-settings') args.allSettings = true;
    else if (a === '--assert') args.assert = true;
    else if (a.startsWith('--seed=')) args.seed = parseInt(a.slice(7), 10);
    else if (a.startsWith('--tolerance=')) args.tolerance = parseFloat(a.slice(12));
  }
  return args;
}

function runSimulation(setting, totalGames, seed) {
  // メダル枯渇回避: 十分な初期量を与える
  let medals = totalGames * 20;
  const initialMedals = medals;

  const rtm = new RoadToMillionaireMachine({
    getMedals: () => medals,
    addMedals: (delta) => { medals += delta; return true; },
    getSetting: () => setting,
    rng: new Rng(seed),
  });

  const modeStayCounts = { normal: 0, chance: 0, heaven: 0, super_heaven: 0 };
  let atSpins = 0;
  let atStandbySpins = 0;
  let normalSpins = 0;
  let tenjouSpins = 0;

  let atEndCount = 0;
  let tenjouHitCount = 0;
  let atUpsellStockCount = 0;
  let navMissedCount = 0;

  // AT単位の連数分布 (atSetCount のヒストグラム: at_end イベント時点でサンプリング)
  const setCounts = [];
  let currentAtSets = 0;

  for (let i = 0; i < totalGames; i++) {
    const phaseBefore = rtm.state.phase;
    const modeBefore = rtm.state.mode;

    const result = rtm.spin();
    if (!result.ok) {
      console.error(`Ran out of medals at game ${i}`);
      break;
    }

    // AT中のナビ対象役: 90%で正解、10%外し (シミュレータのプレイヤーモデル)
    if (result.navOrder) {
      const actual = rtm.rng.next() < 0.9 ? result.navOrder.slice() : [2, 0, 1];
      const nav = rtm.finalizeNav(result, actual);
      if (!nav.matched) navMissedCount++;
    }

    // Phase統計
    switch (phaseBefore) {
      case 'NORMAL':     normalSpins++;     break;
      case 'AT':         atSpins++;         break;
      case 'AT_STANDBY': atStandbySpins++;  break;
      case 'TENJOU':     tenjouSpins++;     break;
    }

    // モード滞在 (NORMAL中のみカウント)
    if (phaseBefore === 'NORMAL') {
      modeStayCounts[modeBefore] = (modeStayCounts[modeBefore] || 0) + 1;
    }

    // AT一連のセット数を追跡
    if (result.events) {
      for (const ev of result.events) {
        if (ev.type === 'at_start') {
          currentAtSets = 1;
        } else if (ev.type === 'at_stock_consume') {
          currentAtSets++;
        } else if (ev.type === 'at_end') {
          setCounts.push(currentAtSets);
          currentAtSets = 0;
          atEndCount++;
        } else if (ev.type === 'tenjou_hit') {
          tenjouHitCount++;
        } else if (ev.type === 'at_upsell_stock') {
          atUpsellStockCount++;
        }
      }
    }
  }

  const stats = rtm.state.stats;
  const kikaiwari = (stats.totalPayout / stats.totalBet) * 100;
  const netMedals = medals - initialMedals;

  const avgSetsPerAt = setCounts.length > 0
    ? setCounts.reduce((a, b) => a + b, 0) / setCounts.length
    : 0;

  // モード滞在率
  const modeTotal = Object.values(modeStayCounts).reduce((a, b) => a + b, 0);
  const modeStayRate = {};
  for (const m of Object.keys(modeStayCounts)) {
    modeStayRate[m] = modeTotal > 0 ? (modeStayCounts[m] / modeTotal * 100) : 0;
  }

  return {
    setting,
    games: stats.gamesPlayed,
    totalBet: stats.totalBet,
    totalPayout: stats.totalPayout,
    kikaiwari,
    netMedals,
    atInitialCount: stats.atCount,
    atSetCount: stats.atSetCount,
    tenjouCount: stats.tenjouCount,
    tenjouHitCount,
    avgSetsPerAt,
    atSpins,
    atStandbySpins,
    normalSpins,
    tenjouSpins,
    atInitialFreq: stats.atCount > 0 ? (stats.gamesPlayed / stats.atCount).toFixed(0) : 'N/A',
    modeStayRate,
    atUpsellStockCount,
    navMissedCount,
  };
}

function printResult(r) {
  console.log(`\n--- Setting ${r.setting} ---`);
  console.log(`  Games:            ${r.games.toLocaleString()}`);
  console.log(`  Kikaiwari:        ${r.kikaiwari.toFixed(2)}%  (net ${r.netMedals >= 0 ? '+' : ''}${r.netMedals.toLocaleString()})`);
  console.log(`  AT initial:       ${r.atInitialCount}  (1/${r.atInitialFreq})`);
  console.log(`  AT total sets:    ${r.atSetCount}  (avg ${r.avgSetsPerAt.toFixed(2)}連/1初当り)`);
  console.log(`  Tenjou:           ${r.tenjouCount} (hit ${r.tenjouHitCount})`);
  console.log(`  Mode stay rate:   normal ${r.modeStayRate.normal.toFixed(1)}% / chance ${r.modeStayRate.chance.toFixed(1)}% / heaven ${r.modeStayRate.heaven.toFixed(1)}% / super ${r.modeStayRate.super_heaven.toFixed(1)}%`);
  console.log(`  Phase spins:      normal=${r.normalSpins} at=${r.atSpins} standby=${r.atStandbySpins} tenjou=${r.tenjouSpins}`);
  console.log(`  Upsell stocks:    ${r.atUpsellStockCount}  Nav missed: ${r.navMissedCount}`);
}

// 設計目標機械割
const TARGETS = { 1: 91.0, 2: 94.5, 3: 99.0, 4: 104.0, 5: 109.0, 6: 114.0 };

async function main() {
  const args = parseArgs();
  const settings = args.allSettings ? [1, 2, 3, 4, 5, 6] : [args.setting || 4];

  console.log(`=== Road to Millionaire Simulation ===`);
  console.log(`Games per setting: ${args.games.toLocaleString()}`);
  console.log(`RNG seed: ${args.seed}   Tolerance: ±${args.tolerance}%`);

  const results = [];
  for (const setting of settings) {
    const r = runSimulation(setting, args.games, args.seed + setting);
    results.push(r);
    printResult(r);
    if (args.assert) {
      const target = TARGETS[r.setting];
      const diff = Math.abs(r.kikaiwari - target);
      const pass = diff <= args.tolerance;
      console.log(`  Target ${target}% +/- ${args.tolerance}%  diff ${diff.toFixed(2)}%  ${pass ? 'OK' : 'FAIL'}`);
    }
  }

  if (args.assert) {
    const passed = results.filter(r => Math.abs(r.kikaiwari - TARGETS[r.setting]) <= args.tolerance);
    console.log(`\n=== Summary: ${passed.length}/${results.length} passed ===`);
    if (passed.length !== results.length) process.exit(1);
  }
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
