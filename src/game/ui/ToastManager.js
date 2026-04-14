/**
 * ToastManager — 画面右下にスタック表示される通知システム
 */
import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { assetPath } from '../core/assetPath.js';
import { getQualityTier, createTraitBadgeHTML } from './UIHelpers.js';

const MAX_ITEM_ICONS = 5;

export class ToastManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);

    // 高頻度トーストの間引き用タイムスタンプ
    this._lastSoldToast = 0;
    this._lastCustomerToast = 0;
    this._soldBatch = { count: 0, totalPrice: 0, timer: null };

    // イベント購読（unsubscribe用に保持）
    this._unsubs = [];
    // item:sold は高頻度なのでバッチ化（2秒間の売上をまとめて表示）
    this._unsubs.push(eventBus.on('item:sold', (d) => {
      this._soldBatch.count++;
      this._soldBatch.totalPrice += d.price || d.item?.value || 0;
      if (!this._soldBatch.lastName) this._soldBatch.lastName = d.item?.name || 'アイテム';
      if (!this._soldBatch.timer) {
        this._soldBatch.timer = setTimeout(() => {
          const b = this._soldBatch;
          if (b.count === 1) {
            this.show(`${b.lastName} が ${b.totalPrice}G で売れました！`, 'gold');
          } else {
            this.show(`${b.count}個のアイテムが売れました！ (+${b.totalPrice}G)`, 'gold');
          }
          b.count = 0;
          b.totalPrice = 0;
          b.timer = null;
          b.lastName = null;
        }, 2000);
      }
    }));
    this._unsubs.push(eventBus.on('adventurer:return', (d) => this._showAdventurerReturn(d)));
    this._unsubs.push(eventBus.on('day:newDay',       (d) => this.show(`${d.day}日目 — 維持費 ${d.rent}G を支払いました`, 'default')));
    this._unsubs.push(eventBus.on('rank:up',          (d) => this.show(`🎉 ランクアップ！ ${d.rank}`, 'special')));
    this._unsubs.push(eventBus.on('recipe:unlocked',  (d) => {
      const count = d.count || 1;
      this.show(count > 1 ? `📜 新レシピ ${count}種 解放！` : `📜 新レシピ解放: ${d.name || ''}`, 'green');
    }));
    this._unsubs.push(eventBus.on('area:unlocked',    (d) => this.show(`🗺️ 新エリア解放: ${d.name}`, 'green')));
    // お客さんの来店通知はサイドビューキャンバスの吹き出しで表現するため廃止
    // this._unsubs.push(eventBus.on('customer:arrived', ...
    this._unsubs.push(eventBus.on('customer:left',    () => { /* 間引き: 帰宅通知は省略 */ }));
    this._unsubs.push(eventBus.on('customer:bought',  (d) => {
      // sold と統合済みなので bought は省略
    }));
    this._unsubs.push(eventBus.on('adventurer:levelUp', (d) => this.show(`⬆️ ${d.adventurer.name} が Lv.${d.adventurer.level} になった！`, 'special')));
    this._unsubs.push(eventBus.on('adventurer:joined',  (d) => this.show(`🆕 ${d.adventurer.name} が仲間に加わった！`, 'special')));
    this._unsubs.push(eventBus.on('event:triggered',    (d) => this.show(`${d.icon} ${d.name}：${d.description}`, 'special')));
  }

  /**
   * 冒険者帰還トースト — アイテムアイコン付き＋詳細ボタン
   */
  _showAdventurerReturn(d) {
    const items = d.items || [];
    const advName = d.adventurer?.name || '冒険者';
    const isSuccess = d.success !== false; // 後方互換

    const toast = document.createElement('div');
    toast.className = `toast toast-${isSuccess ? 'green' : 'red'}`;

    // テキスト部分
    const textEl = document.createElement('div');
    textEl.className = 'toast-text';
    if (isSuccess) {
      textEl.textContent = `✅ ${advName} が帰還！ ${items.length}個の素材を入手`;
    } else {
      textEl.textContent = `❌ ${advName} の探索失敗… 素材を入手できなかった`;
    }
    toast.appendChild(textEl);

    // アイコン行
    const iconsEl = document.createElement('div');
    iconsEl.className = 'toast-item-icons';

    const showCount = Math.min(items.length, MAX_ITEM_ICONS);
    for (let i = 0; i < showCount; i++) {
      const item = items[i];
      const bp = ItemBlueprints[item.blueprintId];
      const imagePath = bp?.image;

      const wrapper = document.createElement('div');
      wrapper.className = 'toast-item-icon';
      wrapper.title = item.name;

      if (imagePath) {
        const img = document.createElement('img');
        img.src = assetPath(imagePath);
        img.alt = item.name;
        img.loading = 'lazy';
        wrapper.appendChild(img);
      } else {
        wrapper.textContent = (item.name || '?')[0];
      }
      iconsEl.appendChild(wrapper);
    }

    // 省略表示
    if (items.length > MAX_ITEM_ICONS) {
      const more = document.createElement('div');
      more.className = 'toast-item-icon toast-item-more';
      more.textContent = `+${items.length - MAX_ITEM_ICONS}`;
      iconsEl.appendChild(more);
    }
    toast.appendChild(iconsEl);

    // 詳細ボタン（成功時かつアイテムあり）
    if (isSuccess && items.length > 0) {
      const detailBtn = document.createElement('button');
      detailBtn.className = 'toast-detail-btn';
      detailBtn.textContent = '📋 詳細';
      detailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showReturnDetailModal(d);
      });
      toast.appendChild(detailBtn);
    }

    this._present(toast);
  }

  /**
   * 帰還ドロップ詳細モーダル
   */
  _showReturnDetailModal(d) {
    const items = d.items || [];
    const advName = d.adventurer?.name || '冒険者';
    const successRate = d.successRate;

    const itemRows = items.map(item => {
      const tier = getQualityTier(item.quality);
      const traitBadges = (item.traits || []).map(t => createTraitBadgeHTML(t)).join('');
      return `
        <div class="return-item-row">
          <span class="return-item-emoji">📦</span>
          <span class="return-item-name">${item.name}</span>
          <span class="return-item-quality" style="color:${tier.color}">${tier.icon} Q${item.quality}</span>
          ${traitBadges ? `<div class="return-item-traits">${traitBadges}</div>` : ''}
        </div>
      `;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'item-detail-overlay';
    overlay.innerHTML = `
      <div class="item-detail-modal return-detail-modal">
        <button class="item-detail-close" id="return-modal-close">✕</button>
        <div class="return-modal-title">
          <span>✅ ${advName} が帰還</span>
          ${successRate != null ? `<span class="return-modal-rate">🎯 ${successRate}%</span>` : ''}
        </div>
        <div class="return-modal-items">${itemRows}</div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#return-modal-close').addEventListener('click', () => overlay.remove());
  }

  /**
   * プレーンテキストのトーストを表示
   * @param {string} message
   * @param {'default'|'gold'|'green'|'red'|'special'} type
   */
  show(message, type = 'default') {
    // 直近に同一メッセージが出ていれば、カウンタ付きで上書き（連続通知の洪水防止）
    const lastToast = this.container.lastElementChild;
    if (lastToast && lastToast.dataset.plainMessage === message && !lastToast.classList.contains('toast-hide')) {
      const count = Number(lastToast.dataset.repeatCount || '1') + 1;
      lastToast.dataset.repeatCount = String(count);
      lastToast.textContent = `${message} ×${count}`;
      // 再度表示時間を延長
      if (lastToast._hideTimer) clearTimeout(lastToast._hideTimer);
      lastToast._hideTimer = setTimeout(() => this._dismiss(lastToast), 5000);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.dataset.plainMessage = message;

    this._present(toast);
  }

  /**
   * HTMLエレメントを含むリッチなトーストを表示
   * @param {HTMLElement[]} elements
   * @param {'default'|'gold'|'green'|'red'|'special'} type
   */
  showHtml(elements, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    for (const el of elements) {
      toast.appendChild(el);
    }

    this._present(toast);
  }

  /** 内部: トーストをDOMに追加してアニメーション */
  _present(toast) {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.addEventListener('click', () => this._dismiss(toast));
    this.container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-show'));

    // 5秒後に自動消滅（アイコン付きは少し長めに表示）
    toast._hideTimer = setTimeout(() => this._dismiss(toast), 5000);

    // モバイルでは最大3件、デスクトップでは最大5件に制限
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const maxToasts = isMobile ? 3 : 5;
    while (this.container.children.length > maxToasts) {
      this._dismiss(this.container.firstChild);
    }
  }

  _dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    if (toast._hideTimer) { clearTimeout(toast._hideTimer); toast._hideTimer = null; }
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }

  dispose() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    if (this._soldBatch.timer) {
      clearTimeout(this._soldBatch.timer);
      this._soldBatch.timer = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
  }
}
