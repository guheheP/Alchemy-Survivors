/**
 * AccountLinkModal — 現在の匿名アカウントにメール + パスワードを紐付け
 */

import { PlayFabClient } from '../core/PlayFabClient.js';

export class AccountLinkModal {
  constructor(container, onDone) {
    this.container = container;
    this.onDone = onDone || (() => {});
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay account-link-modal';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'アカウント連携');
    this.el.innerHTML = `
      <div class="modal-card anim-fade-in">
        <h3>🔗 アカウント連携</h3>
        <p class="al-desc">
          メールアドレスとパスワードを登録すると、<br>
          別の端末でも同じ進行状況でプレイできます。
        </p>
        <div class="al-field">
          <label for="al-email">メールアドレス</label>
          <input type="email" id="al-email" class="al-input" autocomplete="email" placeholder="you@example.com">
        </div>
        <div class="al-field">
          <label for="al-password">パスワード（6 文字以上）</label>
          <input type="password" id="al-password" class="al-input" autocomplete="new-password" minlength="6" maxlength="100">
        </div>
        <div class="al-field">
          <label for="al-password2">パスワード（確認）</label>
          <input type="password" id="al-password2" class="al-input" autocomplete="new-password">
        </div>
        <div class="al-error" id="al-error"></div>
        <div class="al-buttons">
          <button class="al-btn al-btn-cancel" id="al-cancel">キャンセル</button>
          <button class="al-btn al-btn-ok" id="al-ok">連携する</button>
        </div>
        <p class="al-note">
          <small>※ パスワードを忘れた場合、登録メールに再設定リンクを送れます</small>
        </p>
      </div>
    `;
    container.appendChild(this.el);

    const email = this.el.querySelector('#al-email');
    const pw1 = this.el.querySelector('#al-password');
    const pw2 = this.el.querySelector('#al-password2');
    const errorEl = this.el.querySelector('#al-error');
    const okBtn = this.el.querySelector('#al-ok');
    const cancelBtn = this.el.querySelector('#al-cancel');

    setTimeout(() => email.focus(), 50);

    const submit = async () => {
      errorEl.textContent = '';
      if (pw1.value !== pw2.value) {
        errorEl.textContent = 'パスワードが一致しません';
        return;
      }
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await PlayFabClient.addUsernamePassword(email.value, pw1.value);
        this._close();
        this.onDone(email.value.trim());
      } catch (e) {
        errorEl.textContent = (e.message || '連携に失敗しました').toString();
        okBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    };

    okBtn.addEventListener('click', submit);
    [email, pw1, pw2].forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    });
    const cancel = () => {
      this._close();
      this.onDone(null);
    };
    cancelBtn.addEventListener('click', cancel);

    // バックドロップクリックで閉じる
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) cancel();
    });

    // Esc で閉じる
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _close() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this.el && this.el.parentNode) this.el.remove();
  }
}
