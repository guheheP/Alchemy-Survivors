/**
 * GameFeelSettings — ゲームフィール（Juice）系のユーザー設定
 * localStorage に永続化。シングルトン。
 */

const STORAGE_KEY = 'alchemy_survivors_gamefeel_v1';

class GameFeelSettingsClass {
  constructor() {
    this.hitStopEnabled = true;
    this.screenShakeEnabled = true;
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.hitStopEnabled === 'boolean') this.hitStopEnabled = data.hitStopEnabled;
      if (typeof data.screenShakeEnabled === 'boolean') this.screenShakeEnabled = data.screenShakeEnabled;
    } catch (e) { /* 破損データは無視して初期値使用 */ }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        hitStopEnabled: this.hitStopEnabled,
        screenShakeEnabled: this.screenShakeEnabled,
      }));
    } catch (e) { /* 保存失敗は致命的でないので無視 */ }
  }

  setHitStopEnabled(enabled) {
    this.hitStopEnabled = !!enabled;
    this._save();
  }

  setScreenShakeEnabled(enabled) {
    this.screenShakeEnabled = !!enabled;
    this._save();
  }
}

export const GameFeelSettings = new GameFeelSettingsClass();
