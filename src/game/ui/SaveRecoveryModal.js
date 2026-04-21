/**
 * SaveRecoveryModal — セーブデータ不整合時のブロッキングモーダル
 *
 * 表示トリガー:
 *   - boot sync でcloudが「自分より新しいバージョン」→ 更新が必要
 *   - コンティニュー時に applySaveData が失敗 → 破損 or 将来version
 *   - cloud push 時に楽観ロック発動 → cloud側が新しいため上書き禁止
 *
 * 提供する操作:
 *   - 再読込（SW更新でアプリを最新化）
 *   - バックアップから復元（localStorage ring / cloud save_previous の中から選択）
 *   - 新規ゲームで開始（最終手段。確認ダイアログ付き）
 */

import { applyPwaUpdate } from '../core/pwaRuntime.js';

function _formatTimestamp(ts) {
  if (!ts || Number.isNaN(ts)) return '不明';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function _payloadSummary(payload) {
  if (!payload) return '—';
  const v = payload.version ?? '?';
  const gold = payload.gold ?? 0;
  const runs = payload?.stats?.totalRuns ?? 0;
  const itemCount = Array.isArray(payload.items) ? payload.items.length : 0;
  return `v${v} · 💰${gold} · ラン${runs}回 · アイテム${itemCount}個`;
}

export class SaveRecoveryModal {
  /**
   * @param {HTMLElement} container
   * @param {{reason: 'future_version'|'corrupt'|'apply_failed'|'cloud_conflict', cloudVersion?: number, supportedVersion?: number, saveSystem: object, onResolved: (result: {action: 'restored'|'newgame', source?: string}) => void}} options
   */
  constructor(container, options) {
    this.container = container;
    this.options = options || {};
    this.saveSystem = options.saveSystem;
    this.onResolved = options.onResolved || (() => {});
    this._destroyed = false;
    this._cloudPrevious = null;

    this.el = document.createElement('div');
    this.el.className = 'modal-overlay save-recovery-modal';
    this.el.innerHTML = `<div class="modal-card save-recovery-card anim-fade-in"></div>`;
    this.cardEl = this.el.querySelector('.save-recovery-card');
    container.appendChild(this.el);

    this._showMain();

    // cloud 前世代の非同期ロード（復旧UIでのみ使用）
    this._loadCloudPrevious();
  }

  _showMain() {
    const reason = this.options.reason;
    let title = '⚠️ セーブデータを読み込めません';
    let desc = '';
    switch (reason) {
      case 'future_version':
        title = '🆕 アプリの更新が必要です';
        desc = `より新しいバージョン（v${this.options.cloudVersion ?? '?'}）で作成されたセーブデータが見つかりました。<br>
          データを保護するため、クラウドへの保存を停止しています。<br>
          アプリを最新版に更新してからコンティニューしてください。`;
        break;
      case 'cloud_conflict':
        title = '⚠️ 別端末で新しい進捗が検出されました';
        desc = `クラウド側により新しいセーブデータがあり、上書き保存を停止しました。<br>
          別の端末で遊んだ進捗を引き継ぐには、アプリを再読込してください。`;
        break;
      case 'corrupt':
        title = '⚠️ セーブデータが破損している可能性があります';
        desc = 'セーブデータの読み込みに失敗しました。バックアップから復元するか、新規ゲームで開始してください。';
        break;
      case 'apply_failed':
      default:
        title = '⚠️ セーブデータを読み込めませんでした';
        desc = 'データ形式が不正か、現在のバージョンではサポートされていない可能性があります。';
        break;
    }

    const canReload = reason === 'future_version' || reason === 'cloud_conflict';

    this.cardEl.innerHTML = `
      <h3>${title}</h3>
      <p class="srm-desc">${desc}</p>
      <div class="srm-actions">
        ${canReload ? `<button class="srm-btn srm-btn-primary" id="srm-reload">🔄 アプリを再読込（更新取得）</button>` : ''}
        <button class="srm-btn srm-btn-secondary" id="srm-restore">📦 バックアップから復元</button>
        <button class="srm-btn srm-btn-danger" id="srm-newgame">🆕 新規ゲームで開始</button>
      </div>
      <p class="srm-note">
        ※「新規ゲームで開始」を選ぶと現在のセーブデータは失われます。
        ${canReload ? '更新を試してから選択することを推奨します。' : ''}
      </p>
    `;

    const reloadBtn = this.cardEl.querySelector('#srm-reload');
    if (reloadBtn) reloadBtn.addEventListener('click', () => applyPwaUpdate());
    this.cardEl.querySelector('#srm-restore').addEventListener('click', () => this._showBackupPicker());
    this.cardEl.querySelector('#srm-newgame').addEventListener('click', () => this._showNewGameConfirm());
  }

  async _loadCloudPrevious() {
    if (!this.saveSystem || typeof this.saveSystem.loadCloudPrevious !== 'function') return;
    try {
      const prev = await this.saveSystem.loadCloudPrevious();
      this._cloudPrevious = prev || null;
    } catch (e) {
      this._cloudPrevious = null;
    }
  }

  _showBackupPicker() {
    const localBackups = (this.saveSystem && typeof this.saveSystem.listLocalBackups === 'function')
      ? this.saveSystem.listLocalBackups()
      : [];
    const current = (this.saveSystem && typeof this.saveSystem.load === 'function')
      ? this.saveSystem.load()
      : null;
    const cloudPrev = this._cloudPrevious;

    const candidates = [];
    if (current) {
      candidates.push({
        label: '現在のセーブ（上書き前）',
        summary: _payloadSummary(current),
        timestamp: current.timestamp || 0,
        data: current,
        tag: 'current',
      });
    }
    for (const b of localBackups) {
      candidates.push({
        label: `ローカルバックアップ (${b.source})`,
        summary: _payloadSummary(b.data),
        timestamp: b.timestamp,
        data: b.data,
        tag: `local_${b.slot}`,
      });
    }
    if (cloudPrev) {
      candidates.push({
        label: 'クラウド: 1つ前の保存',
        summary: _payloadSummary(cloudPrev),
        timestamp: cloudPrev.timestamp || 0,
        data: cloudPrev,
        tag: 'cloud_previous',
      });
    }

    // タイムスタンプ降順
    candidates.sort((a, b) => b.timestamp - a.timestamp);

    // future-version は復元しても読めないので候補から除外
    const SaveSystemClass = this.saveSystem ? this.saveSystem.constructor : null;
    const validCandidates = SaveSystemClass && typeof SaveSystemClass.classifyVersion === 'function'
      ? candidates.filter(c => {
          const status = SaveSystemClass.classifyVersion(c.data);
          return status === 'current' || status === 'migratable';
        })
      : candidates;

    if (validCandidates.length === 0) {
      this.cardEl.innerHTML = `
        <h3>📦 復元可能なバックアップがありません</h3>
        <p class="srm-desc">このクライアントで読み込めるバックアップが見つかりませんでした。</p>
        <div class="srm-actions">
          <button class="srm-btn srm-btn-secondary" id="srm-back">← 戻る</button>
        </div>
      `;
      this.cardEl.querySelector('#srm-back').addEventListener('click', () => this._showMain());
      return;
    }

    const listHtml = validCandidates.map((c, idx) => `
      <li class="srm-backup-item">
        <div class="srm-backup-info">
          <div class="srm-backup-label">${c.label}</div>
          <div class="srm-backup-meta">${_formatTimestamp(c.timestamp)} · ${c.summary}</div>
        </div>
        <button class="srm-btn srm-btn-small srm-restore-pick" data-idx="${idx}">復元</button>
      </li>
    `).join('');

    this.cardEl.innerHTML = `
      <h3>📦 バックアップから復元</h3>
      <p class="srm-desc">復元するバックアップを選択してください。選択したデータでゲームを続行します。</p>
      <ul class="srm-backup-list">${listHtml}</ul>
      <div class="srm-actions">
        <button class="srm-btn srm-btn-secondary" id="srm-back">← 戻る</button>
      </div>
    `;

    this.cardEl.querySelector('#srm-back').addEventListener('click', () => this._showMain());

    for (const btn of this.cardEl.querySelectorAll('.srm-restore-pick')) {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const chosen = validCandidates[idx];
        if (!chosen) return;
        btn.disabled = true;
        btn.textContent = '復元中…';
        const ok = await this.saveSystem.restoreFromPayload(chosen.data);
        if (ok) {
          this._close();
          this.onResolved({ action: 'restored', source: chosen.tag });
        } else {
          btn.disabled = false;
          btn.textContent = '復元に失敗';
        }
      });
    }
  }

  _showNewGameConfirm() {
    this.cardEl.innerHTML = `
      <h3>🆕 新規ゲームで開始しますか？</h3>
      <p class="srm-desc">
        現在のセーブデータは完全に削除され、復元できなくなります。<br>
        この操作は取り消せません。本当に実行しますか？
      </p>
      <div class="srm-actions">
        <button class="srm-btn srm-btn-secondary" id="srm-cancel">キャンセル</button>
        <button class="srm-btn srm-btn-danger" id="srm-confirm-newgame">削除して新規開始</button>
      </div>
    `;
    this.cardEl.querySelector('#srm-cancel').addEventListener('click', () => this._showMain());
    this.cardEl.querySelector('#srm-confirm-newgame').addEventListener('click', () => {
      // 全バックアップも含めて削除
      try {
        localStorage.removeItem('alchemy_survivors_save_v1');
        for (let i = 0; i < 10; i++) {
          localStorage.removeItem(`alchemy_survivors_save_ring_${i}`);
        }
      } catch (e) { /* ignore */ }
      // 書込ロックも解除して新規ゲームに進めるようにする
      if (this.saveSystem) {
        this.saveSystem._writeLocked = false;
        this.saveSystem._writeLockReason = null;
      }
      this._close();
      this.onResolved({ action: 'newgame' });
    });
  }

  _close() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.el.remove();
  }

  destroy() { this._close(); }
}
