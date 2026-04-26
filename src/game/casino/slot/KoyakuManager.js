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
 * 各実フラグに対して、どの予告種別がどの確率で発動するか。
 *
 * 「当たり」予告: 本当にその役が成立する
 * 「ガセ」予告  : 本当はハズレ/別役なのに予告が出る
 *
 * @type {Record<string, {wk:number, st:number, cn:number, ci:number, prem:number}>}
 *   wk=weak, st=strong, cn=chance-normal, ci=chance-intense, prem=premier
 */
const TRIGGER_TABLE = {
  // BIG 成立時: 演出発生。プレミアも少し
  big_hit:        { wk: 0,   st: 50,  cn: 400, ci: 350, prem: 100 }, // 計 900 (発生90%)
  // REG 成立時
  reg_hit:        { wk: 0,   st: 100, cn: 400, ci: 250, prem: 50  }, // 計 800 (発生80%)
  // 弱スイカ
  watermelon_weak_hit:   { wk: 350, st: 200, cn: 100, ci: 30,  prem: 0   }, // 計 680
  // 強スイカ: 上段並行揃い — チャンス〜激アツ
  watermelon_strong_hit: { wk: 0,   st: 100, cn: 350, ci: 400, prem: 50  }, // 計 900
  // 弱チェリー
  cherry_weak_hit:       { wk: 350, st: 100, cn: 50,  ci: 0,   prem: 0   }, // 計 500
  // 強チェリー: 角チェリー — 強烈
  cherry_strong_hit:     { wk: 0,   st: 200, cn: 300, ci: 350, prem: 50  }, // 計 900
  // 弱チャンス目
  chance_weak_hit:       { wk: 250, st: 350, cn: 200, ci: 50,  prem: 0   }, // 計 850
  // 強チャンス目: ほぼボーナス確定 — プレミア多め
  chance_strong_hit:     { wk: 0,   st: 100, cn: 200, ci: 500, prem: 200 }, // 計 1000
  // リプレイ成立時（ガセ）
  replay_miss:   { wk: 60,  st: 0,   cn: 30,  ci: 0,   prem: 0   }, // 計 90
  // 完全ハズレ（ガセ）
  pure_miss:     { wk: 80,  st: 0,   cn: 40,  ci: 0,   prem: 0   }, // 計 120
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

  // 抽選（分母1000）
  const r = rng.nextInt(1000);
  let cum = 0;
  const entries = [
    ['premier_rainbow',     table.prem],
    ['chance_tease_intense', table.ci],
    ['chance_tease_normal',  table.cn],
    ['koyaku_tease_strong', table.st],
    ['koyaku_tease_weak',   table.wk],
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
  // bonusFlag が 'none' の場合は smallFlag + rareStrength を見る
  const strength = flags.rareStrength === 'strong' ? 'strong' : 'weak';
  if (flags.smallFlag === 'watermelon') return `watermelon_${strength}_hit`;
  if (flags.smallFlag === 'cherry')     return `cherry_${strength}_hit`;
  if (flags.smallFlag === 'chance')     return `chance_${strength}_hit`;
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
  chance_tease_intense:  1500,
  premier_rainbow:       2000,
};
