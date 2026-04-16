/**
 * DamageNumberSystem — Canvas上のダメージフロート数字
 * オブジェクトプール方式（最大30個）
 */

import { eventBus } from '../core/EventBus.js';

const MAX_NUMBERS = 30;
const FLOAT_DURATION = 0.8;
const FLOAT_SPEED = 60; // px/sec upward
const COMBO_DURATION = 1.4;
const COMBO_FLOAT_SPEED = 35;
const COMBO_INITIAL_OFFSET = 60; // 敵中心からの初期オフセット (px)

export class DamageNumberSystem {
  constructor() {
    this.numbers = [];

    this._unsubs = [
      eventBus.on('enemy:damaged', ({ x, y, damage, isCrit, dotColor }) => {
        const color = dotColor || (isCrit ? '#f0c060' : '#fff');
        this._spawn(x, y, Math.floor(damage), color, isCrit);
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
      // 属性コンボ発動時のポップアップ (敵の十分上に表示、長く残る)
      eventBus.on('combo:fired', ({ combo, x, y }) => {
        this._spawnCombo(x, y, combo);
      }),
    ];
  }

  _spawn(x, y, text, color, isCrit) {
    // 満杯時は末尾と最古(index 0)を入れ替えて末尾を切り捨て(swap-pop) — shift()のO(n)回避
    if (this.numbers.length >= MAX_NUMBERS) {
      this.numbers[0] = this.numbers[this.numbers.length - 1];
      this.numbers.pop();
    }
    this.numbers.push({
      x,
      y: y - 10,
      text: String(text),
      color,
      isCrit,
      timer: FLOAT_DURATION,
      kind: 'damage',
    });
  }

  /** 属性コンボ専用ポップアップ */
  _spawnCombo(worldX, worldY, combo) {
    if (this.numbers.length >= MAX_NUMBERS) {
      this.numbers[0] = this.numbers[this.numbers.length - 1];
      this.numbers.pop();
    }
    this.numbers.push({
      x: worldX,
      y: worldY - COMBO_INITIAL_OFFSET,
      text: `${combo.icon} ${combo.displayName}`,
      color: combo.color || '#ff8',
      isCrit: false,
      timer: COMBO_DURATION,
      kind: 'combo',
    });
  }

  update(dt) {
    // 期限切れは swap-pop で削除（splice のO(n)シフトを避ける）
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.timer -= dt;
      const speed = n.kind === 'combo' ? COMBO_FLOAT_SPEED : FLOAT_SPEED;
      n.y -= speed * dt;
      if (n.timer <= 0) {
        const last = this.numbers.length - 1;
        if (i !== last) this.numbers[i] = this.numbers[last];
        this.numbers.pop();
      }
    }
  }

  render(ctx, camera) {
    for (const n of this.numbers) {
      const sx = camera.worldToScreenX(n.x);
      const sy = camera.worldToScreenY(n.y);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (n.kind === 'combo') {
        // コンボ演出: 大きく、アウトライン付き、弾け感
        const totalDuration = COMBO_DURATION;
        const t = 1 - (n.timer / totalDuration); // 0→1
        const alpha = n.timer < 0.3 ? (n.timer / 0.3) : 1;
        // 出現時ポップ (0〜0.15秒で120%→100%)
        const popPhase = Math.min(1, t / 0.1);
        const scale = 1 + (1 - popPhase) * 0.3;
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(22 * scale)}px monospace`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 14;
        ctx.strokeText(n.text, sx, sy);
        ctx.fillStyle = n.color;
        ctx.fillText(n.text, sx, sy);
      } else if (n.isCrit) {
        const alpha = Math.min(1, n.timer / (FLOAT_DURATION * 0.3));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = n.color;
        ctx.font = 'bold 18px monospace';
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 6;
        ctx.fillText(n.text, sx, sy);
      } else {
        const alpha = Math.min(1, n.timer / (FLOAT_DURATION * 0.3));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = n.color;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(n.text, sx, sy);
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this.numbers.length = 0;
  }
}
