/**
 * ObjectPool — GC回避のための汎用オブジェクトプール
 */

export class ObjectPool {
  /**
   * @param {Function} factory - () => new Entity-like object
   * @param {number} initialSize - 初期確保数
   */
  constructor(factory, initialSize = 0) {
    this._factory = factory;
    this._pool = [];
    this._active = [];

    for (let i = 0; i < initialSize; i++) {
      const obj = this._factory();
      obj.active = false;
      this._pool.push(obj);
    }
  }

  /** プールからオブジェクトを取得（なければ新規作成） */
  get() {
    let obj;
    if (this._pool.length > 0) {
      obj = this._pool.pop();
    } else {
      obj = this._factory();
    }
    obj.active = true;
    this._active.push(obj);
    return obj;
  }

  /** オブジェクトをプールに返却 */
  release(obj) {
    obj.active = false;
    obj.reset();
    const idx = this._active.indexOf(obj);
    if (idx !== -1) {
      // swap-pop for O(1) removal
      const last = this._active.length - 1;
      if (idx !== last) this._active[idx] = this._active[last];
      this._active.pop();
    }
    this._pool.push(obj);
  }

  /** アクティブなオブジェクトのリスト */
  get activeList() { return this._active; }
  get activeCount() { return this._active.length; }
  get poolSize() { return this._pool.length; }

  /** 全アクティブオブジェクトを返却 */
  releaseAll() {
    while (this._active.length > 0) {
      const obj = this._active.pop();
      obj.active = false;
      obj.reset();
      this._pool.push(obj);
    }
  }
}
