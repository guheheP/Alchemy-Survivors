/**
 * GameLoop — 固定タイムステップ + 可変描画のゲームループ
 */

export class GameLoop {
  constructor(updateFn, renderFn) {
    this._update = updateFn;
    this._render = renderFn;
    this._rafId = null;
    this._lastTime = 0;
    this._accumulator = 0;
    this._running = false;
    this._paused = false;
    this.FIXED_DT = 1 / 60;
    this.MAX_FRAME_TIME = 0.1; // 100ms cap to avoid spiral of death
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  pause() { this._paused = true; }
  resume() {
    if (this._paused) {
      this._paused = false;
      this._lastTime = performance.now();
      this._accumulator = 0;
    }
  }

  get isPaused() { return this._paused; }
  get isRunning() { return this._running; }

  _loop(timestamp) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min((timestamp - this._lastTime) / 1000, this.MAX_FRAME_TIME);
    this._lastTime = timestamp;

    if (this._paused) return;

    this._accumulator += dt;

    while (this._accumulator >= this.FIXED_DT) {
      this._update(this.FIXED_DT);
      this._accumulator -= this.FIXED_DT;
    }

    const alpha = this._accumulator / this.FIXED_DT;
    this._render(alpha);
  }
}
