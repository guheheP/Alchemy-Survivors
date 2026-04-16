/**
 * LeaderboardScreen — 世界ランキング表示
 * PlayFab Statistics から TOP 100 + 自分の周辺を取得して表示
 */

import { PlayFabClient } from '../core/PlayFabClient.js';

const BOARDS = [
  { id: 'highest_damage', label: '最大ダメージ',   icon: '💥', formatter: formatInt },
  { id: 'total_kills',    label: '総討伐数',       icon: '⚔',  formatter: formatInt },
  { id: 'highest_level',  label: '最高レベル',     icon: '⭐', formatter: formatLevel },
  { id: 'total_gold',     label: '総ゴールド獲得', icon: '💰', formatter: formatGold },
];

function formatInt(v) {
  return (Number(v) || 0).toLocaleString();
}

function formatLevel(v) {
  return `Lv.${(Number(v) || 0).toLocaleString()}`;
}

function formatGold(v) {
  return `${(Number(v) || 0).toLocaleString()} G`;
}

/** HTML 特殊文字をエスケープ（DisplayName は他ユーザー入力なので XSS 対策） */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}

/** PlayFabId から簡易表示名を作る（XSS対策としてエスケープ済み文字列を返す） */
function playerLabel(entry) {
  if (entry.DisplayName) return escapeHtml(entry.DisplayName);
  const id = entry.PlayFabId || '';
  return `Player-${escapeHtml(id.slice(-6) || '??????')}`;
}

export class LeaderboardScreen {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'leaderboard-screen';
    this.activeBoard = BOARDS[0].id;
    this._cache = {}; // boardId -> { topList, aroundList, myId, fetchedAt }
    this._destroyed = false;
  }

  render() {
    const tabButtons = BOARDS.map(b => `
      <button class="lb-tab ${this.activeBoard === b.id ? 'active' : ''}" data-board="${b.id}">
        <span class="lb-tab-icon">${b.icon}</span>
        <span class="lb-tab-label">${b.label}</span>
      </button>
    `).join('');

    this.el.innerHTML = `
      <h3>🏆 世界ランキング</h3>
      <div class="lb-tabs">${tabButtons}</div>
      <div class="lb-content" id="lb-content">
        <div class="lb-loading">読み込み中…</div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.lb-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.activeBoard === btn.dataset.board) return;
        this.activeBoard = btn.dataset.board;
        this.el.querySelectorAll('.lb-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.board === this.activeBoard);
        });
        this._renderBoard();
      });
    });

    this._renderBoard();
    return this.el;
  }

  async _renderBoard() {
    const boardId = this.activeBoard;
    const board = BOARDS.find(b => b.id === boardId);
    if (!board) return;
    const content = this.el.querySelector('#lb-content');
    if (!content) return;

    if (!PlayFabClient.isAvailable()) {
      content.innerHTML = `<div class="lb-error">クラウド機能が無効です（オフライン or 設定未構成）。</div>`;
      return;
    }

    content.innerHTML = `<div class="lb-loading">読み込み中…</div>`;

    let top, around;
    try {
      [top, around] = await Promise.all([
        PlayFabClient.getLeaderboard(boardId, 100),
        PlayFabClient.getLeaderboardAroundPlayer(boardId, 11).catch(() => null),
      ]);
    } catch (e) {
      // 破棄済み or タブ変更後なら中断（Use-After-Free 防止）
      if (this._destroyed || this.activeBoard !== boardId) return;
      const errDiv = document.createElement('div');
      errDiv.className = 'lb-error';
      errDiv.textContent = 'ランキング取得に失敗しました。';
      const small = document.createElement('small');
      small.textContent = (e && e.message) ? e.message : String(e);
      errDiv.appendChild(document.createElement('br'));
      errDiv.appendChild(small);
      content.innerHTML = '';
      content.appendChild(errDiv);
      return;
    }

    // 非同期完了後に破棄/タブ切替されていたら書き込まない
    if (this._destroyed || this.activeBoard !== boardId) return;

    const myId = PlayFabClient.getPlayFabId();
    const topList = top?.Leaderboard || [];
    const aroundList = around?.Leaderboard || [];

    if (topList.length === 0) {
      content.innerHTML = `<div class="lb-empty">まだ記録がありません。最初のチャレンジャーになりましょう！</div>`;
      return;
    }

    // 自分が TOP 100 内にいるか
    const myInTop = topList.some(e => e.PlayFabId === myId);
    const needAround = !myInTop && aroundList.length > 0;

    const rowHtml = (entry, board) => {
      const isMe = entry.PlayFabId === myId;
      return `
        <div class="lb-row ${isMe ? 'me' : ''}">
          <span class="lb-rank">${entry.Position + 1}</span>
          <span class="lb-name">${playerLabel(entry)}${isMe ? ' <span class="lb-me-badge">YOU</span>' : ''}</span>
          <span class="lb-value">${board.formatter(entry.StatValue)}</span>
        </div>
      `;
    };

    content.innerHTML = `
      <div class="lb-header-row">
        <span class="lb-rank">順位</span>
        <span class="lb-name">プレイヤー</span>
        <span class="lb-value">${board.label}</span>
      </div>
      <div class="lb-top-list">
        ${topList.map(e => rowHtml(e, board)).join('')}
      </div>
      ${needAround ? `
        <div class="lb-divider">あなたの周辺</div>
        <div class="lb-around-list">
          ${aroundList.map(e => rowHtml(e, board)).join('')}
        </div>
      ` : ''}
      <div class="lb-footer">
        <small>あなたの ID: ${myId ? `Player-${escapeHtml(myId.slice(-6))}` : '未取得'}</small>
      </div>
    `;
  }

  destroy() {
    this._destroyed = true;
    this.el.remove();
  }
}
