/**
 * EventBus — シンプルな Pub/Sub イベントシステム
 *
 * 使い方:
 *   import { eventBus } from './core/EventBus.js';
 *   eventBus.on('item:sold', (data) => { ... });      // 継続リスナー
 *   eventBus.once('rank:up', (data) => { ... });      // 一度だけ発火
 *   eventBus.emit('item:sold', { item, gold });
 *
 * イベント一覧:
 *   'item:sold'         — 商品が売れた { item, price }
 *   'adventurer:return' — 冒険者帰還 { adventurer, items, areaId }
 *   'inventory:changed' — 在庫変更
 *   'gold:changed'      — ゴールド変更 { gold }
 *   'day:newDay'        — 日替わり { day, rent }
 *   'rank:up'           — ランクアップ { rank, index }
 *   'game:over'         — ゲームオーバー { day, totalSales, rank, reason }
 *   'game:clear'        — ゲームクリア { day, totalSales, rank }
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this._depth = 0;
  }

  /**
   * イベントリスナーを登録
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} 登録解除用の関数
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // 登録解除用のコンビニエンス関数を返す
    return () => this.off(event, callback);
  }

  /**
   * 一度だけ発火するイベントリスナーを登録
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} 登録解除用の関数
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * イベントリスナーを解除
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  /**
   * イベントを発火
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set) return;

    // ネスト深度制限 — 無限ループによるスタックオーバーフロー防止
    this._depth++;
    if (this._depth > 30) {
      console.error(`[EventBus] Max emit depth (30) exceeded at "${event}" — breaking potential infinite loop`);
      this._depth--;
      return;
    }

    for (const cb of set) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }

    this._depth--;
  }
}

// シングルトンとしてエクスポート
export const eventBus = new EventBus();
