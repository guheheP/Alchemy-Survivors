/**
 * SettingsScreen — 設定画面（音量設定）
 */

import { SoundManager } from '../core/SoundManager.js';
import { GameFeelSettings } from '../core/GameFeelSettings.js';
import { PlayFabClient } from '../core/PlayFabClient.js';
import { AccountLinkModal } from '../ui/AccountLinkModal.js';
import { AccountLoginModal } from '../ui/AccountLoginModal.js';
import { canPromptInstall, promptInstall, isIOSStandaloneCapable, isRunningStandalone } from '../core/pwaRuntime.js';
import { eventBus } from '../core/EventBus.js';

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
        <h4>ゲームフィール</h4>
        <div class="settings-mute-row">
          <label class="settings-mute-toggle">
            <input type="checkbox" id="settings-hitstop" ${GameFeelSettings.hitStopEnabled ? 'checked' : ''}>
            <span>ヒットストップ（会心・ボス撃破で一瞬停止）</span>
          </label>
        </div>
        <div class="settings-mute-row">
          <label class="settings-mute-toggle">
            <input type="checkbox" id="settings-shake" ${GameFeelSettings.screenShakeEnabled ? 'checked' : ''}>
            <span>画面シェイク（被弾・大技時の揺れ）</span>
          </label>
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

      <div class="settings-section" id="settings-account-section">
        <h4>アカウント連携</h4>
        ${this._renderAccountSection()}
      </div>
      ` : ''}

      ${this._renderInstallSection()}

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

    // ゲームフィール
    const hitstopEl = this.el.querySelector('#settings-hitstop');
    if (hitstopEl) {
      hitstopEl.addEventListener('change', (e) => {
        GameFeelSettings.setHitStopEnabled(e.target.checked);
      });
    }
    const shakeEl = this.el.querySelector('#settings-shake');
    if (shakeEl) {
      shakeEl.addEventListener('change', (e) => {
        GameFeelSettings.setScreenShakeEnabled(e.target.checked);
      });
    }

    // 表示名
    this._bindDisplayName();

    // アカウント連携
    this._bindAccount();

    // PWA インストール
    this._bindInstall();
  }

  _renderInstallSection() {
    if (isRunningStandalone()) return ''; // 既にアプリとして起動中なら非表示
    const showChrome = canPromptInstall();
    const showIOS = isIOSStandaloneCapable();
    if (!showChrome && !showIOS) {
      // プロンプトは来ていないが、後で来る可能性があるので事前描画 (beforeinstallprompt イベントで再描画)
      return `
        <div class="settings-section" id="settings-install-section" style="display:none">
          <h4>アプリとして追加</h4>
          <button id="settings-install-btn" class="settings-account-btn">📱 ホーム画面に追加</button>
          <small>ホーム画面から全画面で起動できます。</small>
        </div>
      `;
    }
    if (showIOS) {
      return `
        <div class="settings-section" id="settings-install-section">
          <h4>アプリとして追加</h4>
          <p><small>iOS Safari で共有ボタン
            <span aria-hidden="true">⬆️</span>
            →「ホーム画面に追加」でアプリのように全画面プレイできます。</small></p>
        </div>
      `;
    }
    return `
      <div class="settings-section" id="settings-install-section">
        <h4>アプリとして追加</h4>
        <button id="settings-install-btn" class="settings-account-btn">📱 ホーム画面に追加</button>
        <small>ホーム画面から全画面で起動できます。</small>
      </div>
    `;
  }

  _bindInstall() {
    const section = this.el.querySelector('#settings-install-section');
    if (!section) return;
    const btn = section.querySelector('#settings-install-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const outcome = await promptInstall();
        if (outcome !== 'accepted') btn.disabled = false;
      });
    }
    // beforeinstallprompt が遅れて届いた場合はここで表示を有効化
    if (!this._installUnsub) {
      this._installUnsub = eventBus.on('pwa:installAvailable', () => {
        if (section && section.style.display === 'none') section.style.display = '';
      });
    }
  }

  _renderAccountSection() {
    const email = PlayFabClient.getEmail();
    const linked = !!email;
    if (linked) {
      return `
        <div class="settings-account-status linked">
          <div class="settings-account-email">✓ 連携済み: <strong>${this._escape(email)}</strong></div>
          <small>別の端末で「既存アカウントでログイン」を選ぶと、ここと同じ進行状況でプレイできます。</small>
        </div>
      `;
    }
    return `
      <p><small>メール + パスワードを登録すると、別の端末（スマホ等）から同じ進行状況でプレイできます。</small></p>
      <div class="settings-account-buttons">
        <button id="settings-account-link" class="settings-account-btn">🔗 連携する</button>
        <button id="settings-account-switch" class="settings-account-btn settings-account-btn-secondary">🔑 既存アカウントでログイン</button>
      </div>
    `;
  }

  _bindAccount() {
    const section = this.el.querySelector('#settings-account-section');
    if (!section) return;

    const linkBtn = section.querySelector('#settings-account-link');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => {
        new AccountLinkModal(document.body, (email) => {
          if (email) {
            // セクションを再描画
            const container = section;
            container.innerHTML = '<h4>アカウント連携</h4>' + this._renderAccountSection();
            this._bindAccount();
          }
        });
      });
    }

    const switchBtn = section.querySelector('#settings-account-switch');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        new AccountLoginModal(document.body, (ok) => {
          // 成功時はページリロードされる
        });
      });
    }
  }

  _escape(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    if (this._installUnsub) { this._installUnsub(); this._installUnsub = null; }
    this.el.remove();
  }
}
