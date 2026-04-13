/**
 * DamageNumberSystem — Canvas上のダメージフロート数字
 * オブジェクトプール方式（最大30個）
 */

import { eventBus } from '../core/EventBus.js';

const MAX_NUMBERS = 30;
const FLOAT_DURATION = 0.8;
const FLOAT_SPEED = 60; // px/sec upward

export class DamageNumberSystem {
  constructor() {
    this.numbers = [];

    this._unsubs = [
      eventBus.on('enemy:damaged', ({ x, y, damage, isCrit }) => {
        this._spawn(x, y, Math.floor(damage), isCrit ? '#f0c060' : '#fff', isCrit);
      }),
      eventBus.on('player:damaged', ({ hp, maxHp, damage }) => {
        // Player damage shown at a fixed screen-relative position is handled by HUD flash;
        // We also emit a world-position number via a separate listener in RunManager
      }),
      eventBus.on('damageNumber:playerHit', ({ x, y, damage }) => {
        this._spawn(x, y, Math.floor(damage), '#f44', false);
      }),
      eventBus.on('damageNumber:heal', ({ x, y, value }) => {
        this._spawn(x, y, typeof value === 'string' ? value : `+${Math.floor(value)}`, '#4c4', false);
      }),
    ];
  }

  _spawn(x, y, text, color, isCrit) {
    if (this.numbers.length >= MAX_NUMBERS) {
      // Remove oldest
      this.numbers.shift();
    }
    this.numbers.push({
      x,
      y: y - 10,
      text: String(text),
      color,
      isCrit,
      timer: FLOAT_DURATION,
    });
  }

  update(dt) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.timer -= dt;
      n.y -= FLOAT_SPEED * dt;
      if (n.timer <= 0) {
        this.numbers.splice(i, 1);
      }
    }
  }

  render(ctx, camera) {
    for (const n of this.numbers) {
      const sx = camera.worldToScreenX(n.x);
      const sy = camera.worldToScreenY(n.y);
      const alpha = Math.min(1, n.timer / (FLOAT_DURATION * 0.3));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = n.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (n.isCrit) {
        ctx.font = 'bold 18px monospace';
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 6;
      } else {
        ctx.font = 'bold 13px monospace';
      }

      ctx.fillText(n.text, sx, sy);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this.numbers.length = 0;
  }
}
