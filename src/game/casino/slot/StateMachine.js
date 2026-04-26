/**
 * StateMachine.js — 状態遷移ロジック
 *
 * Phase 3 で実装する状態: NORMAL / ZENCHO / CZ / BONUS_STANDBY / BONUS / ART / TENJOU
 *
 * 遷移ルール要約 (レア役複合方式):
 *   - レア役強弱→BONUS抽選→外れたらCZ抽選 (NORMAL/TENJOU)
 *   - NORMAL中のレア役からBONUS当選 → ZENCHO(1-3G) → BONUS_STANDBY
 *   - NORMAL中のレア役からCZ当選   → ZENCHO(10-15G) → CZ
 *   - ART/ZENCHO/CZ/TENJOU 中のBONUS当選は即 BONUS_STANDBY (前兆スキップ)
 *   - BONUS_STANDBY中に図柄揃い成立 → BONUS
 *   - BONUS中に青7揃い → blue7Succeeded=true
 *   - BONUS終了時:
 *       blue7 && resumePhase=ART → ART復帰＋上乗せ
 *       blue7                    → 新規ART突入（初期40G）
 *       resumePhase=ART          → ART復帰（残G消化再開）
 *       else                     → NORMAL復帰
 *   - CZ中: 引いた役で ART成功抽選 (CZ_REROLL_TABLE)
 *   - CZ 10G経過 → NORMAL（失敗）
 *   - NORMAL normalGameCount >= TENJOU_GAMES → TENJOU
 *   - TENJOU中のレア役 → 強制BONUS内部成立 (前兆なし即BONUS_STANDBY)
 */

import { BONUS_GAME_COUNT, ART_CONSTANTS } from '../data/payouts.js';
import { ZENCHO_BONUS_GAMES, ZENCHO_CZ_GAMES, CZ_GAMES, TENJOU_GAMES } from '../data/probabilities.js';

/**
 * @typedef {Object} TransitionInput
 * @property {import('./SlotEngine.js').DrawResult} flags
 * @property {boolean} bonusSymbolsAligned
 * @property {boolean} blue7Aligned
 */

/**
 * @typedef {Object} TransitionEvent
 * @property {'bonus_standby_start'|'bonus_start'|'bonus_end'|'art_start'|'art_end'|'art_resume'|'blue7_success'|'art_add'|'art_stock_consume'|'zencho_start'|'zencho_end'|'cz_start'|'cz_success'|'cz_fail'|'tenjou_start'|'tenjou_hit'} type
 * @property {string} [bonusKind]
 * @property {number} [amount]
 * @property {number} [stocksRemaining]
 * @property {string} [reason]
 */

/**
 * 1ゲーム終了時の状態遷移を実行
 * @param {import('../state/SlotSessionState.js').SlotSessionState} state
 * @param {TransitionInput} input
 * @param {import('../util/rng.js').Rng} rng
 * @returns {TransitionEvent[]}
 */
