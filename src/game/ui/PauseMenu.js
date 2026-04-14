/**
 * PauseMenu — 戦闘中の一時停止メニュー（再開 / 撤退）
 * RunManager の pauseMenu:show / pauseMenu:hide イベントで開閉する
 */

import { eventBus } from '../core/EventBus.js';

export class PauseMenu {
  constructor(container, runManager) {
    this.container = container;
    this.runManager = runManager;
    this.el = document.createElement('div');
    this.el.className = 'pause-menu hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'pause-title');
    this.el.innerHTML = `
      <div class="pause-overlay"></div>
      <div class="pause-content">
        <h2 class="pause-title" id="pause-title">一時停止</h2>
        <p class="pause-sub">ESC または「再開」でゲームに戻ります</p>
        <div class="pause-actions">
          <button class="pause-btn pause-btn-resume" data-action="resume">▶ 再開 (ESC)</button>
          <button class="pause-btn pause-btn-retreat" data-action="retreat">🏳️ 撤退する</button>
        </div>
        <div class="pause-confirm hidden" data-confirm>
          <p>本当に撤退しますか？<br><span class="pause-confirm-note">獲得済みの素材・ゴールドはハブに持ち帰れます</span></p>
          <div class="pause-confirm-actions">
            <button class="pause-btn pause-btn-cancel" data-action="cancel">キャンセル</button>
            <button class="pause-btn pause-btn-retreat-yes" data-action="retreat-yes">撤退する</button>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'resume') this.runManager.togglePause();
      else if (action === 'retreat') this._showConfirm(true);
      else if (action === 'cancel') this._showConfirm(false);
      else if (action === 'retreat-yes') this.runManager.retreat();
    });

    this._unsubs = [
      eventBus.on('pauseMenu:show', () => this.show()),
      eventBus.on('pauseMenu:hide', () => this.hide()),
    ];
  }

  _showConfirm(visible) {
    const c = this.el.querySelector('[data-confirm]');
    c.classList.toggle('hidden', !visible);
    if (visible) {
      // 確認ダイアログではキャンセルボタンに初期フォーカス（安全側に倒す）
      const cancelBtn = c.querySelector('.pause-btn-cancel');
      if (cancelBtn) cancelBtn.focus();
    }
  }

  show() {
    this._showConfirm(false);
    this.el.classList.remove('hidden');
    // 初期フォーカスを「再開」ボタンへ（キーボード操作・スクリーンリーダー対応）
    const resumeBtn = this.el.querySelector('.pause-btn-resume');
    if (resumeBtn) resumeBtn.focus();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this.el.remove();
  }
}
