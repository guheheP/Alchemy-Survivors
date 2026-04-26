/**
 * KoyakuManager.js — 予告演出の抽選ロジック
 *
 * spin結果（フラグ）を見て、どの予告を発火するかを確率で決定する。
 *
 * 発火種別:
 *   - 'koyaku_tease_weak'     : 子役予告・弱（400ms）
 *   - 'koyaku_tease_strong'   : 子役予告・強（600ms）
 *   - 'chance_tease_normal'   : チャンス予告・通常（1200ms）
 *   - 'chance_tease_intense'  : チャンス予告・激（1500ms）
 *   - 'premier_rainbow'       : プレミア虹色（2000ms、ボーナス確定）
 *   - null                    : 予告なし
 *
 * willHit は「予告が当たりか」を示す（予告→成功 or ガセ）。
 */

/**
 * 予告抽選テーブル（分母: 1000）
 *
 * 列:
 *   wk    = weak (短い弱予告)
 *   st    = strong (強予告)
 *   cn    = chance_tease_normal
 *   ci    = chance_tease_intense
 *   step  = chance_tease_step (ステップアップ)
 *   cutin = chance_tease_cutin (カットイン)
 *   flask = chance_tease_flask (フラスコ沸騰)
 *   prem  = premier_rainbow
 *
 * 設計方針:
 *   - ベル / リプレイ / ハズレ: 弱予告のみ (シンプル)
 *   - 弱レア役: 弱予告中心、CHANCE煽りは控えめ
 *   - 強レア役: 強予告 + CHANCE煽り中-高頻度
 *   - CZ当選 (czTriggered): CHANCE煽りを大幅に増やす (`*_cz_hit` キー)
 *   - BIG/REG成立: CHANCE煽り高頻度 + プレミア
 *
 * @type {Record<string, {wk:number, st:number, cn:number, ci:number,
 *                        step:number, cutin:number, flask:number, prem:number}>}
 */
const TRIGGER_TABLE = {
  // ===== BIG/REG 内部成立 =====
  big_hit: { wk: 0, st: 0, cn: 200, ci: 220, step: 180, cutin: 130, flask: 120, prem: 150 }, // 計 1000
  reg_hit: { wk: 0, st: 50, cn: 230, ci: 200, step: 160, cutin: 130, flask: 130, prem: 80  }, // 計 980

  // ===== 強レア役 (BONUS外れ) =====
  watermelon_strong_hit: { wk: 0, st: 100, cn: 180, ci: 130, step: 100, cutin: 90,  flask: 80,  prem: 30 }, // 計 710
  cherry_strong_hit:     { wk: 0, st: 150, cn: 160, ci: 110, step: 80,  cutin: 80,  flask: 80,  prem: 30 }, // 計 690
  chance_strong_hit:     { wk: 0, st: 50,  cn: 180, ci: 200, step: 130, cutin: 100, flask: 100, prem: 80 }, // 計 840

  // ===== 強レア役 + CZ当選 (CHANCE煽り強化) =====
  watermelon_strong_cz_hit: { wk: 0, st: 50, cn: 220, ci: 200, step: 150, cutin: 140, flask: 130, prem: 50 }, // 計 940
  cherry_strong_cz_hit:     { wk: 0, st: 50, cn: 220, ci: 200, step: 150, cutin: 140, flask: 130, prem: 50 }, // 計 940
  chance_strong_cz_hit:     { wk: 0, st: 30, cn: 200, ci: 240, step: 160, cutin: 140, flask: 100, prem: 80 }, // 計 950

  // ===== 弱レア役 (BONUS外れ) =====
  watermelon_weak_hit: { wk: 350, st: 200, cn: 50, ci: 30, step: 30, cutin: 30, flask: 30, prem: 0 }, // 計 720
  cherry_weak_hit:     { wk: 400, st: 100, cn: 30, ci: 0,  step: 20, cutin: 20, flask: 0,  prem: 0 }, // 計 570
  chance_weak_hit:     { wk: 250, st: 300, cn: 80, ci: 50, step: 50, cutin: 50, flask: 50, prem: 0 }, // 計 830

  // ===== 弱レア役 + CZ当選 (CHANCE煽り中頻度) =====
  watermelon_weak_cz_hit: { wk: 100, st: 200, cn: 130, ci: 100, step: 100, cutin: 100, flask: 100, prem: 30 }, // 計 860
  cherry_weak_cz_hit:     { wk: 150, st: 200, cn: 130, ci: 100, step: 100, cutin: 100, flask: 100, prem: 30 }, // 計 910
  chance_weak_cz_hit:     { wk: 100, st: 200, cn: 180, ci: 130, step: 100, cutin: 100, flask: 100, prem: 30 }, // 計 940

  // ===== ベル / リプレイ / ハズレ (シンプル) =====
  bell_win:    { wk: 30, st: 0, cn: 0, ci: 0, step: 0, cutin: 0, flask: 0, prem: 0 }, // 計 30
  replay_miss: { wk: 50, st: 0, cn: 0, ci: 0, step: 0, cutin: 0, flask: 0, prem: 0 }, // 計 50
  pure_miss:   { wk: 60, st: 0, cn: 0, ci: 0, step: 0, cutin: 0, flask: 0, prem: 0 }, // 計 60
};

