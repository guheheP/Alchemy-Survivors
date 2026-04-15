/**
 * PWA ランタイムヘルパ
 *  - インストールプロンプトの捕捉 (beforeinstallprompt)
 *  - オンライン復帰時にクラウドセーブを再送
 *  - ランプレイ中のスクリーンロック抑止 (wakeLock)
 *  - Service Worker 更新通知 + 手動 / 自動リロード
 */

import { eventBus } from './EventBus.js';
// vite-plugin-pwa が提供する仮想モジュール。ビルド時に自動で差し替えられる。
import { registerSW } from 'virtual:pwa-register';

let deferredInstallPrompt = null;
let _updateSW = null;         // registerSW の戻り値。updateSW(true) で即適用してリロード
let _updateAvailable = false; // 新バージョンを検出済みかどうか

/** インストールプロンプトが利用可能かどうか (Android/Desktop Chrome) */
export function canPromptInstall() {
  return deferredInstallPrompt !== null;
}

/** インストールプロンプトを表示。ユーザーの選択結果 ('accepted'|'dismissed'|null) を返す */
export async function promptInstall() {
  if (!deferredInstallPrompt) return null;
  const p = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    p.prompt();
    const choice = await p.userChoice;
    return choice.outcome || null;
  } catch (e) {
    return null;
  }
}

/** iOS Safari の判定 (beforeinstallprompt 非対応 → 手動案内が必要) */
export function isIOSStandaloneCapable() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isStandalone = ('standalone' in navigator) && navigator.standalone;
  return isIOS && !isStandalone;
}

/** 現在スタンドアロン (ホーム画面から起動) で動いているか */
export function isRunningStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if ('standalone' in navigator && navigator.standalone) return true;
  return false;
}

/** PWA 関連イベントの初期化 (main.js から 1 回呼ぶ) */
export function initPwaRuntime({ getSaveSystem } = {}) {
  if (typeof window === 'undefined') return;

  // 1. インストール可否の検知
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    eventBus.emit('pwa:installAvailable');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    eventBus.emit('toast', { message: '📱 アプリとしてインストールされました', type: 'success' });
  });

  // 2. オンライン復帰時: クラウドセーブを即再送
  window.addEventListener('online', () => {
    const save = typeof getSaveSystem === 'function' ? getSaveSystem() : null;
    if (save && typeof save.flushCloudSaveNow === 'function') {
      save.flushCloudSaveNow().catch(() => { /* 失敗しても次契機に任せる */ });
    }
    eventBus.emit('toast', { message: '🌐 オンラインに復帰しました', type: 'default' });
  });

  window.addEventListener('offline', () => {
    eventBus.emit('toast', { message: '📴 オフラインモード（進捗はローカル保存）', type: 'warning' });
  });

  // 3. Service Worker 登録 + 更新検知
  try {
    _updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // 新バージョンが waiting 状態になった
        _updateAvailable = true;
        eventBus.emit('pwa:updateAvailable');
      },
      onOfflineReady() {
        eventBus.emit('toast', { message: '📦 オフラインでも遊べるようになりました', type: 'success' });
      },
      onRegistered(reg) {
        if (!reg) return;
        // 起動直後に一度明示チェック（ホーム画面から起動した直後のチェック）
        reg.update().catch(() => {});
        // 30分ごとにバックグラウンドでチェック
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
        // ウィンドウが前面に戻ったときもチェック（デスクトップPWAで長時間開きっぱなし対策）
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      },
      onRegisterError(err) {
        // 開発環境やブラウザ非対応で失敗しても致命的ではない
        if (typeof console !== 'undefined') console.warn('[PWA] SW register failed', err);
      },
    });
  } catch (e) {
    // SSR / virtual module 解決失敗などで例外 → 無視
  }
}

/** 新バージョンが利用可能か (UI側でバナー表示判定に使用) */
export function isPwaUpdateAvailable() {
  return _updateAvailable;
}

/**
 * 新バージョンを即適用してリロード。ユーザー操作で呼ぶ（ランプレイ中は呼ばない）。
 */
export function applyPwaUpdate() {
  if (typeof _updateSW === 'function') {
    _updateSW(true); // true = reload 付きで skipWaiting
  } else {
    window.location.reload();
  }
}

// ---------- WakeLock (プレイ中のみスクリーン点灯維持) ----------
let wakeLockSentinel = null;

export async function requestWakeLock() {
  if (wakeLockSentinel) return true;
  if (!('wakeLock' in navigator)) return false;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (e) {
    wakeLockSentinel = null;
    return false;
  }
}

export function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  try { wakeLockSentinel.release(); } catch (e) { /* ignore */ }
  wakeLockSentinel = null;
}

// visibility 復帰時に再取得 (ブラウザ仕様で非アクティブ時に自動解除される)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockSentinel === null) {
      // プレイ中フラグは main.js 側で別管理するため、ここでは自動再取得せず
      // 呼び出し側 (RunManager 等) が必要に応じて requestWakeLock() を呼ぶ
    }
  });
}
