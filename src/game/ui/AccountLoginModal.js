/**
 * AccountLoginModal — 既存アカウントにログインして別端末の進行状況を引き継ぐ
 * このモーダルはログイン後にページリロードを促し、クラウドセーブを適用する
 */

import { PlayFabClient } from '../core/PlayFabClient.js';

export class AccountLoginModal {
  constructor(container, onDone) {
    this.container = container;
    this.onDone = onDone || (() => {});
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay account-login-modal';
    this.el.innerHTML = `
      <div class="modal-card anim-fade-in">
        <h3>🔑 既存アカウントでログイン</h3>
        <p class="al-desc">
          別の端末で連携したメールアドレスとパスワードでログインします。<br>
          <span class="al-warn">⚠️ このデバイスの未保存の進行状況は失われます。</span>
        </p>
        <div class="al-field">
          <label for="alog-email">メールアドレス</label>
          <input type="email" id="alog-email" class="al-input" autocomplete="email">
        </div>
        <div class="al-field">
          <label for="alog-password">パスワード</label>
          <input type="password" id="alog-password" class="al-input" autocomplete="current-password">
        </div>
        <div class="al-error" id="alog-error"></div>
        <div class="al-buttons">
          <button class="al-btn al-btn-cancel" id="alog-cancel">キャンセル</button>
          <button class="al-btn al-btn-ok" id="alog-ok">ログイン</button>
        </div>
        <p class="al-note">
          <a href="#" id="alog-forgot">パスワードを忘れた方</a>
        </p>
      </div>
    `;
    container.appendChild(this.el);

    const email = this.el.querySelector('#alog-email');
    const pw = this.el.querySelector('#alog-password');
    const errorEl = this.el.querySelector('#alog-error');
    const okBtn = this.el.querySelector('#alog-ok');
    const cancelBtn = this.el.querySelector('#alog-cancel');
    const forgotLink = this.el.querySelector('#alog-forgot');

    setTimeout(() => email.focus(), 50);

    const submit = async () => {
      errorEl.textContent = '';
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await PlayFabClient.loginWithEmailAndPassword(email.value, pw.value);
        this._close();
        // クラウドセーブを反映するためリロード（起動時同期で復元される）
        this.onDone(true);
        // ローカルセーブは破棄（クラウドセーブを pull するため）
        try { localStorage.removeItem('alchemy_survivors_save_v1'); } catch (e) { /* ignore */ }
        setTimeout(() => window.location.reload(), 200);
      } catch (e) {
        errorEl.textContent = (e.message || 'ログインに失敗しました').toString();
        okBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    };

    okBtn.addEventListener('click', submit);
    [email, pw].forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    });
    cancelBtn.addEventListener('click', () => {
      this._close();
      this.onDone(false);
    });

    forgotLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const addr = email.value.trim();
      errorEl.textContent = '';
      if (!addr) {
        errorEl.textContent = '先にメールアドレスを入力してください';
        email.focus();
        return;
      }
      forgotLink.textContent = '送信中…';
      try {
        await PlayFabClient.sendAccountRecoveryEmail(addr);
        errorEl.style.color = '#6ed66e';
        errorEl.textContent = '再設定メールを送信しました。受信箱を確認してください。';
      } catch (err) {
        errorEl.textContent = (err.message || '送信に失敗しました').toString();
      } finally {
        forgotLink.textContent = 'パスワードを忘れた方';
      }
    });
  }

  _close() {
    if (this.el && this.el.parentNode) this.el.remove();
  }
}
