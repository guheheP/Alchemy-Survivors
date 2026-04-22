/**
 * RtmPixelArtDisplay.js — Road to Millionaire 上部大型液晶
 *
 * 240x140 の低解像度canvasを10fpsで描画、CSSで拡大してピクセル感を保つ。
 * 既存の slot/PixelArtDisplay.js は継承不能 (寸法定数がモジュールレベル) のため、
 * パーティクル/イベント基盤のみ同様のパターンで再実装した独立クラス。
 *
 * 2層構造:
 *   - モード層 (setMode): 長期の状態別シーン (normal/at_standby/at/tenjou)
 *   - イベント層 (triggerEvent): 短期演出 (god_arrival/stock_plus/... /digit_*)
 *
 * 数字演出: 右上に 3桁の7セグ風デジット。ミリオンゴッド風示唆 (777/888/999 等)。
 */

const PIXEL_W = 240;
const PIXEL_H = 140;
const FPS = 10;
const FRAME_MS = 1000 / FPS;

/** イベント種別別の既定durationMS */
const EVENT_DURATION = {
  rare_reaction:    600,
  mode_hint:        900,
  god_arrival:     2500,
  stock_plus:       900,
  battle_continue: 1200,
  at_summary:      3500,
  tenjou_warning:  1500,
  tenjou_rescue:   2000,
  digit_roll:      1400,
  digit_preset:    1200,
  digit_countdown:  800,
};

/** 優先度数値 (高いほど優先) */
const PRIORITY = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * 7セグ0-9マスク (bitmask for segments a..g)
 *   a=0x40 b=0x20 c=0x10 d=0x08 e=0x04 f=0x02 g=0x01
 */
const SEG_MASKS = {
  '0': 0x7E, '1': 0x30, '2': 0x6D, '3': 0x79, '4': 0x33,
  '5': 0x5B, '6': 0x5F, '7': 0x70, '8': 0x7F, '9': 0x7B,
  ' ': 0x00, '-': 0x01,
};

export class RtmPixelArtDisplay {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PIXEL_W;
    this.canvas.height = PIXEL_H;
    this.canvas.className = 'casino-rtm-pixel-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    /** @type {'normal'|'at_standby'|'at'|'tenjou'} */
    this.mode = 'normal';
    this.frame = 0;
    this._running = false;
    this._timer = 0;

    /** 演出表示用のセッション状態 (RoadToMillionaireScreen から setStats で注入) */
    this.stats = {
      atRemaining: 0,
      atStocks: 0,
      atSetCount: 0,
      atGainTotal: 0,
      normalGameCount: 0,
      tenjouGames: 1500,
    };

    /** 現在点灯中の数字パネル (3桁) */
    this._digitDisplay = {
      values: ['-', '-', '-'],
      color: '#ff4040',
      brightness: 0.7,
      rolling: [false, false, false],
    };

