/**
 * SoundEffects.js — カジノ機能専用の効果音ラッパー
 *
 * 既存の SoundManager メソッドを再利用し、カジノ用のイベントに適切な音を当てる。
 * 新規音源ファイルは追加しない（削除時にSoundManagerを触る必要がないよう疎結合維持）。
 *
 * 呼び出し失敗時（audio contextが閉じている等）は静かに無視する。
 */

import { SoundManager } from '../../core/SoundManager.js';

const CASINO_SETTINGS_KEY = 'casino_settings_v1';

/**
 * カジノ設定読み込み（音量、AUTO速度等）
 */
export function getCasinoSettings() {
  try {
    const raw = localStorage.getItem(CASINO_SETTINGS_KEY);
    if (!raw) return getDefaultSettings();
    return { ...getDefaultSettings(), ...JSON.parse(raw) };
  } catch {
    return getDefaultSettings();
  }
}

export function saveCasinoSettings(settings) {
  try {
    localStorage.setItem(CASINO_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

function getDefaultSettings() {
  return {
    soundEnabled: true,
    autoDelay: 400,        // AUTO実行間隔 (ms)
    skipAnimations: false, // アニメスキップ（超高速モード）
    seVolume: 0.7,         // カジノ内SEスケール (0.0〜1.0)
  };
}

function isSoundEnabled() {
  return getCasinoSettings().soundEnabled;
}

function safeCall(fn) {
  if (!isSoundEnabled()) return;
  try {
    if (typeof fn === 'function') fn();
  } catch (e) { /* ignore audio errors */ }
}

/** カジノSEスケールをSoundManagerに適用する */
export function applyCasinoSeVolume() {
  const s = getCasinoSettings();
  SoundManager.setSeVolumeScale?.(typeof s.seVolume === 'number' ? s.seVolume : 0.7);
}

/** SEスケールを 1.0 に戻す (カジノ離脱時) */
export function resetSeVolumeScale() {
  SoundManager.setSeVolumeScale?.(1.0);
}

// ===== デバウンス層 =====
// 同一キーが短時間に複数回呼ばれた場合、後続をドロップして音重なりを防ぐ。
const _lastCallAt = new Map();
/**
 * @param {string} key
 * @param {() => void} fn
 * @param {number} minIntervalMs
 */
function _debouncedCall(key, fn, minIntervalMs) {
  const now = performance.now();
  const last = _lastCallAt.get(key) || 0;
  if (now - last < minIntervalMs) return;
  _lastCallAt.set(key, now);
  safeCall(fn);
}

/** スロット操作音 */
export const SlotSFX = {
  lever()        { safeCall(() => SoundManager.playSlotLever?.()); },
  /** AUTO連打での二重発火を防ぐため20msデバウンス */
  reelStop()     { _debouncedCall('reelStop', () => SoundManager.playSlotReelStop?.(), 20); },
  bet()          { safeCall(() => SoundManager.playSlotBet?.()); },

  // 小役
  bell()         { safeCall(() => SoundManager.playMaterialPickup?.()); },
  watermelon()   { safeCall(() => SoundManager.playMaterialPickupRare?.()); },
  watermelonStrong() { safeCall(() => SoundManager.playSlotChanceMoku?.()); },
  cherry()       { safeCall(() => SoundManager.playMaterialPickup?.()); },
  cherryStrong() { safeCall(() => SoundManager.playSlotChanceMoku?.()); },
  chance()       { safeCall(() => SoundManager.playSlotChanceMoku?.()); },
  chanceStrong() { safeCall(() => SoundManager.playSlotFreeze?.()); },
  replay()       { safeCall(() => SoundManager.playTabSwitch?.()); },

  // ZENCHO/CZ
  zenchoStart()       { safeCall(() => SoundManager.playPuzzleMatch?.(2)); },
  zenchoStartBonus()  { safeCall(() => SoundManager.playSlotBonusInternal?.('big')); },
  zenchoEndCz()       { safeCall(() => SoundManager.playEventChime?.()); },
  zenchoEndBonus()    { safeCall(() => SoundManager.playFanfare?.()); },
  zenchoEndFail()     { safeCall(() => SoundManager.playError?.()); },
  czStart()      { safeCall(() => SoundManager.playEventChime?.()); },
  czSuccess()    { safeCall(() => SoundManager.playBattleVictory?.()); },
  czFail()       { safeCall(() => SoundManager.playDoorBell?.()); },

  // 演出 (Phase 2)
  /** @param {1|2|3} [level] */
  tenpai(level = 1)  { safeCall(() => SoundManager.playSlotTenpai?.(level)); },
  chanceMoku()       { safeCall(() => SoundManager.playSlotChanceMoku?.()); },
  freeze()           { safeCall(() => SoundManager.playSlotFreeze?.()); },

  // BONUS
  /** @param {'big'|'reg'|'blue7'} [kind] */
  bonusInternal(kind = 'big') { safeCall(() => SoundManager.playSlotBonusInternal?.(kind)); },
  bonusStart()   { safeCall(() => SoundManager.playFanfare?.()); },       // 揃い
  bonusEnd()     { safeCall(() => SoundManager.playDoorBell?.()); },
  bonusPayout()  { safeCall(() => SoundManager.playMaterialPickup?.()); },
  blue7Success() { safeCall(() => SoundManager.playLegendaryCraft?.()); }, // プレミア級

  // ART (ジャグラー系のシンプルな音色に差替え)
  artStart()     { safeCall(() => SoundManager.playSlotArtStart?.()); },
  artEnd()       { safeCall(() => SoundManager.playSlotArtEnd?.()); },
  artAdd()       { safeCall(() => SoundManager.playSlotArtAdd?.()); },
  artResume()    { safeCall(() => SoundManager.playSlotArtStart?.()); },
  artStockConsume() { safeCall(() => SoundManager.playSlotArtAdd?.()); },
  upsell()       { safeCall(() => SoundManager.playSlotArtAdd?.()); },

  // 天井
  tenjouStart()  { safeCall(() => SoundManager.playGameOver?.() || SoundManager.playError?.()); },
  tenjouHit()    { safeCall(() => SoundManager.playBattleRevive?.()); },

  // 両替
  exchange()     { safeCall(() => SoundManager.playSellCoin?.()); },
};
