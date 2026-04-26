/**
 * verify_stop_patterns.mjs — STOP_PATTERNS の生成結果を視覚的に確認するスクリプト
 *
 * 実行: node scripts/casino/verify_stop_patterns.mjs
 *
 * リール配列を変更したらこのスクリプトを実行し、
 *   - 各フラグのパターン件数が0でないこと
 *   - 各パターンが意図した不変条件を満たしていること
 * を確認する。
 */

import { STOP_PATTERNS, PAYLINES } from '../../src/game/casino/data/stopPatterns.js';

const SHORT = {
  BELL:       'B ',
  WATERMELON: 'W ',
  CHERRY:     'C ',
  REPLAY:     'R ',
  BIG7:       'r7',
  BLUE7:      'b7',
};

function symStr(s) { return SHORT[s] || '? '; }

function checkAlignments(frame) {
  const aligned = [];
  for (const line of PAYLINES) {
    const [rL, rC, rR] = line.rows;
    const sL = frame[0][rL], sC = frame[1][rC], sR = frame[2][rR];
    if (sL === sC && sC === sR) aligned.push(`${line.name}=${sL}`);
  }
  return aligned;
}

let totalPatterns = 0;
let totalErrors = 0;

for (const [key, list] of Object.entries(STOP_PATTERNS)) {
  console.log(`\n=== ${key} (${list.length} patterns) ===`);
  totalPatterns += list.length;

  for (const p of list) {
    const lines = [0, 1, 2].map(r =>
      `${symStr(p.frame[0][r])} ${symStr(p.frame[1][r])} ${symStr(p.frame[2][r])}`,
    );
    const stopsStr = `[${p.stops.join(',')}]`.padEnd(10);
    const winInfo = p.winLine ? ` win=${p.winLine.name}` : (p.winCells.length > 0 ? ` cells=${JSON.stringify(p.winCells)}` : ' (no-win)');
    const aligned = checkAlignments(p.frame);
    const alignTag = aligned.length > 0 ? `  ALIGN[${aligned.join('|')}]` : '';
    console.log(`  stops=${stopsStr}  ${lines.join(' / ')}${winInfo}${alignTag}`);
  }

  for (const p of list) {
    const aligned = checkAlignments(p.frame);
    const violations = [];

    const cherryLeft = p.frame[0].includes('CHERRY');
    const cherryCenter = p.frame[1].includes('CHERRY');
    const cherryRight = p.frame[2].includes('CHERRY');

    if (key === 'replay') {
      if (cherryLeft) violations.push('left-CHERRY禁止');
      const conflict = aligned.filter(a => a.includes('BELL') || a.includes('WATERMELON'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'bell_diag') {
      if (cherryLeft) violations.push('left-CHERRY禁止');
      // 通常時ベル揃いは右下がりのみ
      if (p.winLine?.name !== 'diag-down') violations.push('右下がり以外の揃い禁止');
      const conflict = aligned.filter(a => a.includes('WATERMELON') || a.includes('REPLAY'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'watermelon_diag' || key === 'watermelon_top') {
      // 左リール中段にWATERMELONを引き込まない
      if (p.frame[0][1] === 'WATERMELON') violations.push('左中段WATERMELON引き込み禁止');
      const conflict = aligned.filter(a => a.includes('BELL') || a.includes('REPLAY'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'cherry') {
      if (p.frame[0][2] !== 'CHERRY') violations.push('左下段CHERRY無し');
      if (p.frame[0][0] === 'CHERRY' || p.frame[0][1] === 'CHERRY') violations.push('左の上/中にCHERRY');
      if (cherryCenter || cherryRight) violations.push('中/右リールにCHERRY');
      const conflict = aligned.filter(a => a.includes('BELL') || a.includes('WATERMELON') || a.includes('REPLAY'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'cherry_double') {
      const updown = (p.frame[0][0] === 'CHERRY' && p.frame[2][2] === 'CHERRY');
      const downup = (p.frame[0][2] === 'CHERRY' && p.frame[2][0] === 'CHERRY');
      if (!updown && !downup) violations.push('斜めダブルチェリーになっていない');
      if (cherryCenter) violations.push('中央リールにCHERRY');
      const conflict = aligned.filter(a => a.includes('BELL') || a.includes('WATERMELON') || a.includes('REPLAY'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'reachme') {
      if (p.frame[0][1] !== 'CHERRY') violations.push('左中段CHERRY無し');
      if (cherryCenter || cherryRight) violations.push('中/右リールにCHERRY');
      const conflict = aligned.filter(a => a.includes('BELL') || a.includes('WATERMELON') || a.includes('REPLAY'));
      if (conflict.length > 0) violations.push(`競合揃い:${conflict}`);
    }
    if (key === 'chance_a') {
      if (p.frame[0][1] !== 'WATERMELON' || p.frame[1][1] !== 'REPLAY' || p.frame[2][1] !== 'CHERRY') {
        violations.push('中段スイカ・リプレイ・チェリーになっていない');
      }
    }
    if (key === 'chance_b') {
      if (p.frame[0][0] !== 'BIG7' || p.frame[1][1] !== 'BELL' || p.frame[2][2] !== 'BLUE7') {
        violations.push('右下がり赤7テンパイハズレになっていない');
      }
    }
    if (key === 'none') {
      if (cherryLeft) violations.push('左リールCHERRY禁止');
      if (p.frame[0].includes('WATERMELON')) violations.push('左リールWATERMELON禁止');
      if (aligned.length > 0) violations.push(`揃い禁止:${aligned}`);
    }

    if (violations.length > 0) {
      totalErrors++;
      console.log(`    ❌ stops=[${p.stops.join(',')}]  ${violations.join(' / ')}`);
    }
  }
}

console.log('\n=== Summary ===');
console.log(`  total patterns: ${totalPatterns}`);
console.log(`  violations:     ${totalErrors}`);
process.exit(totalErrors > 0 ? 1 : 0);
