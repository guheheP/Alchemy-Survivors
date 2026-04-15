/**
 * TitleScreen — タイトル画面
 */

import { assetPath } from '../core/assetPath.js';
import { PlayFabClient } from '../core/PlayFabClient.js';
import { AccountLoginModal } from './AccountLoginModal.js';

const SAVE_KEY = 'alchemy_survivors_save_v1';

function _formatLastPlayed(ts) {
  if (!ts || Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'さっき';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}日前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function _readSaveMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      lastSaved: data?.meta?.savedAt || data?.savedAt || data?.timestamp || null,
      runCount: data?.stats?.totalRuns || data?.totalRuns || null,
    };
  } catch {
    return { lastSaved: null, runCount: null };
  }
}

export class TitleScreen {
  constructor(container, onStart) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.id = 'title-screen';

    const saveMeta = _readSaveMeta();
    const hasSave = saveMeta !== null;
    const lastPlayed = saveMeta?.lastSaved ? _formatLastPlayed(saveMeta.lastSaved) : '';

    this.el.innerHTML = `
      <div class="title-content anim-fade-in">
        <img class="title-logo" src="${assetPath('/art/title.png')}" alt="Alchemy Survivors">
        <div class="title-buttons">
          <button class="title-btn ${hasSave ? 'title-btn-continue' : 'title-btn-primary'}" id="title-continue" ${hasSave ? '' : 'disabled'} aria-label="${hasSave ? '前回の続きからプレイ' : 'セーブデータなし'}">
            <span class="title-btn-icon">${hasSave ? '▶' : '—'}</span>
            <span class="title-btn-label">
              <span class="title-btn-main">${hasSave ? 'コンティニュー' : 'セーブデータなし'}</span>
              ${hasSave && lastPlayed ? `<span class="title-btn-sub">前回プレイ: ${lastPlayed}</span>` : ''}
            </span>
          </button>
          <button class="title-btn ${hasSave ? 'title-btn-secondary' : 'title-btn-primary'}" id="title-new-game" aria-label="新規ゲーム開始">
            <span class="title-btn-icon">✦</span>
            <span class="title-btn-label">
              <span class="title-btn-main">ニューゲーム</span>
              ${!hasSave ? '<span class="title-btn-sub">推奨</span>' : ''}
            </span>
          </button>
          ${PlayFabClient.isAvailable() ? `
          <button class="title-btn title-btn-tertiary" id="title-login" aria-label="既存アカウントでログイン">
            <span class="title-btn-icon">🔑</span>
            <span class="title-btn-label">
              <span class="title-btn-main">既存アカウントでログイン</span>
              <span class="title-btn-sub">別の端末で連携済みの方</span>
            </span>
          </button>
          ` : ''}
        </div>
      </div>
    `;
    container.appendChild(this.el);

    if (hasSave) {
      const continueBtn = this.el.querySelector('#title-continue');
      continueBtn.addEventListener('click', () => {
        this.hide();
        onStart('continue');
      });
    }

    this.el.querySelector('#title-new-game').addEventListener('click', () => {
      this.hide();
      onStart('new');
    });

    const loginBtn = this.el.querySelector('#title-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        new AccountLoginModal(document.body, (ok) => {
          // 成功時はページリロードされる
        });
      });
    }
  }

  hide() {
    this.el.classList.add('hidden');
  }

  show() {
    this.el.classList.remove('hidden');
  }

  destroy() {
    this.el.remove();
  }
}
