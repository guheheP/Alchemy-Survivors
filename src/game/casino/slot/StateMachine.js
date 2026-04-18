/**
 * StateMachine.js — 状態遷移ロジック
 *
 * Phase 3 で実装する状態: NORMAL / ZENCHO / CZ / BONUS_STANDBY / BONUS / ART / TENJOU
 *
 * 遷移ルール要約:
 *   - BONUS抽選は NORMAL / ZENCHO / CZ / ART / TENJOU で常時稼働
 *   - BONUS内部成立 → BONUS_STANDBY（resumePhase保存）
 *   - BONUS_STANDBY中に図柄揃い成立 → BONUS
 *   - BONUS中に青7揃い → blue7Succeeded=true
 *   - BONUS終了時:
 *       blue7 && resumePhase=ART → ART復帰＋100G上乗せ
 *       blue7                    → 新規ART突入（初期40G）
 *       resumePhase=ART          → ART復帰（残G消化再開）
 *       else                     → NORMAL復帰
 *   - NORMAL中のレア役でZENCHO抽選 → ZENCHO (5-15G)
 *   - ZENCHO消化終了 → CZ / BONUS_STANDBY(直撃) / NORMAL（結果抽選）
 *   - CZ中のチャンス目でART成功 → ART
 *   - CZ 10G経過 → NORMAL（失敗）
 *   - NORMAL normalGameCount >= TENJOU_GAMES → TENJOU
 *   - TENJOU中のレア役 → 強制BONUS内部成立
 */

import { BONUS_GAME_COUNT, ART_CONSTANTS } from '../data/payouts.js';
import { ZENCHO_GAMES, CZ_GAMES, TENJOU_GAMES } from '../data/probabilities.js';

/**
 * @typedef {Object} TransitionInput
 * @property {import('./SlotEngine.js').DrawResult} flags
 * @property {boolean} bonusSymbolsAligned
 * @property {boolean} blue7Aligned
 * @property {'cz'|'bonus_hit'|'fail'|null} [zenchoResult] - ZENCHO終了時に外部から渡される
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
      state.standbyBonusKind = null;
      if (kind === 'big') state.stats.bigCount++;
      else if (kind === 'reg') state.stats.regCount++;
    }
    return events;
  }

  // BONUS内部成立（全NORMAL系phaseで共通チェック）→ BONUS_STANDBY
  if (input.flags.bonusFlag !== 'none' &&
      (state.phase === 'NORMAL' || state.phase === 'ZENCHO' || state.phase === 'CZ' ||
       state.phase === 'ART' || state.phase === 'TENJOU')) {
    if (state.phase === 'TENJOU' && input.flags.tenjouForceBonus) {
      events.push({ type: 'tenjou_hit' });
    }
    events.push({ type: 'bonus_standby_start', bonusKind: input.flags.bonusFlag });
    state.resumePhase = state.phase === 'TENJOU' ? 'NORMAL' : state.phase;
    state.phase = 'BONUS_STANDBY';
    state.standbyBonusKind = input.flags.bonusFlag;
    // 各phase固有の残G消化は停止
    return events;
  }

  // ZENCHO中
  if (state.phase === 'ZENCHO') {
    state.zenchoGamesRemaining--;
    if (state.zenchoGamesRemaining <= 0) {
      // 結果抽選（SlotMachine側でrngを渡して判定済 or ここで引く）
      // 本実装: SlotMachine が drawZenchoResult を呼んで input.zenchoResult を渡す
      const result = input.zenchoResult || 'fail';
      events.push({ type: 'zencho_end', reason: result });
      if (result === 'cz') {
        state.phase = 'CZ';
        state.czGamesRemaining = CZ_GAMES;
        state.stats.czCount++;
        events.push({ type: 'cz_start' });
      } else if (result === 'bonus_hit') {
        // 直撃: BONUS_STANDBYへ（種別はRNGで決定、big:reg = 7:3）
        const kind = rng.nextInt(10) < 7 ? 'big' : 'reg';
        events.push({ type: 'bonus_standby_start', bonusKind: kind });
        state.resumePhase = 'NORMAL';
        state.phase = 'BONUS_STANDBY';
        state.standbyBonusKind = kind;
      } else {
        // 失敗: NORMAL復帰
        state.phase = 'NORMAL';
      }
    }
    return events;
  }

  // CZ中
  if (state.phase === 'CZ') {
    if (input.flags.czSuccess) {
      events.push({ type: 'cz_success' });
      state.phase = 'ART';
      state.artGamesRemaining = ART_CONSTANTS.INITIAL_GAMES;
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
    // ZENCHO突入判定
    if (input.flags.zenchoTriggered) {
      state.phase = 'ZENCHO';
      const range = ZENCHO_GAMES.max - ZENCHO_GAMES.min + 1;
      state.zenchoGamesRemaining = ZENCHO_GAMES.min + rng.nextInt(range);
      state.stats.zenchoCount++;
      events.push({ type: 'zencho_start', amount: state.zenchoGamesRemaining });
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

  if (state.blue7Succeeded) {
    if (fromArt) {
      state.artGamesRemaining += ART_CONSTANTS.ART_IN_BONUS_ADD;
      state.artStocks++;
      events.push({ type: 'art_add', amount: ART_CONSTANTS.ART_IN_BONUS_ADD });
      state.phase = 'ART';
    } else {
      state.artGamesRemaining = ART_CONSTANTS.INITIAL_GAMES;
      state.phase = 'ART';
      state.stats.artCount++;
      events.push({ type: 'art_start', amount: ART_CONSTANTS.INITIAL_GAMES });
    }
  } else {
    if (fromArt && state.artGamesRemaining > 0) {
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