export function transition(state, input, rng) {
  /** @type {TransitionEvent[]} */
  const events = [];

  // BONUS中: 青7成功を記録、ゲーム消化
  if (state.phase === 'BONUS') {
    if (input.blue7Aligned) {
      state.blue7Succeeded = true;
      events.push({ type: 'blue7_success' });
    }
    state.bonusGamesRemaining--;
    if (state.bonusGamesRemaining <= 0) {
      events.push(...endBonus(state));
    }
    return events;
  }

  // BONUS_STANDBY中: 図柄揃いでBONUS消化開始
  if (state.phase === 'BONUS_STANDBY') {
    if (input.bonusSymbolsAligned && state.standbyBonusKind) {
      const kind = state.standbyBonusKind;
      events.push({ type: 'bonus_start', bonusKind: kind });
      state.phase = 'BONUS';
      state.bonusKind = kind;
      state.bonusGamesRemaining = kind === 'big' ? BONUS_GAME_COUNT.BIG : BONUS_GAME_COUNT.REG;
      state.blue7Succeeded = false;
      state.bonusGainTotal = 0;
      state.standbyBonusKind = null;
      if (kind === 'big') state.stats.bigCount++;
      else if (kind === 'reg') state.stats.regCount++;
    }
    return events;
  }

  // BONUS内部成立（全NORMAL系phaseで共通チェック）
  if (input.flags.bonusFlag !== 'none' &&
      (state.phase === 'NORMAL' || state.phase === 'ZENCHO' || state.phase === 'CZ' ||
       state.phase === 'ART' || state.phase === 'TENJOU')) {
    if (state.phase === 'TENJOU' && input.flags.tenjouForceBonus) {
      events.push({ type: 'tenjou_hit' });
    }
    // ART中のBONUS当選は即BONUS_STANDBYへ (ART資源は維持される)
    // ZENCHO/CZ/TENJOU中の当選も即BONUS_STANDBYへ (前兆/CZ消化中は別ロジック)
    // NORMAL中のレア役→BONUS当選は前兆経由 (1〜3G)
    if (state.phase === 'NORMAL' && input.flags.rareStrength !== null) {
      state.phase = 'ZENCHO';
      state.pendingResult = 'bonus';
      state.pendingBonusKind = input.flags.bonusFlag;
      const range = ZENCHO_BONUS_GAMES.max - ZENCHO_BONUS_GAMES.min + 1;
      state.zenchoGamesRemaining = ZENCHO_BONUS_GAMES.min + rng.nextInt(range);
      state.stats.zenchoCount++;
      events.push({
        type: 'zencho_start',
        amount: state.zenchoGamesRemaining,
        reason: 'bonus',
      });
      return events;
    }
    events.push({ type: 'bonus_standby_start', bonusKind: input.flags.bonusFlag });
    state.resumePhase = state.phase === 'TENJOU' ? 'NORMAL' : state.phase;
    // ART中のBONUS当選はその時点で1セットストック確定
    if (state.phase === 'ART') {
      state.artStocks++;
    }
    state.phase = 'BONUS_STANDBY';
    state.standbyBonusKind = input.flags.bonusFlag;
    // 各phase固有の残G消化は停止
    return events;
  }

  // ZENCHO中: 前兆消化のみ (結果は突入時に確定済 — pendingResult/pendingBonusKind)
  if (state.phase === 'ZENCHO') {
    state.zenchoGamesRemaining--;
    if (state.zenchoGamesRemaining <= 0) {
      const result = state.pendingResult;
      events.push({ type: 'zencho_end', reason: result || 'fail' });
      if (result === 'cz') {
        state.phase = 'CZ';
        state.czGamesRemaining = CZ_GAMES;
        state.stats.czCount++;
        events.push({ type: 'cz_start' });
      } else if (result === 'bonus') {
        const kind = state.pendingBonusKind || 'big';
        events.push({ type: 'bonus_standby_start', bonusKind: kind });
        state.resumePhase = 'NORMAL';
        state.phase = 'BONUS_STANDBY';
        state.standbyBonusKind = kind;
      } else {
        // pendingResult が無い (フェイル前兆: 念のため) — NORMAL 復帰
        state.phase = 'NORMAL';
      }
      state.pendingResult = null;
      state.pendingBonusKind = null;
    }
    return events;
  }

  // CZ中
  if (state.phase === 'CZ') {
    if (input.flags.czSuccess) {
      events.push({ type: 'cz_success' });
      state.phase = 'ART';
      state.artGamesRemaining = ART_CONSTANTS.INITIAL_GAMES;
      state.artGainTotal = 0;
      state.stats.artCount++;
      state.czGamesRemaining = 0;
      events.push({ type: 'art_start', amount: ART_CONSTANTS.INITIAL_GAMES });
      return events;
    }
    state.czGamesRemaining--;
    if (state.czGamesRemaining <= 0) {
      events.push({ type: 'cz_fail' });
      state.phase = 'NORMAL';
    }
    return events;
  }

  // NORMAL / ART / TENJOU: BONUS未成立時の各phase固有の処理
  if (state.phase === 'NORMAL') {
    state.normalGameCount++;
    // 天井判定（ZENCHO突入より優先: 天井Gに到達したら救済を確実に）
    if (state.normalGameCount >= TENJOU_GAMES) {
      state.phase = 'TENJOU';
      state.stats.tenjouCount++;
      events.push({ type: 'tenjou_start' });
      return events;
    }
    // CZ前兆突入判定 (レア役からCZ当選)
    if (input.flags.czTriggered) {
      state.phase = 'ZENCHO';
      state.pendingResult = 'cz';
      state.pendingBonusKind = null;
      const range = ZENCHO_CZ_GAMES.max - ZENCHO_CZ_GAMES.min + 1;
      state.zenchoGamesRemaining = ZENCHO_CZ_GAMES.min + rng.nextInt(range);
      state.stats.zenchoCount++;
      events.push({
        type: 'zencho_start',
        amount: state.zenchoGamesRemaining,
        reason: 'cz',
      });
      return events;
    }
    return events;
  }

  if (state.phase === 'ART') {
    state.artGamesRemaining--;
    if (state.artGamesRemaining <= 0) {
      // ストック消化: 残っていれば次ARTを即スタート
      if (state.artStocks > 0) {
        state.artStocks--;
        state.artGamesRemaining = ART_CONSTANTS.STOCK_BONUS_ADD;
        state.stats.artCount++;
        events.push({
          type: 'art_stock_consume',
          amount: ART_CONSTANTS.STOCK_BONUS_ADD,
          stocksRemaining: state.artStocks,
        });
        // phaseはARTのまま継続
        return events;
      }
      events.push({ type: 'art_end' });
      state.phase = 'NORMAL';
      state.artGamesRemaining = 0;
      // ART終了時に獲得枚数をリセット
      state.artGainTotal = 0;
      // ART終了後はnormal gameCountをリセット（天井リセット）
      state.normalGameCount = 0;
    }
    return events;
  }

  if (state.phase === 'TENJOU') {
    // TENJOU中はレア役待ち。通常の小役は無視して待機
    return events;
  }

  return events;
}

