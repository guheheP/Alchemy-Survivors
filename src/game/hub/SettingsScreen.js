/**
 * SettingsScreen — 設定画面（音量設定）
 */

import { SoundManager } from '../core/SoundManager.js';
import { PlayFabClient } from '../core/PlayFabClient.js';

export class SettingsScreen {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'settings-screen';
  }

  render() {
    const master = Math.round(SoundManager.masterVolume * 100);
    const bgm = Math.round(SoundManager.bgmVolume * 100);
    const se = Math.round(SoundManager.seVolume * 100);
    const muted = SoundManager.muted;

    this.el.innerHTML = `
      <h3>設定</h3>

      <div class="settings-section">
        <h4>サウンド</h4>

        <div class="settings-mute-row">
          <label class="settings-mute-toggle">
            <input type="checkbox" id="settings-mute" ${muted ? 'checked' : ''}>
            <span>ミュート</span>
          </label>
        </div>

        <div class="settings-volume-row">
          <label for="settings-master">マスター音量</label>
          <input type="range" id="settings-master" min="0" max="100" value="${master}" ${muted ? 'disabled' : ''}>
          <span class="settings-vol-value" id="settings-master-val">${master}%</span>
        </div>

        <div class="settings-volume-row">
          <label for="settings-bgm">BGM</label>
          <input type="range" id="settings-bgm" min="0" max="100" value="${bgm}" ${muted ? 'disabled' : ''}>
          <span class="settings-vol-value" id="settings-bgm-val">${bgm}%</span>
        </div>

        <div class="settings-volume-row">
          <label for="settings-se">効果音</label>
          <input type="range" id="settings-se" min="0" max="100" value="${se}" ${muted ? 'disabled' : ''}>
          <span class="settings-vol-value" id="settings-se-val">${se}%</span>
        </div>
      </div>

      ${PlayFabClient.isAvailable() ? `
      <div class="settings-section">
        <h4>プレイヤー名</h4>
        <div class="settings-name-row">
          <input type="text" id="settings-display-name" class="settings-name-input"
                 maxlength="25"
                 placeholder="例: Alchemist"
                 value="${(PlayFabClient.getDisplayName() || '').replace(/"/g, '&quot;')}">
          <button id="settings-display-name-save" class="settings-name-save">変更</button>
        </div>
        <div class="settings-name-status" id="settings-name-status">
          <small>3〜25 文字。ランキング表示に使われます。</small>
        </div>
      </div>
      ` : ''}

      <div class="settings-section">
        <h4>操作</h4>
        <div class="settings-info">
          <div class="settings-key-row"><span class="settings-key">W A S D / 矢印</span><span>移動</span></div>
          <div class="settings-key-row"><span class="settings-key">Space</span><span>ダッシュ</span></div>
          <div class="settings-key-row"><span class="settings-key">Tab</span><span>詳細ステータス表示の切替</span></div>
          <div class="settings-key-row"><span class="settings-key">1 2 3</span><span>消耗品使用 / レベルアップ選択</span></div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    // ミュートトグル
    const muteCheck = this.el.querySelector('#settings-mute');
    muteCheck.addEventListener('change', () => {
      SoundManager.toggleMute();
      this._updateSliderStates();
    });

    // マスター音量
    this._bindSlider('settings-master', 'settings-master-val', (v) => {
      SoundManager.setMasterVolume(v / 100);
    });

    // BGM音量
    this._bindSlider('settings-bgm', 'settings-bgm-val', (v) => {
      SoundManager.setBgmVolume(v / 100);
    });

    // SE音量
    this._bindSlider('settings-se', 'settings-se-val', (v) => {
      SoundManager.setSeVolume(v / 100);
    });

    // 表示名
    this._bindDisplayName();
  }

  _bindDisplayName() {
    const input = this.el.querySelector('#settings-display-name');
    const saveBtn = this.el.querySelector('#settings-display-name-save');
    const status = this.el.querySelector('#settings-name-status');
    if (!input || !saveBtn || !status) return;

    const submit = async () => {
      const name = input.value.trim();
      if (name.length < 3 || name.length > 25) {
        status.innerHTML = '<small class="settings-name-error">3〜25 文字で入力してください</small>';
        return;
      }
      saveBtn.disabled = true;
      status.innerHTML = '<small>更新中…</small>';
      try {
        const accepted = await PlayFabClient.updateDisplayName(name);
        input.value = accepted;
        status.innerHTML = '<small class="settings-name-ok">✓ 更新しました</small>';
      } catch (e) {
        status.innerHTML = `<small class="settings-name-error">${e.message || '更新失敗'}</small>`;
      } finally {
        saveBtn.disabled = false;
      }
    };

    saveBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }

  _bindSlider(sliderId, valueId, onChange) {
    const slider = this.el.querySelector(`#${sliderId}`);
    const valueEl = this.el.querySelector(`#${valueId}`);
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      valueEl.textContent = `${v}%`;
      onChange(v);
    });
  }

  _updateSliderStates() {
    const muted = SoundManager.muted;
    const sliders = this.el.querySelectorAll('input[type="range"]');
    for (const s of sliders) {
      s.disabled = muted;
    }
  }

  destroy() {
    this.el.remove();
  }
}
