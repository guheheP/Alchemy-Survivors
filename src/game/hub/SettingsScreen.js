/**
 * SettingsScreen — 設定画面（音量設定）
 */

import { SoundManager } from '../core/SoundManager.js';

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