/**
 * BONUS終了時の復帰ロジック
 * @param {import('../state/SlotSessionState.js').SlotSessionState} state
 * @returns {TransitionEvent[]}
 */
function endBonus(state) {
  /** @type {TransitionEvent[]} */
  const events = [];
  events.push({ type: 'bonus_end', bonusKind: state.bonusKind || undefined });

  const fromArt = state.resumePhase === 'ART';
  // CZ/ZENCHO中のBONUS当選はART確定 (青7成否に関わらず新規ART突入)
  const fromCzOrZencho = state.resumePhase === 'CZ' || state.resumePhase === 'ZENCHO';

  if (state.blue7Succeeded) {
    if (fromArt) {
      // ART中の青7成功: +60G上乗せ。stockは BONUS_STANDBY 突入時に加算済 — 重複させない
      state.artGamesRemaining += ART_CONSTANTS.ART_IN_BONUS_ADD;
      events.push({ type: 'art_add', amount: ART_CONSTANTS.ART_IN_BONUS_ADD });
      state.phase = 'ART';
    } else {
      state.artGamesRemaining = ART_CONSTANTS.INITIAL_GAMES;
      state.artGainTotal = 0;
      state.phase = 'ART';
      state.stats.artCount++;
      events.push({ type: 'art_start', amount: ART_CONSTANTS.INITIAL_GAMES });
    }
  } else if (fromCzOrZencho) {
    // CZ/ZENCHO 中のBONUS当選 → ART確定 (青7なしでも新規ART)
    state.artGamesRemaining = ART_CONSTANTS.INITIAL_GAMES;
    state.artGainTotal = 0;
    state.phase = 'ART';
    state.stats.artCount++;
    events.push({ type: 'art_start', amount: ART_CONSTANTS.INITIAL_GAMES });
  } else {
    if (fromArt && state.artGamesRemaining > 0) {
      // ART中BONUS (青7なし): stockは突入時に追加済。残G維持で復帰
      state.phase = 'ART';
      events.push({ type: 'art_resume' });
    } else {
      state.phase = 'NORMAL';
      state.artGamesRemaining = 0;
    }
  }

  // BONUS経由で帰還する場合、天井カウンタをリセット
  // 復帰先がARTでもリセットする（ART消化後にNORMAL復帰した時点で天井は0から再計測）。
  // BONUS取得 = 天井権利消費、という一貫したルール。
  state.normalGameCount = 0;

  state.bonusKind = null;
  state.bonusGamesRemaining = 0;
  state.blue7Succeeded = false;
  state.resumePhase = null;

  return events;
}
