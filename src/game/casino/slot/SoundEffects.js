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

/** スロット操作音 */
export const SlotSFX = {
  lever()        { safeCall(() => SoundManager.playHover?.()); },
  reelStop()     { safeCall(() => SoundManager.playBattleAdvAttack?.()); },
  bet()          { safeCall(() => SoundManager.playTabSwitch?.()); },

  // 小役
  bell()         { safeCall(() => SoundManager.playMaterialPickup?.()); },
  watermelon()   { safeCall(() => SoundManager.playMaterialPickupRare?.()); },
  cherry()       { safeCall(() => SoundManager.playMaterialPickup?.()); },
  replay()       { safeCall(() => SoundManager.playTabSwitch?.()); },

  // ZENCHO/CZ
  zenchoStart()  { safeCall(() => SoundManager.playPuzzleMatch?.(2)); },
  zenchoEndCz()  { safeCall(() => SoundManager.playEventChime?.()); },
  zenchoEndFail(){ safeCall(() => SoundManager.playError?.()); },
  czStart()      { safeCall(() => SoundManager.playEventChime?.()); },
  czSuccess()    { safeCall(() => SoundManager.playBattleVictory?.()); },
  czFail()       { safeCall(() => SoundManager.playDoorBell?.()); },

  // BONUS
  bonusInternal(){ safeCall(() => SoundManager.playPuzzleMatch?.(3)); },  // 内部成立
  bonusStart()   { safeCall(() => SoundManager.playFanfare?.()); },       // 揃い
  bonusEnd()     { safeCall(() => SoundManager.playDoorBell?.()); },
  bonusPayout()  { safeCall(() => SoundManager.playMaterialPickup?.()); },
  blue7Success() { safeCall(() => SoundManager.playLegendaryCraft?.()); }, // プレミア級

  // ART
  artStart()     { safeCall(() => SoundManager.playBattleVictory?.()); },
  artEnd()       { safeCall(() => SoundManager.playDoorBell?.()); },
  artAdd()       { safeCall(() => SoundManager.playMaterialPickupRare?.()); },
  artResume()    { safeCall(() => SoundManager.playBattleBuff?.()); },
  artStockConsume() { safeCall(() => SoundManager.playFanfare?.()); },
  upsell()       { safeCall(() => SoundManager.playMaterialPickupRare?.()); },

  // 天井
  tenjouStart()  { safeCall(() => SoundManager.playGameOver?.() || SoundManager.playError?.()); },
  tenjouHit()    { safeCall(() => SoundManager.playBattleRevive?.()); },

  // 両替
  exchange()     { safeCall(() => SoundManager.playSellCoin?.()); },
};
