/**
 * BackgroundRenderer — エリア別背景の描画
 *
 * - グラデーション背景
 * - タイルパターン（オフスクリーンキャンバスで1回生成しパターン化）
 * - スクロールグリッド線
 * - 環境パーティクルスポーン（ParticleSystem へ委譲）
 */

import { AreaThemes, DefaultTheme } from '../data/areaThemes.js';

export class BackgroundRenderer {
  /**
   * @param {string} areaId - エリアID ('plains'/'cave'/...)
   * @param {ParticleSystem} particles - パーティクルシステム
   */
  constructor(areaId, particles = null) {
    this.areaId = areaId;
    this.theme = AreaThemes[areaId] || DefaultTheme;
    this.particles = particles;
    this._tilePattern = null;
    this._gradientCache = null;
    this._lastW = 0; this._lastH = 0;
    this._ambientTimer = 0;
  }

  /** 初期化時に一度呼ぶ（既存のパーティクルをまき散らす） */
  seedAmbientParticles(camera) {
    if (!this.particles || !this.theme.ambient) return;
    const a = this.theme.ambient;
    const count = Math.floor(a.count);
    for (let i = 0; i < count; i++) {
      this._spawnOne(camera, true);
    }
  }

  _spawnOne(camera, randomPosition = false) {
    if (!this.particles || !this.theme.ambient) return;
    const a = this.theme.ambient;
    const margin = 100;
    let x, y;
    if (randomPosition) {
      // 画面内ランダム
      x = camera.x + Math.random() * camera.width;
      y = camera.y + Math.random() * camera.height;
    } else {
      // 画面端から入るようにスポーン（速度方向に基づく）
      const sx = a.speedX || 0;
      const sy = a.speedY || 0;
      if (Math.abs(sx) >= Math.abs(sy)) {
        // 横方向に流れる → 左右から入る
        x = sx >= 0 ? camera.x - margin : camera.x + camera.width + margin;
        y = camera.y + Math.random() * camera.height;
      } else {
        // 縦方向に流れる → 上下から入る
        x = camera.x + Math.random() * camera.width;
        y = sy >= 0 ? camera.y - margin : camera.y + camera.height + margin;
      }
    }
    this.particles.emitAmbient(x, y, {
      vx: (a.speedX || 0) * (0.8 + Math.random() * 0.4),
      vy: (a.speedY || 0) * (0.8 + Math.random() * 0.4),
      gravity: a.gravity || 0,
      life: (a.life || 10) * (0.7 + Math.random() * 0.6),
      size: a.size || 2,
      color: a.color || '#fff',
      shape: a.shape || 'circle',
      wave: a.wave || 0,
      waveFreq: a.waveFreq || 0,
      rotateSpeed: (a.rotateSpeed || 0) * (Math.random() < 0.5 ? 1 : -1),
    });
  }

  /** アンビエント粒子のスポーン維持（update で呼ぶ） */
  update(dt, camera) {
    if (!this.particles || !this.theme.ambient) return;
    this._ambientTimer += dt;
    // 寿命と数から逆算し、一定レートで補充
    const a = this.theme.ambient;
    const targetCount = a.count;
    const rate = targetCount / (a.life || 10); // particles/sec
    const interval = 1 / rate;
    while (this._ambientTimer >= interval) {
      this._ambientTimer -= interval;
      this._spawnOne(camera, false);
    }
  }

  /** タイルパターン（一度だけ生成）をキャッシュから返す */
  _getTilePattern(ctx) {
    if (this._tilePattern) return this._tilePattern;
    const size = 64;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const tctx = cv.getContext('2d');
    tctx.fillStyle = 'rgba(0,0,0,0)';
    tctx.fillRect(0, 0, size, size);

    // タイル内の小さなアクセント（エリアの雰囲気を出す）
    const accent = this.theme.tileAccent || 'rgba(255,255,255,0.03)';
    tctx.fillStyle = accent;
    // エリアによって異なるパターン
    switch (this.areaId) {
      case 'plains':
      case 'forest':
        // 草の束っぽい点
        for (let i = 0; i < 3; i++) {
          const x = 10 + Math.random() * 44;
          const y = 10 + Math.random() * 44;
          tctx.fillRect(x, y, 2, 3);
        }
        break;
      case 'cave':
      case 'dragon_nest':
        // 岩石のひび
        tctx.strokeStyle = accent;
        tctx.lineWidth = 1;
        tctx.beginPath();
        tctx.moveTo(8, 20); tctx.lineTo(20, 30); tctx.lineTo(15, 45);
        tctx.stroke();
        break;
      case 'volcano':
        // 溶岩の粒
        for (let i = 0; i < 4; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          tctx.fillRect(x, y, 2, 2);
        }
        break;
      case 'deep_sea':
        // 波紋
        tctx.strokeStyle = accent;
        tctx.lineWidth = 0.8;
        tctx.beginPath();
        tctx.arc(32, 32, 10, 0, Math.PI * 2);
        tctx.stroke();
        break;
      case 'sky_tower':
        // 雲の層
        tctx.fillRect(8, 28, 16, 3);
        tctx.fillRect(32, 40, 18, 3);
        break;
      case 'time_corridor':
        // 光点
        for (let i = 0; i < 5; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          tctx.fillRect(x, y, 1, 1);
        }
        break;
      default:
        break;
    }

    this._tilePattern = ctx.createPattern(cv, 'repeat');
    return this._tilePattern;
  }

  render(ctx, camera) {
    const w = camera.width;
    const h = camera.height;

    // グラデーション背景（サイズが変わったらキャッシュ破棄）
    if (!this._gradientCache || this._lastW !== w || this._lastH !== h) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      const [top, bot] = this.theme.gradient || [this.theme.baseColor, this.theme.baseColor];
      grad.addColorStop(0, top);
      grad.addColorStop(1, bot);
      this._gradientCache = grad;
      this._lastW = w;
      this._lastH = h;
    }
    ctx.fillStyle = this._gradientCache;
    ctx.fillRect(0, 0, w, h);

    // タイルパターン（カメラに追従してスクロール）
    const pattern = this._getTilePattern(ctx);
    if (pattern) {
      ctx.save();
      const offX = -(camera.x % 64);
      const offY = -(camera.y % 64);
      ctx.translate(offX, offY);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w + 64, h + 64);
      ctx.restore();
    }

    // グリッド線
    this._drawGrid(ctx, camera);
  }

  _drawGrid(ctx, camera) {
    const gridSize = 100;
    ctx.strokeStyle = this.theme.tileColor || 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    ctx.beginPath();
    for (let gx = startX; gx < camera.x + camera.width + gridSize; gx += gridSize) {
      const sx = gx - camera.x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, camera.height);
    }
    for (let gy = startY; gy < camera.y + camera.height + gridSize; gy += gridSize) {
      const sy = gy - camera.y;
      ctx.moveTo(0, sy);
      ctx.lineTo(camera.width, sy);
    }
    ctx.stroke();
  }
}