/**
 * spin結果から予告種別を抽選
 * @param {import('./SlotMachine.js').SpinResult} spinResult
 * @param {import('../util/rng.js').Rng} rng
 * @returns {{ type: string, willHit: boolean, opts: object } | null}
 */
export function decideYokoku(spinResult, rng) {
  if (!spinResult.ok) return null;

  const flags = spinResult.flags;
  if (!flags) return null;

  // 現在のphaseがBONUS/BONUS_STANDBYなら予告しない（本番進行優先）
  if (spinResult.phase === 'BONUS' || spinResult.phase === 'BONUS_STANDBY') {
    // 青7成功は別途 trigger される
    return null;
  }

  // 実フラグから予告候補キー決定
  const key = _classifyFlags(flags);
  const table = TRIGGER_TABLE[key];
  if (!table) return null;

  // 抽選（分母1000） — 優先度: prem > intense > step > flask > cutin > normal > strong > weak
  const r = rng.nextInt(1000);
  let cum = 0;
  const entries = [
    ['premier_rainbow',      table.prem  || 0],
    ['chance_tease_intense', table.ci    || 0],
    ['chance_tease_step',    table.step  || 0],
    ['chance_tease_flask',   table.flask || 0],
    ['chance_tease_cutin',   table.cutin || 0],
    ['chance_tease_normal',  table.cn    || 0],
    ['koyaku_tease_strong',  table.st    || 0],
    ['koyaku_tease_weak',    table.wk    || 0],
  ];

  for (const [type, weight] of entries) {
    cum += weight;
    if (r < cum) {
      return {
        type,
        willHit: _isHit(key),
        opts: _buildOpts(type, key, flags, spinResult),
      };
    }
  }

  return null; // 予告なし
}

/**
 * spin結果を予告抽選カテゴリにマップ
 */
function _classifyFlags(flags) {
  if (flags.bonusFlag === 'big') return 'big_hit';
  if (flags.bonusFlag === 'reg') return 'reg_hit';
  // bonusFlag が 'none' の場合は smallFlag + rareStrength + czTriggered を見る
  const strength = flags.rareStrength === 'strong' ? 'strong' : 'weak';
  const cz = flags.czTriggered ? '_cz' : '';
  if (flags.smallFlag === 'watermelon') return `watermelon_${strength}${cz}_hit`;
  if (flags.smallFlag === 'cherry')     return `cherry_${strength}${cz}_hit`;
  if (flags.smallFlag === 'chance')     return `chance_${strength}${cz}_hit`;
  if (flags.smallFlag === 'bell')       return 'bell_win';
  if (flags.smallFlag === 'replay')     return 'replay_miss';
  return 'pure_miss';
}

/**
 * 当たりカテゴリか（予告が成功=本当に当選）
 */
function _isHit(key) {
  return key === 'big_hit' ||
         key === 'reg_hit' ||
         key.endsWith('_hit');
}

/**
 * 予告演出用のオプション構築
 */
function _buildOpts(type, key, flags, spinResult) {
  return {
    bonusKind: flags.bonusFlag !== 'none' ? flags.bonusFlag : null,
    smallFlag: flags.smallFlag,
    willHit: _isHit(key),
    phase: spinResult.phase,
  };
}

/**
 * 予告演出の標準duration（ms）
 * SlotScreen から参照して AUTO 待ちの時間計算に使う
 */
export const YOKOKU_DURATION = {
  koyaku_tease_weak:      400,
  koyaku_tease_strong:    600,
  chance_tease_normal:   1200,
  chance_tease_cutin:    1000,
  chance_tease_flask:    1500,
  chance_tease_intense:  1500,
  chance_tease_step:     1800,
  premier_rainbow:       2000,
};
