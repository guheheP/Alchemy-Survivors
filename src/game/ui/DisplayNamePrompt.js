/**
 * DisplayNamePrompt — 初回表示名入力モーダル
 * 入力/スキップどちらでも閉じられる。「今は設定しない」を選んだ場合はローカルフラグで再表示を抑制。
 */

import { PlayFabClient } from '../core/PlayFabClient.js';

const SKIP_FLAG_KEY = 'alchemy_survivors_display_name_prompted';

export function shouldPromptDisplayName() {
  if (!PlayFabClient.isAvailable()) return false;
  if (PlayFabClient.getDisplayName()) return false;
  try {
    return localStorage.getItem(SKIP_FLAG_KEY) !== '1';
  } catch (e) { return false; }
}

export function markDisplayNamePrompted() {
  try { localStorage.setItem(SKIP_FLAG_KEY, '1'); } catch (e) { /* ignore */ }
}

/**
 * @param {HTMLElement} container
 * @param {(name: string|null) => void} onDone - 入力完了 or スキップ時コールバック
 */
export class DisplayNamePrompt {
  constructor(container, onDone) {
    this.container = container;
    this.onDone = onDone || (() => {});
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay display-name-prompt';
    this.el.innerHTML = `
      <div class="modal-card anim-fade-in">
        <h3>🎮 プレイヤー名を設定</h3>
        <p class="dnp-desc">
          ランキングに表示される名前です。<br>
          3〜25 文字で入力してください。後からいつでも変更できます。
        </p>
        <input
          type="text"
          id="dnp-input"
          class="dnp-input"
          placeholder="例: Alchemist"
          maxlength="25"
          autocomplete="off"
        >
        <div class="dnp-error" id="dnp-error"></div>
        <div class="dnp-buttons">
          <button class="dnp-btn dnp-btn-skip" id="dnp-skip">今は設定しない</button>
          <button class="dnp-btn dnp-btn-ok" id="dnp-ok">決定</button>
        </div>
      </div>
    `;
    container.appendChild(this.el);

    const input = this.el.querySelector('#dnp-input');
    const errorEl = this.el.querySelector('#dnp-error');
    const okBtn = this.el.querySelector('#dnp-ok');
    const skipBtn = this.el.querySelector('#dnp-skip');

    setTimeout(() => input.focus(), 50);

    const submit = async () => {
      const name = input.value.trim();
      errorEl.textContent = '';
      if (name.length < 3 || name.length > 25) {
        errorEl.textContent = '3〜25 文字で入力してください';
        return;
      }
      okBtn.disabled = true;
      skipBtn.disabled = true;
      try {
        const accepted = await PlayFabClient.updateDisplayName(name);
        markDisplayNamePrompted();
        this._close();
        this.onDone(accepted);
      } catch (e) {
        errorEl.textContent = (e.message || '設定に失敗しました').toString();
        okBtn.disabled = false;
        skipBtn.disabled = false;
      }
    };

    okBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    skipBtn.addEventListener('click', () => {
      markDisplayNamePrompted();
      this._close();
      this.onDone(null);
    });
  }

  _close() {
    if (this.el && this.el.parentNode) this.el.remove();
  }
}