    /** @type {Array<{type:string, opts:object, startFrame:number, startAt:number, duration:number, priority:number, resolve?:Function}>} */
    this._events = [];
    /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,maxLife:number,color:string,kind:string}>} */
    this._particles = [];
  }

  start() {
    if (this._running) return;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this.frame++;
      this._updateDigitsIdle();
      this._updateParticles();
      this._updateEvents();
      this.render();
      this._timer = setTimeout(tick, FRAME_MS);
    };
    tick();
  }

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
  }

  /**
   * @param {'normal'|'at_standby'|'at'|'tenjou'} mode
   */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.frame = 0;
  }

  setStats(stats) {
    if (!stats) return;
    Object.assign(this.stats, stats);
  }

  /**
   * 短期イベント発火
   * @param {string} type
   * @param {object} [opts]
   * @returns {Promise<void>}
   */
  triggerEvent(type, opts = {}) {
    const duration = EVENT_DURATION[type] || 800;
    const priority = PRIORITY[opts.priority] ?? PRIORITY.low;

    // 高優先度発火時: 低優先度の既存イベントをキャンセル
    if (priority >= PRIORITY.high) {
      this._events = this._events.filter(ev => {
        if (ev.priority < priority) {
          if (ev.resolve) ev.resolve();
          return false;
        }
        return true;
      });
    }

    return new Promise((resolve) => {
      this._events.push({
        type, opts, priority,
        startFrame: this.frame,
        startAt: Date.now(),
        duration, resolve,
      });
    });
  }

  cancelEvents() {
    for (const ev of this._events) {
      if (ev.resolve) ev.resolve();
    }
    this._events = [];
    this._particles = [];
  }

  isBusy() {
    return this._events.length > 0;
  }

  remainingMs() {
    if (this._events.length === 0) return 0;
    const now = Date.now();
    let maxRemaining = 0;
    for (const ev of this._events) {
      const elapsed = now - ev.startAt;
      const remaining = Math.max(0, ev.duration - elapsed);
      if (remaining > maxRemaining) maxRemaining = remaining;
    }
    return maxRemaining;
  }

  // ===== Digit Panel =====

  setDigits(values, color = '#ff4040', brightness = 1.0) {
    this._digitDisplay.values = values.slice(0, 3);
    while (this._digitDisplay.values.length < 3) this._digitDisplay.values.push(' ');
    this._digitDisplay.color = color;
    this._digitDisplay.brightness = brightness;
    this._digitDisplay.rolling = [false, false, false];
  }

  _updateDigitsIdle() {
    // 数字演出イベント中は干渉しない
    if (this._events.some(ev =>
      ev.type === 'digit_roll' || ev.type === 'digit_preset' || ev.type === 'digit_countdown'
    )) return;

    if (this.mode === 'at') {
      const rem = Math.min(999, Math.max(0, this.stats.atRemaining));
      this.setDigits(
        String(rem).padStart(3, '0').split(''),
        '#80ffc0', 1.0,
      );
      return;
    }
    if (this.mode === 'tenjou') {
      const blink = (this.frame % 4) < 2;
      this.setDigits(
        blink ? ['0', '0', '0'] : [' ', ' ', ' '],
        '#ff4040', blink ? 1.0 : 0.3,
      );
      return;
    }

    // 通常時: 低頻度ランダム変化 (30フレーム毎に1桁)
    if (this.frame % 30 === 0 && this.frame > 0) {
      const idx = Math.floor(Math.random() * 3);
      const newVal = Math.floor(Math.random() * 10);
      this._digitDisplay.values[idx] = String(newVal);
      this._digitDisplay.color = '#a04020';
      this._digitDisplay.brightness = 0.6;
    }
  }

  // ===== Particle System =====

  _spawnParticle(x, y, vx, vy, life, color, kind = 'spark') {
    this._particles.push({ x, y, vx, vy, life, maxLife: life, color, kind });
  }

  _spawnSparkleBurst(x, y, count = 6, color = '#ffe080') {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.8;
      this._spawnParticle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        8 + Math.floor(Math.random() * 5),
        color, 'spark',
      );
    }
  }

  _spawnCoinBurst(x, y, count = 4) {
    for (let i = 0; i < count; i++) {
      const vx = -1 + Math.random() * 2;
      const vy = -1.5 - Math.random() * 0.8;
      this._spawnParticle(x, y, vx, vy, 14, '#ffd040', 'coin');
    }
  }

  _updateParticles() {
    const PARTICLE_MAX = 120;
    if (this._particles.length > PARTICLE_MAX) {
      this._particles.length = PARTICLE_MAX;
    }
    const next = [];
    for (const p of this._particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.kind === 'coin') p.vy += 0.15;
      p.life--;
      if (p.life > 0 && p.x > -4 && p.x < PIXEL_W + 4 && p.y < PIXEL_H + 4) {
        next.push(p);
      }
    }
    this._particles = next;
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this._particles) {
      ctx.fillStyle = p.color;
      if (p.kind === 'coin') {
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
      } else if (p.kind === 'spark') {
        const t = p.life;
        if (t > 4) {
          ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
        } else if (t > 2) {
          ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y), 3, 1);
          ctx.fillRect(Math.floor(p.x), Math.floor(p.y) - 1, 1, 3);
        } else {
          ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
        }
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(200,200,220,${Math.min(1, p.life / p.maxLife * 0.8)})`;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
      } else if (p.kind === 'bolt') {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 3);
      }
    }
  }

  // ===== Event Lifecycle =====

  _updateEvents() {
    const alive = [];
    for (const ev of this._events) {
      const elapsed = (this.frame - ev.startFrame) * FRAME_MS;
      if (elapsed >= ev.duration) {
        if (ev.resolve) ev.resolve();
      } else {
        alive.push(ev);
      }
    }
    this._events = alive;
  }

  // ===== Main Render =====

  render() {
    this._drawBackground();
    this._drawScene();
    this._drawParticles();
    this._drawEvents();
    this._drawDigitPanel();
  }

  _drawBackground() {
    const ctx = this.ctx;
    const bg = this._bgPalette();
    const grad = ctx.createLinearGradient(0, 0, 0, PIXEL_H);
    grad.addColorStop(0, bg.top);
    grad.addColorStop(1, bg.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);

    if (this.mode === 'normal' || this.mode === 'tenjou') {
      ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
      const stars = [
        [14, 10], [38, 18], [68, 8], [96, 22], [130, 12], [160, 28],
        [190, 14], [220, 22], [28, 40], [82, 44], [118, 48], [172, 54],
      ];
      for (const [x, y] of stars) {
        if ((this.frame + x * 3 + y) % 28 < 20) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  _bgPalette() {
    switch (this.mode) {
      case 'at_standby': return { top: '#4a2800', bottom: '#8c5000' };
      case 'at':         return { top: '#2a0040', bottom: '#601080' };
      case 'tenjou':     return { top: '#1a0010', bottom: '#3a0018' };
      default:           return { top: '#0a0418', bottom: '#1a0828' };
    }
  }

  _drawScene() {
    switch (this.mode) {
      case 'at_standby': this._drawAtStandbyScene(); break;
      case 'at':         this._drawAtScene(); break;
      case 'tenjou':     this._drawTenjouScene(); break;
      default:           this._drawNormalScene();
    }
  }

  _drawNormalScene() {
    const t = this.frame;
    this._drawTemplePillar(18, 40, t);
    this._drawTemplePillar(PIXEL_W - 38, 40, t);
    this.ctx.fillStyle = '#2a1548';
    this.ctx.fillRect(0, PIXEL_H - 8, PIXEL_W, 8);
    this._drawGodTitle(PIXEL_W / 2, 72, false);
    this._drawText('ROAD TO MILLIONAIRE', PIXEL_W / 2 - 78, 110, '#806040', 10);
  }

  _drawAtStandbyScene() {
    const t = this.frame;
    const pulse = (t % 4) < 2 ? 0.3 : 0.1;
    this.ctx.fillStyle = `rgba(255, 220, 80, ${pulse})`;
    this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    this._drawText('GOD ARRIVAL', PIXEL_W / 2 - 54, 60, '#ffffff', 14);
  }

  _drawAtScene() {
    const t = this.frame;
    const ctx = this.ctx;
    // 斜めストライプ背景
    for (let i = 0; i < PIXEL_W + PIXEL_H; i += 10) {
      ctx.fillStyle = ((i + t) % 20 < 10) ? 'rgba(128, 64, 200, 0.15)' : 'rgba(64, 16, 100, 0.2)';
      ctx.fillRect(i - PIXEL_H, 0, 5, PIXEL_H);
    }
    this._drawGodSilhouette(PIXEL_W / 2 - 20, 30, t);
    this._drawText('MILLION AT', 14, 10, '#ffe080', 14);
    const gainStr = (this.stats.atGainTotal >= 0 ? '+' : '') + this.stats.atGainTotal;
    this._drawStatsPanel(10, 90, [
      { label: '残り', value: `${this.stats.atRemaining}G`, color: '#80ffc0' },
      { label: '純増', value: gainStr,                      color: '#ffe080' },
    ]);
    if (this.stats.atSetCount > 0) {
      this._drawText(`${this.stats.atSetCount}連`, PIXEL_W - 50, 40, '#ffa040', 14);
    }
    if (this.stats.atStocks > 0) {
      this._drawText(`ST:${this.stats.atStocks}`, PIXEL_W - 50, 58, '#ffe080', 10);
    }
  }

  _drawTenjouScene() {
    const t = this.frame;
    this._drawTemplePillar(18, 40, t, '#400418');
    this._drawTemplePillar(PIXEL_W - 38, 40, t, '#400418');
    this.ctx.fillStyle = '#200408';
    this.ctx.fillRect(0, PIXEL_H - 8, PIXEL_W, 8);
    const blink = (t % 6) < 3;
    this._drawText('神はまだ来ない', PIXEL_W / 2 - 48, 40, blink ? '#ff6080' : '#802040', 13);
    const ratio = Math.min(1, this.stats.normalGameCount / this.stats.tenjouGames);
    this._drawGauge(20, 80, PIXEL_W - 40, 8, ratio, '#ff4040', '#300408');
    this._drawText(`${this.stats.normalGameCount} / ${this.stats.tenjouGames}`, PIXEL_W / 2 - 34, 92, '#ff8080', 10);
  }

  // ---- イベント描画 ----

  _drawEvents() {
    const sorted = [...this._events].sort((a, b) => a.priority - b.priority);
    for (const ev of sorted) {
      const elapsed = (this.frame - ev.startFrame) * FRAME_MS;
      const progress = Math.min(1, elapsed / ev.duration);
      this._drawEvent(ev, progress);
    }
  }

  _drawEvent(ev, progress) {
    switch (ev.type) {
      case 'rare_reaction':   this._drawRareReaction(ev, progress); break;
      case 'mode_hint':       this._drawModeHint(ev, progress); break;
      case 'god_arrival':     this._drawGodArrival(ev, progress); break;
      case 'stock_plus':      this._drawStockPlus(ev, progress); break;
      case 'battle_continue': this._drawBattleContinue(ev, progress); break;
      case 'at_summary':      this._drawAtSummary(ev, progress); break;
      case 'tenjou_warning':  this._drawTenjouWarning(ev, progress); break;
      case 'tenjou_rescue':   this._drawTenjouRescue(ev, progress); break;
      case 'digit_roll':      this._drawDigitRoll(ev, progress); break;
      case 'digit_preset':    this._drawDigitPreset(ev, progress); break;
      case 'digit_countdown': this._drawDigitCountdown(ev, progress); break;
    }
  }

  _drawRareReaction(ev, progress) {
    const kind = ev.opts?.kind || 'cherry';
    const t = this.frame;
    const alpha = Math.sin(progress * Math.PI);
    if (kind === 'cherry') {
      this.ctx.fillStyle = `rgba(255, 120, 180, ${alpha * 0.35})`;
      this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
      if (t % 2 === 0) this._spawnSparkleBurst(40 + Math.random() * 160, 30 + Math.random() * 60, 3, '#ff80b0');
    } else if (kind === 'watermelon') {
      this.ctx.fillStyle = `rgba(120, 200, 120, ${alpha * 0.35})`;
      this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
      if (t % 2 === 0) this._spawnSparkleBurst(40 + Math.random() * 160, 30 + Math.random() * 60, 3, '#80e080');
    } else {
      this._drawThunderBolt(PIXEL_W / 2, 20, PIXEL_W / 2 + 30, 100, '#ffe080');
      if (t % 2 === 0) {
        this._spawnParticle(PIXEL_W / 2, 30 + Math.random() * 40, 0, 2, 6, '#ffe080', 'bolt');
      }
    }
  }

  _drawModeHint(ev, progress) {
    const level = ev.opts?.level || 1;
    const t = this.frame;
    const ctx = this.ctx;
    const lights = [[20, 45], [PIXEL_W - 32, 45], [10, 25]];
    for (let i = 0; i < Math.min(level, 3); i++) {
      const [x, y] = lights[i];
      const alpha = Math.sin(progress * Math.PI) * (0.8 - i * 0.2);
      ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
      ctx.fillRect(x, y, 12, 12);
    }
    if (t % 3 === 0 && level >= 2) {
      this._spawnSparkleBurst(PIXEL_W / 2, 60, 2, '#ffd040');
    }
  }

  _drawGodArrival(ev, progress) {
    const ctx = this.ctx;
    const t = this.frame;
    if (progress < 0.3) {
      const flash = (t % 2) === 0 ? 0.9 : 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${flash * (1 - progress / 0.3)})`;
      ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
      for (let i = 0; i < 3; i++) {
        const sx = 40 + i * 60;
        this._drawThunderBolt(sx, 0, sx + 10 * ((t + i) % 3 - 1), PIXEL_H, '#ffff80');
      }
    } else if (progress < 0.7) {
      const p = (progress - 0.3) / 0.4;
      const scale = 10 + p * 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
      const textColor = (t % 3 < 2) ? '#ffe040' : '#ffffff';
      this._drawText('GOD ARRIVAL', PIXEL_W / 2 - scale * 5.3, PIXEL_H / 2 - scale, textColor, Math.floor(scale * 1.6));
      if (t % 2 === 0) this._spawnSparkleBurst(PIXEL_W / 2, PIXEL_H / 2, 5, '#ffe040');
    } else {
      ctx.fillStyle = 'rgba(40, 10, 80, 0.6)';
      ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
      this._drawGodSilhouette(PIXEL_W / 2 - 20, 30, t, true);
      this._drawText('GOD ARRIVAL', PIXEL_W / 2 - 54, 108, '#ffffff', 14);
      if (t % 2 === 0) this._spawnSparkleBurst(PIXEL_W / 2, PIXEL_H / 2, 4, '#ffffff');
    }
  }

  _drawStockPlus(ev, progress) {
    const amount = ev.opts?.amount || 1;
    const bounce = Math.sin(progress * Math.PI) * 8;
    const y = 40 - bounce;
    this._drawText(`+${amount} STOCK`, PIXEL_W / 2 - 40, y, '#ffe040', 16);
    if (this.frame % 2 === 0) {
      this._spawnCoinBurst(PIXEL_W / 2, y + 10, 2);
    }
  }

  _drawBattleContinue(ev, progress) {
    const ctx = this.ctx;
    const t = this.frame;
    const x = -80 + progress * (PIXEL_W + 80);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 50, PIXEL_W, 40);
    this._drawText('NEXT BATTLE!', x, 58, (t % 2 === 0) ? '#ffe040' : '#ff8040', 16);
    const stocks = ev.opts?.stocksRemaining ?? 0;
    if (progress > 0.5) {
      this._drawText(`残ストック: ${stocks}`, PIXEL_W / 2 - 54, 78, '#ffffff', 11);
    }
  }

  _drawAtSummary(ev, progress) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, progress * 2)})`;
    ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    if (progress < 0.2) return;
    const p = (progress - 0.2) / 0.8;
    const gain = ev.opts?.totalGain ?? 0;
    const setCount = ev.opts?.setCount ?? 0;
    this._drawText('AT 終了', PIXEL_W / 2 - 30, 20, '#ff8040', 14);
    if (p > 0.1) {
      this._drawText(`獲得 ${gain} 枚`, PIXEL_W / 2 - 48, 50, '#ffe040', 16);
    }
    if (p > 0.4) {
      this._drawText(`${setCount} 連荘`, PIXEL_W / 2 - 36, 80, '#ffa040', 14);
    }
    if (p > 0.6 && this.frame % 3 === 0) {
      this._spawnSparkleBurst(PIXEL_W / 2, 60, 3, '#ffe080');
    }
  }

  _drawTenjouWarning(ev, progress) {
    const ctx = this.ctx;
    const alpha = Math.sin(progress * Math.PI);
    ctx.fillStyle = `rgba(180, 20, 40, ${alpha * 0.4})`;
    ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    this._drawText('神はまだ来ない...', PIXEL_W / 2 - 58, 60, '#ff6080', 14);
  }

  _drawTenjouRescue(ev, progress) {
    const ctx = this.ctx;
    if (progress < 0.5) {
      const flash = (this.frame % 2) === 0 ? 0.8 : 0.3;
      ctx.fillStyle = `rgba(255, 220, 80, ${flash})`;
      ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    } else {
      ctx.fillStyle = 'rgba(100, 40, 0, 0.6)';
      ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    }
    const color = (this.frame % 3 < 2) ? '#ffe040' : '#ffffff';
    this._drawText('強制降臨', PIXEL_W / 2 - 30, 55, color, 18);
    if (this.frame % 2 === 0) this._spawnSparkleBurst(PIXEL_W / 2, PIXEL_H / 2, 5, '#ffe040');
  }

  // ---- 数字演出 ----

  _drawDigitRoll(ev, progress) {
    const finalValues = ev.opts?.finalValues || ['-', '-', '-'];
    const color = ev.opts?.color || '#ff4040';
    const stopThresholds = [0.33, 0.66, 1.0];
    const values = ['0', '0', '0'];
    for (let i = 0; i < 3; i++) {
      if (progress < stopThresholds[i]) {
        values[i] = String((this.frame + i * 7) % 10);
      } else {
        values[i] = String(finalValues[i]);
      }
    }
    this._digitDisplay.values = values;
    this._digitDisplay.color = color;
    this._digitDisplay.brightness = 1.0;
  }

  _drawDigitPreset(ev, progress) {
    const values = ev.opts?.values || ['7', '7', '7'];
    const color = ev.opts?.color || '#ffe040';
    const flash = (this.frame % 3 < 2);
    this._digitDisplay.values = values.slice(0, 3);
    this._digitDisplay.color = flash ? color : '#806020';
    this._digitDisplay.brightness = 1.0;
  }

  _drawDigitCountdown(ev, progress) {
    const value = ev.opts?.value ?? 0;
    const str = String(Math.max(0, Math.min(999, value))).padStart(3, '0');
    this._digitDisplay.values = str.split('');
    this._digitDisplay.color = value <= 100 ? '#ff4040' : '#ff8040';
    this._digitDisplay.brightness = 1.0;
  }

  // ---- 数字パネル本体 (常時右上) ----

  _drawDigitPanel() {
    const ctx = this.ctx;
    const PANEL_X = PIXEL_W - 58;
    const PANEL_Y = 6;
    const PANEL_W = 52;
    const PANEL_H = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.strokeRect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1);

    const DIGIT_W = 9;
    const DIGIT_SPACE = 2;
    const startX = PANEL_X + 3;
    const digitY = PANEL_Y + 3;

    for (let i = 0; i < 3; i++) {
      const ch = this._digitDisplay.values[i] || ' ';
      const x = startX + i * (DIGIT_W + DIGIT_SPACE + 2);
      this._draw7SegDigit(x, digitY, ch, this._digitDisplay.color, this._digitDisplay.brightness);
    }
  }

  /**
   * 1桁の7セグ数字描画 (約9x13)
   */
  _draw7SegDigit(x, y, ch, color, brightness = 1.0) {
    const ctx = this.ctx;
    const mask = SEG_MASKS[ch] ?? 0;
    const W = 7;
    const H = 13;
    const M = y + Math.floor(H / 2);
    const B = y + H - 1;

    // 薄い背景 (消灯セグ)
    ctx.fillStyle = `rgba(80, 20, 20, ${0.3 * brightness})`;
    ctx.fillRect(x + 1, y, W - 2, 1);      // a
    ctx.fillRect(x + W - 1, y + 1, 1, 5);  // b
    ctx.fillRect(x + W - 1, M + 1, 1, 5);  // c
    ctx.fillRect(x + 1, B, W - 2, 1);      // d
    ctx.fillRect(x, M + 1, 1, 5);          // e
    ctx.fillRect(x, y + 1, 1, 5);          // f
    ctx.fillRect(x + 1, M, W - 2, 1);      // g

    // 点灯セグ
    ctx.fillStyle = this._dimColor(color, brightness);
    if (mask & 0x40) ctx.fillRect(x + 1, y,       W - 2, 1);
    if (mask & 0x20) ctx.fillRect(x + W - 1, y + 1, 1,    5);
    if (mask & 0x10) ctx.fillRect(x + W - 1, M + 1, 1,    5);
    if (mask & 0x08) ctx.fillRect(x + 1, B,       W - 2, 1);
    if (mask & 0x04) ctx.fillRect(x, M + 1,     1,    5);
    if (mask & 0x02) ctx.fillRect(x, y + 1,     1,    5);
    if (mask & 0x01) ctx.fillRect(x + 1, M,       W - 2, 1);
  }

  _dimColor(hex, brightness) {
    if (brightness >= 1.0) return hex;
    const b = Math.max(0, Math.min(1, brightness));
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const bb = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${bb}, ${b})`;
  }

  // ===== スプライト =====

  _drawTemplePillar(x, y, t, color = '#6040a0') {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 16, 60);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(x - 2, y, 20, 4);
    ctx.fillRect(x - 2, y + 56, 20, 4);
    ctx.fillStyle = `rgba(0, 0, 0, 0.3)`;
    ctx.fillRect(x + 5, y + 4, 1, 52);
    ctx.fillRect(x + 10, y + 4, 1, 52);
    if (t % 40 < 3) {
      ctx.fillStyle = 'rgba(255, 220, 120, 0.4)';
      ctx.fillRect(x - 2, y, 20, 4);
    }
  }

  _drawGodTitle(centerX, y, glow) {
    const ctx = this.ctx;
    const W = 100, H = 24;
    const x = centerX - W / 2;
    const grad = ctx.createLinearGradient(x, y, x, y + H);
    grad.addColorStop(0, '#2a0850');
    grad.addColorStop(1, '#6020a0');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    this._drawText('GOD', centerX - 14, y + 4, glow ? '#ffffff' : '#ffe040', 18);
  }

  _drawGodSilhouette(x, y, t, glow = false) {
    const ctx = this.ctx;
    if (glow) {
      for (let r = 24; r >= 4; r -= 4) {
        const alpha = (25 - r) / 50;
        ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
        ctx.fillRect(x - 2, y + 30 - r/2, 44, r);
      }
    }
    ctx.fillStyle = '#ffd040';
    ctx.fillRect(x + 14, y, 12, 10);
    ctx.fillStyle = '#ffe080';
    ctx.fillRect(x + 12, y - 4, 16, 4);
    ctx.fillRect(x + 10, y - 2, 20, 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 16, y + 4, 2, 2);
    ctx.fillRect(x + 22, y + 4, 2, 2);
    ctx.fillStyle = '#6040a0';
    ctx.fillRect(x + 10, y + 10, 20, 30);
    const armSway = (t >> 2) % 2;
    ctx.fillRect(x, y + 14 + armSway, 10, 4);
    ctx.fillRect(x + 30, y + 14 + armSway, 10, 4);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + 18, y + 16, 4, 4);
  }

  _drawThunderBolt(x1, y1, x2, y2, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 20;
    const my = (y1 + y2) / 2;
    ctx.lineTo(mx, my);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  _drawGauge(x, y, w, h, ratio, fillColor, bgColor) {
    const ctx = this.ctx;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, Math.floor(w * ratio), h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  _drawStatsPanel(x, y, rows) {
    const ctx = this.ctx;
    const W = 110, ROW_H = 14;
    const H = rows.length * ROW_H + 6;
    ctx.fillStyle = 'rgba(8, 8, 24, 0.78)';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    rows.forEach((row, i) => {
      const ry = y + 4 + i * ROW_H;
      this._drawText(row.label, x + 6, ry, '#c0a060', 10);
      const valW = this._textWidthApprox(row.value, 12);
      this._drawText(row.value, x + W - 6 - valW, ry - 1, row.color, 12);
    });
  }

  _textWidthApprox(text, size) {
    this.ctx.font = `bold ${size}px monospace`;
    return Math.ceil(this.ctx.measureText(text).width);
  }

  _drawText(text, x, y, color, size = 8) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(text, x - 1, y);
    ctx.fillText(text, x + 1, y);
    ctx.fillText(text, x, y - 1);
    ctx.fillText(text, x, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  destroy() {
    this.stop();
    this._events = [];
    this._particles = [];
    if (this.canvas?.parentElement) this.canvas.remove();
  }
}
