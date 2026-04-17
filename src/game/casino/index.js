/**
 * casino/index.js — カジノ機能の唯一の公開エントリポイント
 *
 * 本体（main.js, HubManager.js, SaveSystem.js）はこのファイルからのみ import する。
 * カジノ機能を削除する場合、このファイル経由の依存を断てば src/game/casino/ を丸ごと削除可能。
 */

// カジノ専用CSSをbundleに含める（削除時はこの1行も消える）
import './casino.css';

export { CasinoManager } from './CasinoManager.js';
export { CASINO_ENABLED, CASINO_VISIBLE, CASINO_VERSION, isCasinoVisible } from './config.js';
