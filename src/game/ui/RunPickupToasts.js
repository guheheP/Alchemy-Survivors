/**
 * RunPickupToasts — ラン中の素材ドロップ獲得通知（画面右上にスタック）
 *
 * 既存の ToastManager (画面右下、UIイベント全般) とは独立。素材獲得は高頻度なので
 * 専用の小型トーストで:
 *   - 同一素材 (同じblueprintId/品質帯/特性) を ~1.2秒の窓でバッチ化 (×n 表記)
 *   - 品質ティアごとに枠線/グロー、特性付きで光彩アニメ
 *   - SE は 4段階 (通常 / 良〜優 / 極上＋特性 / 伝説以上)
 */
import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { assetPath } from '../core/assetPath.js';
import { SoundManager } from '../core/SoundManager.js';
import { getQualityTier } from './UIHelpers.js';

const MAX_TOASTS = 6;
const TOAST_LIFETIME_MS = 1800;
const BATCH_WINDOW_MS = 1200;

export class RunPickupToasts {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'run-pickup-toasts';
    this.container.className = 'run-pickup-toasts';
    document.body.appendChild(this.container);

    // バッチ追跡: 直近のトースト要素を blueprintId+tierCss+traitsKey で索引
    this._activeBatch = new Map();

    this._unsub = eventBus.on('material:collected', (data) => this._onMaterial(data));
  }

  _tierKey(quality) {
    const t = getQualityTier(quality);
    return t.css; // 同じティアは同じトーストにまとめる
  }

  _traitsKey(traits) {
    if (!traits || traits.length === 0) return '';
    return [...traits].sort().join(',');
  }

  _classifyForSe(quality, traits) {
    const hasTrait = traits && traits.length > 0;
    if (quality >= 101) return 'legendary';
    if (quality >= 81 || hasTrait) return 'special';
    if (quality >= 41) return 'rare';
    return 'common';
  }

  _onMaterial({ blueprintId, quality = 0, traits = [] }) {
    const tierCss = this._tierKey(quality);
    const traitsKey = this._traitsKey(traits);
    const batchKey = `${blueprintId}|${tierCss}|${traitsKey}`;

    // SEは初回のみ (バッチ加算では鳴らさず音量を抑える)
    const existing = this._activeBatch.get(batchKey);
    if (existing && existing.toast.parentNode) {
      existing.count++;
      this._updateBadge(existing.toast, existing.count);
      // 表示時間延長
      clearTimeout(existing.dismissTimer);
      existing.dismissTimer = setTimeout(() => this._dismiss(existing.toast, batchKey), TOAST_LIFETIME_MS);
      return;
    }

    // 新規トースト
    const tier = getQualityTier(quality);
    const bp = ItemBlueprints[blueprintId];
    const seClass = this._classifyForSe(quality, traits);
    this._playSe(seClass);

    const toast = this._buildToast(bp, blueprintId, quality, tier, traits, seClass);
    toast._batchKey = batchKey;
    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const entry = {
      toast,
      count: 1,
      dismissTimer: setTimeout(() => this._dismiss(toast, batchKey), TOAST_LIFETIME_MS),
    };
    this._activeBatch.set(batchKey, entry);

    // 上限超過の古いトーストを削除 (先頭が古い)。
    // _dismiss は setTimeout で遅延削除するため、この while ループ中に
    // 古い要素が DOM に残ったままで無限ループする致命的バグがあった。
    // → トリム時は即時削除し、大量同時ピックアップ時のフリーズを防ぐ。
    while (this.container.children.length > MAX_TOASTS) {
      const oldest = this.container.firstElementChild;
      if (!oldest) break;
      const k = oldest._batchKey;
      const entry = k ? this._activeBatch.get(k) : null;
      if (entry && entry.dismissTimer) clearTimeout(entry.dismissTimer);
      if (k) this._activeBatch.delete(k);
      oldest.remove();
    }
  }

  _buildToast(bp, blueprintId, quality, tier, traits, seClass) {
    const toast = document.createElement('div');
    toast.className = `pickup-toast pickup-tier-${tier.css}`;
    if (traits && traits.length > 0) toast.classList.add('has-trait');
    if (seClass === 'special') toast.classList.add('is-special');
    if (seClass === 'legendary') toast.classList.add('is-legendary');
    toast.style.setProperty('--tier-color', tier.color);
    toast._batchKey = null; // _onMaterial で記録

    // アイコン
    const iconWrap = document.createElement('div');
    iconWrap.className = 'pickup-icon';
    if (bp?.image) {
      const img = document.createElement('img');
      img.src = assetPath(bp.image);
      img.alt = bp.name || blueprintId;
      img.loading = 'lazy';
      img.onerror = () => { iconWrap.textContent = (bp?.name || '?')[0]; };
      iconWrap.appendChild(img);
    } else {
      iconWrap.textContent = (bp?.name || '?')[0];
    }
    toast.appendChild(iconWrap);

    // メイン情報
    const info = document.createElement('div');
    info.className = 'pickup-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'pickup-name-line';
    const name = document.createElement('span');
    name.className = 'pickup-name';
    name.textContent = bp?.name || blueprintId;
    nameLine.appendChild(name);

    const qBadge = document.createElement('span');
    qBadge.className = 'pickup-quality';
    qBadge.style.color = tier.color;
    qBadge.textContent = `${tier.icon}Q${quality}`;
    nameLine.appendChild(qBadge);

    info.appendChild(nameLine);

    // 特性
    if (traits && traits.length > 0) {
      const traitLine = document.createElement('div');
      traitLine.className = 'pickup-traits';
      for (const t of traits) {
        const def = TraitDefs[t];
        const rarity = def?.rarity || 'common';
        const tb = document.createElement('span');
        tb.className = `pickup-trait-badge trait-rarity-${rarity}`;
        tb.textContent = `✦${t}`;
        traitLine.appendChild(tb);
      }
      info.appendChild(traitLine);
    }

    toast.appendChild(info);

    // バッジ (×N) — 1回目は非表示
    const count = document.createElement('span');
    count.className = 'pickup-count hidden';
    count.textContent = '×1';
    toast.appendChild(count);

    return toast;
  }

  _updateBadge(toast, count) {
    const badge = toast.querySelector('.pickup-count');
    if (!badge) return;
    badge.textContent = `×${count}`;
    badge.classList.remove('hidden');
    // ぴょこっとアニメ
    badge.classList.remove('pop');
    void badge.offsetWidth;
    badge.classList.add('pop');
  }

  _playSe(seClass) {
    if (!SoundManager) return;
    if (seClass === 'legendary' && SoundManager.playMaterialPickupLegendary) {
      SoundManager.playMaterialPickupLegendary();
    } else if (seClass === 'special' && SoundManager.playMaterialPickupSpecial) {
      SoundManager.playMaterialPickupSpecial();
    } else if (seClass === 'rare' && SoundManager.playMaterialPickupRare) {
      SoundManager.playMaterialPickupRare();
    } else if (SoundManager.playMaterialPickup) {
      SoundManager.playMaterialPickup();
    }
  }

  _dismiss(toast, batchKey) {
    if (!toast || !toast.parentNode) return;
    if (batchKey) this._activeBatch.delete(batchKey);
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 260);
  }

  destroy() {
    if (this._unsub) this._unsub();
    for (const entry of this._activeBatch.values()) {
      if (entry.dismissTimer) clearTimeout(entry.dismissTimer);
    }
    this._activeBatch.clear();
    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
  }
}
