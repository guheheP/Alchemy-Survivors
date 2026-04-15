/**
 * ParticleSystem — オブジェクトプール方式のパーティクル基盤
 *
 * - burst: 放射状に飛び散る粒子（被弾・爆散）
 * - spark: 短命で収束する光（収集・ヒット）
 * - ambient: 長寿命の背景装飾（落ち葉・火の粉・泡など）
 * - trail: 軌跡（プレイヤー残像）
 */

import { ObjectPool } from '../ObjectPool.js';

class Particle {
  constructor() {
    this.active = false;
    this.reset();
  }
  reset() {
    this.active = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.gravity = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 2;
    this.color = '#fff';
    this.shape = 'circle'; // 'circle' | 'square' | 'triangle' | 'spark'
    this.fade = true;
    this.layer = 'foreground'; // 'ambient' | 'foreground'
    this.rotate = 0;
    this.rotateSpeed = 0;
    this.wave = 0; // sine wave horizontal drift amplitude (leaf falling)
    this.waveFreq = 0;
    this.wavePhase = 0;
  }
}

export class ParticleSystem {
  constructor(maxParticles = 500) {
    this.pool = new ObjectPool(() => new Particle(), Math.min(128, maxParticles));
    this.maxParticles = maxParticles;
  }

  /** 内部: プールから取得して初期化 */
  _spawn(config) {
    if (this.pool.activeCount >= this.maxParticles) return null;
    const p = this.pool.get();
    p.x = config.x || 0;
    p.y = config.y || 0;
    p.vx = config.vx || 0;
    p.vy = config.vy || 0;
    p.gravity = config.gravity || 0;
    p.maxLife = config.life || 0.5;
    p.life = p.maxLife;
    p.size = config.size || 2;
    p.color = config.color || '#fff';
    p.shape = config.shape || 'circle';
    p.fade = config.fade !== false;
    p.layer = config.layer || 'foreground';
    p.rotate = config.rotate || 0;
    p.rotateSpeed = config.rotateSpeed || 0;
    p.wave = config.wave || 0;
    p.waveFreq = config.waveFreq || 0;
    p.wavePhase = Math.random() * Math.PI * 2;
    return p;
  }

  /** 放射状バースト（ヒット・爆散用） */
  emitBurst(x, y, count, config = {}) {
    const baseSpeed = config.speed || 80;
    const life = config.life || 0.4;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = baseSpeed * (0.5 + Math.random() * 0.8);
      this._spawn({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: config.gravity || 0,
        life: life * (0.7 + Math.random() * 0.6),
        size: config.size || 3,
        color: config.color || '#fff',
        shape: config.shape || 'circle',
        layer: 'foreground',
      });
    }
  }

  /** 光のきらめき（ドロップ収集用） */
  emitSpark(x, y, color = '#ff8') {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this._spawn({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        gravity: 120,
        life: 0.4,
        size: 2,
        color,
        shape: 'spark',
        layer: 'foreground',
      });
    }
  }

  /** プレイヤー残像（低頻度で1粒ずつ） */
  emitTrail(x, y, color = '#4af') {
    this._spawn({
      x, y,
      vx: 0, vy: 0,
      life: 0.25,
      size: 5,
      color,
      shape: 'circle',
      layer: 'foreground',
    });
  }

  /** 環境パーティクル（背景装飾） */
  emitAmbient(x, y, config = {}) {
    this._spawn({
      x, y,
      vx: config.vx || 0,
      vy: config.vy || 0,
      gravity: config.gravity || 0,
      life: config.life || 10,
      size: config.size || 2,
      color: config.color || '#fff',
      shape: config.shape || 'circle',
      layer: 'ambient',
      wave: config.wave || 0,
      waveFreq: config.waveFreq || 0,
      rotate: Math.random() * Math.PI * 2,
      rotateSpeed: config.rotateSpeed || 0,
    });
  }

  update(dt, camera) {
    const cx = camera.x;
    const cy = camera.y;
    const cw = camera.width;
    const ch = camera.height;
    const cullMargin = 500;

    const list = this.pool.activeList;
    // 逆順: release の swap-pop で activeList が改変されるため
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.rotateSpeed) p.rotate += p.rotateSpeed * dt;
      if (p.wave && p.waveFreq) {
        p.x += Math.sin((p.maxLife - p.life) * p.waveFreq + p.wavePhase) * p.wave * dt;
      }
      // カメラから大きく外れたら破棄（アンビエント含む）
      if (
        p.x < cx - cullMargin || p.x > cx + cw + cullMargin ||
        p.y < cy - cullMargin || p.y > cy + ch + cullMargin
      ) {
        this.pool.release(p);
      }
    }
  }

  renderLayer(ctx, camera, layer = 'foreground') {
    ctx.save();
    const list = this.pool.activeList;
    let lastColor = null;
    const cw = camera.width, ch = camera.height;
    const cx = camera.x, cy = camera.y;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.layer !== layer) continue;
      const sx = p.x - cx;
      const sy = p.y - cy;
      if (sx < -20 || sx > cw + 20 || sy < -20 || sy > ch + 20) continue;

      const alpha = p.fade ? Math.min(1, p.life / p.maxLife) : 1;
      ctx.globalAlpha = alpha;
      // 同色連続時は fillStyle 書き換えを省略（set コストが地味に大きい）
      if (p.color !== lastColor) {
        ctx.fillStyle = p.color;
        lastColor = p.color;
      }

      switch (p.shape) {
        case 'square':
          if (p.rotate !== 0) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(p.rotate);
            ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
            ctx.restore();
          } else {
            ctx.fillRect(sx - p.size, sy - p.size, p.size * 2, p.size * 2);
          }
          break;
        case 'spark': {
          // shadowBlur はモバイル GPU で特に重い — save/restore でコストを閉じ込める
          ctx.save();
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          lastColor = null; // restore で fillStyle も戻るので再set必要
          break;
        }
        case 'triangle':
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rotate);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size, p.size);
          ctx.lineTo(-p.size, p.size);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        case 'circle':
        default:
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** アクティブパーティクル数 */
  get activeCount() { return this.pool.activeCount; }

  clear() {
    this.pool.releaseAll();
  }
}
