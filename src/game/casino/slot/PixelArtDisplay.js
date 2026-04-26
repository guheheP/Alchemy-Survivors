/**
 * PixelArtDisplay.js — ドット絵風の演出ディスプレイ
 *
 * 160x56px の低解像度Canvasに10fpsで描画、CSSで拡大してピクセル感を保つ。
 *
 * 2層構造:
 *   1. モード層 (setMode) — 長期の状態別シーン
 *   2. イベント層 (triggerEvent) — 短期の予告・当選・プレミア演出
 *      イベント層はモード層の上に重ねて描画、優先度あり
 *
 * パーティクルシステム — キラキラ、コイン、煙などの動く効果
 */

const PIXEL_W = 240;
const PIXEL_H = 84;
const FPS = 10;
const FRAME_MS = 1000 / FPS;

/**
 * イベント定義: type別のデフォルトduration(ms)
 */
const EVENT_DURATION = {
  koyaku_tease_weak:      400,
  koyaku_tease_strong:    600,
  chance_tease_normal:   1200,
  chance_tease_intense:  1500,
  premier_rainbow:       2000,
  win_burst:              700,
  gasuri_fail:            500,
  blue7_success:         1200,
  art_add:               1000,
  upsell:                 800,
  bonus_flash:            500,
  bonus_payout:           500,
};

export class PixelArtDisplay {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PIXEL_W;
    this.canvas.height = PIXEL_H;
    this.canvas.className = 'casino-slot-pixel-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    /** @type {string} */
    this.mode = 'normal';
    /** @type {'big'|'reg'|null} */
    this.bonusKind = null;
    this.frame = 0;
    this._running = false;
    this._timer = 0;

    /** 演出領域のステータス表示用（SlotScreenから setStats() で渡される） */
    this.stats = {
      bonusRemaining: 0,
      bonusGain: 0,
      artRemaining: 0,
      artGain: 0,
      /** 前兆残りG数 (ZENCHO中のみ) */
      zenchoRemaining: 0,
      /** 前兆突入時の総G数 (温度上昇の0..1正規化用) */
      zenchoTotal: 0,
      /** 前兆の本命当選種別 — 'bonus' | 'cz' | null (ガセ) */
      pendingResult: null,
      /** CZ前兆の演出ランク (1=静か / 2=中 / 3=激アツ)。突入時に決定。 */
      zenchoRank: 1,
    };

    /** @type {Array<{type:string, opts:object, startFrame:number, duration:number, resolve?:Function}>} */
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
   * @param {string} mode
   * @param {'big'|'reg'|null} [bonusKind]
   */
  setMode(mode, bonusKind) {
    if (mode === this.mode && bonusKind === this.bonusKind) return;
    this.mode = mode;
    this.bonusKind = bonusKind || null;
    this.frame = 0;
  }

  /**
   * 演出領域に表示するステータスを更新
   * @param {{ bonusRemaining?:number, bonusGain?:number, artRemaining?:number, artGain?:number,
   *          zenchoRemaining?:number, zenchoTotal?:number, pendingResult?:'bonus'|'cz'|null }} stats
   */
  setStats(stats) {
    if (!stats) return;
    if (typeof stats.bonusRemaining === 'number') this.stats.bonusRemaining = stats.bonusRemaining;
    if (typeof stats.bonusGain === 'number')      this.stats.bonusGain = stats.bonusGain;
    if (typeof stats.artRemaining === 'number')   this.stats.artRemaining = stats.artRemaining;
    if (typeof stats.artGain === 'number')        this.stats.artGain = stats.artGain;
    if (typeof stats.zenchoRemaining === 'number') this.stats.zenchoRemaining = stats.zenchoRemaining;
    if (typeof stats.zenchoTotal === 'number')     this.stats.zenchoTotal = stats.zenchoTotal;
    if (stats.pendingResult !== undefined)         this.stats.pendingResult = stats.pendingResult;
    if (typeof stats.zenchoRank === 'number')      this.stats.zenchoRank = stats.zenchoRank;
  }

  /**
   * 短期イベント発火
   * @param {string} type
   * @param {object} [opts]
   * @returns {Promise<void>} - 演出完了を待ちたい場合用
   */
  triggerEvent(type, opts = {}) {
    const duration = EVENT_DURATION[type] || 800;
    return new Promise((resolve) => {
      this._events.push({
        type,
        opts,
        startFrame: this.frame,
        startAt: Date.now(),
        duration,
        resolve,
      });
    });
  }

  /**
   * 現在再生中のイベントを全てキャンセル（次スピン強制等）
   */
  cancelEvents() {
    for (const ev of this._events) {
      if (ev.resolve) ev.resolve();
    }
    this._events = [];
    this._particles = [];
  }

  /** 現在イベント再生中か */
  isBusy() {
    return this._events.length > 0;
  }

  /** 残り演出時間(ms) — タブbackground時のsetTimeoutスロットルでも狂わないwall-clock基準 */
  remainingMs() {
    if (this._events.length === 0) return 0;
    const now = Date.now();
    let maxRemaining = 0;
    for (const ev of this._events) {
      const elapsed = ev.startAt != null ? now - ev.startAt : (this.frame - ev.startFrame) * FRAME_MS;
      const remaining = Math.max(0, ev.duration - elapsed);
      if (remaining > maxRemaining) maxRemaining = remaining;
    }
    return maxRemaining;
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
        color,
        'spark',
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
    const next = [];
    for (const p of this._particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.kind === 'coin') p.vy += 0.15; // 重力
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
        // コインは2x2の四角 + 光
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
      }
    }
  }

  // ===== Events =====

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

  // ===== Rendering =====

  render() {
    this._drawBackground();
    this._drawScene();
    this._drawParticles();
    this._drawEvents();
  }

  // ---- 背景 ----
  _drawBackground() {
    const ctx = this.ctx;
    const bg = this._bgPalette();
    const grad = ctx.createLinearGradient(0, 0, 0, PIXEL_H);
    grad.addColorStop(0, bg.top);
    grad.addColorStop(1, bg.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    // 星
    ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
    for (const [x, y] of [[8,8],[24,18],[48,6],[72,14],[108,22],[136,10],[150,30],[20,44],[60,36],[96,38]]) {
      if ((this.frame + x * 3 + y) % 22 < 15) ctx.fillRect(x, y, 1, 1);
    }
  }

  _bgPalette() {
    switch (this.mode) {
      case 'bonus':
        return this.bonusKind === 'reg'
          ? { top: '#001a30', bottom: '#003868' }
          : { top: '#3a0810', bottom: '#700818' };
      case 'bonus_standby': return { top: '#2a1800', bottom: '#3a2000' };
      case 'art':           return { top: '#1a0830', bottom: '#40107c' };
      case 'cz':            return { top: '#002018', bottom: '#004030' };
      case 'zencho':        return { top: '#2a0c00', bottom: '#3a2008' };
      case 'tenjou':        return { top: '#300408', bottom: '#540818' };
      default:              return { top: '#080c24', bottom: '#1a0e3c' };
    }
  }

  // ---- モード層シーン ----
  _drawScene() {
    switch (this.mode) {
      case 'normal':        this._drawNormal(); break;
      case 'zencho':        this._drawZencho(); break;
      case 'cz':            this._drawCz(); break;
      case 'bonus_standby': this._drawBonusStandby(); break;
      case 'bonus':         this._drawBonus(); break;
      case 'art':           this._drawArt(); break;
      case 'tenjou':        this._drawTenjou(); break;
      default:              this._drawNormal();
    }
  }

  _drawNormal() {
    const t = this.frame;
    // 工房の床
    this.ctx.fillStyle = '#201038';
    this.ctx.fillRect(0, PIXEL_H - 6, PIXEL_W, 6);

    // タイトルバー
    const titleY = 5;
    this.ctx.fillStyle = 'rgba(64, 24, 96, 0.6)';
    this.ctx.fillRect(0, 0, PIXEL_W, titleY + 16);
    this.ctx.fillStyle = '#f0c040';
    this.ctx.fillRect(0, titleY + 16, PIXEL_W, 1);
    // メインタイトル: 中央寄せ「賢者の石を求めて」
    const titleText = '賢者の石を求めて';
    const titleW = this._textWidthApprox(titleText, 14);
    this._drawText(titleText, Math.floor((PIXEL_W - titleW) / 2), titleY, '#ffe080', 14);

    // 左側: 錬金術師＋蒸留器のシーン
    this._drawAlchemist(28, 40, (t >> 3) % 2);
    this._drawFlask(60, 44, t);

    // 右側: モード表示「通常時」
    this._drawText('NORMAL', 140, 32, '#a890ff', 12);
    this._drawText('通常時', 152, 50, '#c0b0ff', 11);

    // 偶に泡パーティクル
    if (t % 20 === 0) {
      this._spawnParticle(65, 44, 0, -0.3, 12, '#80d0ff', 'smoke');
    }
  }

  _drawZencho() {
    const t = this.frame;
    const remaining = this.stats.zenchoRemaining || 1;
    const total = this.stats.zenchoTotal || 1;
    const pending = this.stats.pendingResult; // 'bonus' | 'cz' | null
    const rank = this.stats.zenchoRank || 1;
    const progress = 1 - remaining / Math.max(total, 1);  // 0..1

    // intensity 設計:
    //   BONUS前兆 : 演出絡めず固定 (-1=演出計算をスキップ)
    //   CZ前兆    : ランクで進行カーブが分岐 — 当選していても静か止まりがあり得る
    //   ガセ      : 上限0.5、熱い演出(0.7+)には届かない
    let intensity;
    if (pending === 'bonus') {
      // intensity演出はオフ。固定の弱フェイク演出のみ。
      intensity = -1;
    } else if (pending === 'cz') {
      if (rank === 1)      intensity = Math.min(0.30, progress * 0.35);
      else if (rank === 2) intensity = Math.min(0.55, progress * 0.65);
      else                 intensity = progress * 0.95 + 0.05;
    } else {
      // ガセ: ある程度上がるが0.5止まり
      intensity = Math.min(0.50, progress * 0.6);
    }

    // 錬金術師の揺れ — intensity > 0.6 でのみ (CZランク3終盤限定)
    const shake = intensity > 0.6 ? ((t % 2 === 0) ? 1 : -1) : 0;
    this._drawAlchemist(40 + shake, 34 - ((t >> 1) % 2), 'scared', t);
    this._drawFlask(100, 40, t);

    // 「!?」点滅 — 熱い時のみ赤・黄フラッシュ
    const alt = (t % 4) < 2;
    const exclColor = intensity > 0.7
      ? (alt ? '#ff4040' : '#ffe000')
      : (alt ? '#ffe040' : '#ff8010');
    this._drawText('!?', 46, 14, exclColor, 14);

    // キラキラ — BONUS前兆は固定3、それ以外はintensityで頻度
    let sparkleEvery;
    if (pending === 'bonus')         sparkleEvery = 3;
    else if (intensity > 0.7)        sparkleEvery = 2;
    else if (intensity > 0.3)        sparkleEvery = 3;
    else                             sparkleEvery = 5;
    if (t % sparkleEvery === 0) {
      this._spawnSparkleBurst(50 + (t % 60), 30 + ((t * 3) % 30), 2, '#ffc040');
    }
    if (t % (sparkleEvery + 1) === 0) {
      this._spawnSparkleBurst(140 + ((t * 5) % 50), 35 + ((t * 7) % 30), 2, '#ffd060');
    }

    // BIG7チラ見せ — 冒頭3Gは BONUS煽り風(高頻度)、それ以降は当選種別ごとに分岐
    const elapsedG = Math.max(0, total - remaining);
    const isOpeningBonusFake = elapsedG < 3;  // 冒頭3GはBONUSっぽく煽る
    let flashCycle, flashSpan;
    if (pending === 'bonus' || isOpeningBonusFake) {
      flashCycle = 12; flashSpan = 5;        // 高頻度 (BONUS風)
    } else if (pending === 'cz') {
      flashCycle = 32; flashSpan = 3;        // 中頻度
    } else {
      flashCycle = 48; flashSpan = 2;        // 低頻度
    }
    if ((t % flashCycle) < flashSpan) {
      const big7Color = (t % 2 === 0) ? 'red' : 'blue';
      this._drawBig7(190, 8, big7Color, t);
    }

    // 端フラッシュ (intensity > 0.85) — CZランク3終盤のみ
    if (intensity > 0.85 && (t % 3) === 0) {
      this.ctx.fillStyle = 'rgba(255,200,80,0.14)';
      this.ctx.fillRect(0, 0, PIXEL_W, 4);
      this.ctx.fillRect(0, PIXEL_H - 4, PIXEL_W, 4);
    }

    // 火の粉 (intensity > 0.7) — CZランク3終盤限定
    if (intensity > 0.7 && t % 4 === 0) {
      this._spawnParticle(110 + ((t * 11) % 20), 50, (Math.random() - 0.5) * 0.5, -1.2, 16, '#ff6040', 'spark');
    }
  }

  _drawCz() {
    const t = this.frame;
    this._drawMagicCircle(60, 42, t);
    // 錬金術師が円の中
    this._drawAlchemist(50, 34, 'excited', t);
    const flash = (t % 6) < 3;
    this._drawText('CHANCE', 124, 12, flash ? '#80ffd0' : '#40c0a0', 14);
    this._drawText('ZONE', 140, 30, flash ? '#80ffd0' : '#40c0a0', 14);
    this._drawText('全役で', 134, 52, '#c0ffe0', 10);
    this._drawText('突破抽選!', 130, 66, '#60f0a0', 10);
    // ルーンが浮遊
    if (t % 4 === 0) this._spawnSparkleBurst(60, 42, 3, '#80ffd0');
  }

  _drawBonusStandby() {
    const t = this.frame;
    const kind = this.bonusKind === 'reg' ? 'REG' : 'BIG';
    const color1 = this.bonusKind === 'reg' ? '#60c0ff' : '#ff6060';
    const color2 = this.bonusKind === 'reg' ? '#2080c0' : '#c02020';
    const flash = (t % 4) < 2;
    this._drawBig7(20, 14, this.bonusKind === 'reg' ? 'blue' : 'red', t);
    this._drawText(kind, 62, 18, flash ? color1 : color2, 18);
    this._drawText('BONUS', 58, 38, flash ? color1 : color2, 14);
    this._drawText('揃え!', 66, 58, '#ffe080', 12);
    this._drawText('?!?!', 140, 14, (t % 5 < 2) ? '#ffe040' : '#ff8000', 14);
    this._drawBig7(200, 28, this.bonusKind === 'reg' ? 'blue' : 'red', t);
    this._drawText('狙え!', 148, 62, '#ffff80', 12);
  }

  _drawBonus() {
    const t = this.frame;
    const kind = this.bonusKind === 'reg' ? 'REG' : 'BIG';
    const primary = this.bonusKind === 'reg' ? '#60d0ff' : '#ff4040';
    const accent  = this.bonusKind === 'reg' ? '#a0e0ff' : '#ffa0a0';

    // 左: マスコット（BIG=火竜、REG=水竜）
    if (this.bonusKind === 'reg') this._drawWaterDragon(20, 24, t);
    else                          this._drawFireDragon(18, 22, t);

    // 右上: タイトル
    const shake = (t % 2) ? 0 : 1;
    this._drawText(`${kind} BONUS!`, 104 + shake, 8, accent, 14);

    // 中央: 残りG / 獲得枚数 をパネル表示
    this._drawStatsPanel(100, 28, [
      { label: '残り', value: `${this.stats.bonusRemaining}G`, color: primary },
      { label: '獲得', value: `+${this.stats.bonusGain}`,      color: '#ffe080' },
    ]);

    if (t % 10 === 0) this._spawnCoinBurst(PIXEL_W - 20, PIXEL_H - 10, 2);
  }

  _drawArt() {
    const t = this.frame;
    // 虹色バンド
    const colors = ['#ff4080', '#ff8040', '#ffe040', '#60e080', '#40c0ff', '#8040ff'];
    for (let i = 0; i < colors.length; i++) {
      this.ctx.fillStyle = colors[i];
      const y = ((t + i * 2) % 10) + 4;
      this.ctx.fillRect(0, y + i * 11, PIXEL_W, 2);
    }
    this.ctx.fillStyle = 'rgba(0, 0, 30, 0.6)';
    this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);

    // 左: 錬金術師＋賢者の石
    this._drawAlchemist(20, 38, 'excited', t);
    this._drawPhilosopherStone(60, 42, t);

    // 右上: タイトル
    const flash = (t % 6) < 3 ? '#ffe080' : '#d0a0ff';
    this._drawText('錬金チャンス', 100, 8, flash, 14);

    // 中央: 残りG / 累計純増 をパネル表示
    const gain = this.stats.artGain;
    const gainStr = (gain >= 0 ? '+' : '') + gain;
    this._drawStatsPanel(100, 28, [
      { label: '残り', value: `${this.stats.artRemaining}G`, color: '#d0a0ff' },
      { label: '純増', value: gainStr,                       color: gain >= 0 ? '#ffe080' : '#a0a0a0' },
    ]);

    if (t % 3 === 0) this._spawnSparkleBurst(60, 42, 2, '#ffffff');
  }

  _drawTenjou() {
    const t = this.frame;
    this._drawAlchemist(40, 36, 'praying', t);
    this._drawText('★TENJOU★', 104, 14, (t % 4 < 2) ? '#ff8080' : '#ffe080', 14);
    this._drawText('レア役で', 116, 40, '#ff8080', 12);
    this._drawText('確定!', 134, 60, '#ffc060', 14);
    for (let i = 0; i < 8; i++) {
      if ((t + i) % 4 === 0) {
        this.ctx.fillStyle = '#ff6060';
        this.ctx.fillRect(10 + i * 28, 4, 3, 3);
        this.ctx.fillRect(10 + i * 28, PIXEL_H - 6, 3, 3);
      }
    }
  }

  // ---- イベント層描画 ----
  _drawEvents() {
    for (const ev of this._events) {
      const elapsed = (this.frame - ev.startFrame) * FRAME_MS;
      const progress = Math.min(1, elapsed / ev.duration);
      this._drawEvent(ev, progress);
    }
  }

  _drawEvent(ev, progress) {
    switch (ev.type) {
      case 'koyaku_tease_weak':     this._drawKoyakuTeaseWeak(ev, progress); break;
      case 'koyaku_tease_strong':   this._drawKoyakuTeaseStrong(ev, progress); break;
      case 'chance_tease_normal':   this._drawChanceTeaseNormal(ev, progress); break;
      case 'chance_tease_intense':  this._drawChanceTeaseIntense(ev, progress); break;
      case 'premier_rainbow':       this._drawPremierRainbow(ev, progress); break;
      case 'win_burst':             this._drawWinBurst(ev, progress); break;
      case 'gasuri_fail':           this._drawGasuriFail(ev, progress); break;
      case 'blue7_success':         this._drawBlue7Success(ev, progress); break;
      case 'art_add':               this._drawArtAdd(ev, progress); break;
      case 'upsell':                this._drawUpsell(ev, progress); break;
      case 'bonus_flash':           this._drawBonusFlash(ev, progress); break;
      case 'bonus_payout':          this._drawBonusPayout(ev, progress); break;
    }
  }

  /** BONUS中の1Gごと払い出し — +N枚 ポップアップ + コインバースト */
  _drawBonusPayout(ev, progress) {
    const amount = ev.opts?.amount || 0;
    if (amount <= 0) return;
    // 上方向にバウンドしながらスケール変化
    const bounce = Math.sin(progress * Math.PI);
    const y = PIXEL_H / 2 - 6 - bounce * 12;
    const fade = progress < 0.7 ? 1 : (1 - progress) / 0.3;
    const color = fade > 0.6 ? '#ffe040' : '#ff8020';
    this.ctx.globalAlpha = Math.max(0, fade);
    this._drawText(`+${amount}`, PIXEL_W / 2 - 16, y, color, 18);
    this.ctx.globalAlpha = 1;
    // コイン散らし
    if (this.frame % 2 === 0 && progress < 0.6) {
      this._spawnParticle(
        PIXEL_W / 2 + (Math.random() - 0.5) * 30,
        y + 8,
        (Math.random() - 0.5) * 1.4,
        -1.5 - Math.random(),
        14, '#ffd040', 'coin',
      );
    }
  }

  _drawBonusFlash(ev, progress) {
    // BIG中の盛り上げフラッシュ — 旧ビタ押し演出の置き換え
    const intensity = Math.sin(progress * Math.PI);
    this.ctx.fillStyle = `rgba(255, 220, 120, ${0.55 * intensity})`;
    this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    if (this.frame % 2 === 0) {
      this._spawnSparkleBurst(
        20 + Math.random() * (PIXEL_W - 40),
        10 + Math.random() * (PIXEL_H - 20),
        3, '#ffe080',
      );
    }
  }

  _drawKoyakuTeaseWeak(ev, progress) {
    const t = this.frame;
    const alpha = Math.sin(progress * Math.PI);
    this.ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
    // 大きな「!」
    this.ctx.fillRect(PIXEL_W / 2 - 3, 18, 6, 24);
    this.ctx.fillRect(PIXEL_W / 2 - 3, 48, 6, 6);
    if (t % 2 === 0) {
      this._spawnParticle(PIXEL_W / 2, PIXEL_H / 2, (Math.random() - 0.5) * 2, -1, 8, '#ffe080');
    }
  }

  _drawKoyakuTeaseStrong(ev, progress) {
    const t = this.frame;
    const cx = PIXEL_W / 2, cy = PIXEL_H / 2;
    const r = progress * 50;
    this.ctx.strokeStyle = `rgba(255, 220, 80, ${1 - progress})`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.stroke();
    const flash = (t % 2) === 0;
    this._drawText('CHANCE!?', cx - 40, cy - 8, flash ? '#ffff80' : '#ffa040', 16);
    if (t % 2 === 0) this._spawnSparkleBurst(cx, cy, 3, '#ffe080');
  }

  _drawChanceTeaseNormal(ev, progress) {
    const t = this.frame;
    this.ctx.strokeStyle = `rgba(255, 200, 40, ${1 - progress * 0.3})`;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(2, 2, PIXEL_W - 4, PIXEL_H - 4);
    const wiggle = Math.sin(progress * Math.PI * 4) * 3;
    const color = (t % 2) === 0 ? '#ffff80' : '#ff8040';
    this._drawText('CHANCE!?', PIXEL_W / 2 - 52, 28 + wiggle, color, 20);
    if (t % 2 === 0) {
      this._spawnSparkleBurst(
        20 + Math.random() * 200,
        20 + Math.random() * 40,
        2, '#ffe080',
      );
    }
  }

  _drawChanceTeaseIntense(ev, progress) {
    const t = this.frame;
    if (t % 4 < 2) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    }
    this.ctx.strokeStyle = (t % 2) ? '#ff4040' : '#ffff40';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(0, 0, PIXEL_W, PIXEL_H);
    const flash = (t % 2) === 0;
    this._drawText('★SUPER★', PIXEL_W / 2 - 52, 18, flash ? '#ffff80' : '#ff4040', 18);
    this._drawText('CHANCE!!', PIXEL_W / 2 - 52, 48, flash ? '#ffa040' : '#ffff80', 18);
    if (t % 2 === 0) {
      for (let i = 0; i < 3; i++) {
        this._spawnParticle(
          Math.random() * PIXEL_W, PIXEL_H,
          (Math.random() - 0.5) * 1, -1 - Math.random(),
          10, ['#ff4040', '#ff8040', '#ffe040'][i % 3], 'spark',
        );
      }
    }
  }

  _drawPremierRainbow(ev, progress) {
    const t = this.frame;
    const colors = ['#ff4080', '#ff8040', '#ffe040', '#80ff40', '#40c0ff', '#8040ff'];
    for (let i = 0; i < PIXEL_H; i++) {
      this.ctx.fillStyle = colors[(i + t * 2) % colors.length];
      this.ctx.fillRect(0, i, PIXEL_W, 1);
    }
    this._drawText('★PREMIER★', PIXEL_W / 2 - 60, 10, '#ffffff', 16);
    this._drawText('BONUS確定!!', PIXEL_W / 2 - 68, 34, '#ffe080', 18);
    this._drawText('RAINBOW!!', PIXEL_W / 2 - 60, 60, '#ffffff', 16);
    if (t % 2 === 0) {
      this._spawnSparkleBurst(
        20 + Math.random() * 200,
        10 + Math.random() * 60,
        4, '#ffffff',
      );
    }
  }

  _drawWinBurst(ev, progress) {
    const cx = PIXEL_W / 2, cy = PIXEL_H / 2;
    if (progress < 0.1) this._spawnCoinBurst(cx, cy, 5);
    if (progress < 0.3) this._spawnSparkleBurst(cx, cy, 4, '#ffe080');
    this._drawText('WIN!', cx - 20, cy - 8, '#ffff80', 18);
  }

  _drawGasuriFail(ev, progress) {
    this._drawAlchemist(40, 36, 'sad', this.frame);
    this._drawText('残念...', 120, 40, '#808080', 14);
  }

  _drawBlue7Success(ev, progress) {
    const t = this.frame;
    this.ctx.fillStyle = `rgba(80, 180, 255, ${0.5 - progress * 0.3})`;
    this.ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
    this._drawText('BLUE 7!!!', PIXEL_W / 2 - 52, 20, '#80e0ff', 18);
    this._drawText('ART GET!', PIXEL_W / 2 - 48, 50, '#ffffff', 18);
    if (t % 2 === 0) this._spawnSparkleBurst(PIXEL_W / 2, PIXEL_H / 2, 4, '#80e0ff');
  }

  _drawArtAdd(ev, progress) {
    const amount = ev.opts?.amount || 100;
    const bounce = Math.sin(progress * Math.PI) * 6;
    const y = PIXEL_H / 2 - 10 - bounce;
    this._drawText(`+${amount}G!!`, PIXEL_W / 2 - 40, y, '#d0a0ff', 20);
    if (this.frame % 2 === 0) this._spawnSparkleBurst(PIXEL_W / 2, y + 8, 3, '#d0a0ff');
  }

  _drawUpsell(ev, progress) {
    const amount = ev.opts?.amount || 10;
    const y = 22 - progress * 12;
    this._drawText(`+${amount}G`, PIXEL_W / 2 - 22, y, '#ffe080', 14);
  }

  // ===== スプライト =====

  /**
   * 錬金術師 — pose と frame に応じて描画
   * @param {number} x, y
   * @param {string|number} [pose] - 'idle'(default) | 'scared' | 'excited' | 'praying' | 'sad' | number(frame)
   * @param {number} [frame]
   */
  _drawAlchemist(x, y, pose = 'idle', frame = 0) {
    if (typeof pose === 'number') { frame = pose; pose = 'idle'; }
    const ctx = this.ctx;
    const f = (frame >> 2) % 2;

    // 共通: 帽子（紫 + 金縁）
    ctx.fillStyle = '#6020a0';
    ctx.fillRect(x + 3, y, 8, 2);
    ctx.fillRect(x + 2, y + 2, 10, 2);
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(x + 2, y + 3, 10, 1);

    // 顔
    ctx.fillStyle = '#ffd8b0';
    ctx.fillRect(x + 4, y + 4, 6, 4);

    // 目（pose別）
    ctx.fillStyle = '#000';
    if (pose === 'scared') {
      ctx.fillRect(x + 5, y + 5, 1, 2);
      ctx.fillRect(x + 8, y + 5, 1, 2);
    } else if (pose === 'excited') {
      ctx.fillRect(x + 5, y + 4, 1, 1);
      ctx.fillRect(x + 8, y + 4, 1, 1);
    } else if (pose === 'sad') {
      ctx.fillRect(x + 5, y + 6, 1, 1);
      ctx.fillRect(x + 8, y + 6, 1, 1);
    } else {
      ctx.fillRect(x + 5, y + 5, 1, 1);
      ctx.fillRect(x + 8, y + 5, 1, 1);
    }

    // ヒゲ
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4, y + 7, 6, 1);

    // ローブ
    ctx.fillStyle = '#6020a0';
    if (pose === 'excited') {
      // 両手上げ
      ctx.fillRect(x + 2, y + 8, 10, 10);
      ctx.fillRect(x + 0, y + 8 + f, 2, 4);
      ctx.fillRect(x + 12, y + 8 + f, 2, 4);
    } else if (pose === 'scared') {
      // 体が揺れる
      ctx.fillRect(x + 2 + f, y + 8, 10, 10);
    } else if (pose === 'praying') {
      // 両手を胸の前に
      ctx.fillRect(x + 2, y + 8, 10, 10);
      ctx.fillStyle = '#ffd8b0';
      ctx.fillRect(x + 5, y + 10, 4, 2);
    } else if (pose === 'sad') {
      ctx.fillRect(x + 2, y + 8, 10, 8);
    } else {
      ctx.fillRect(x + 2, y + 8 + f, 10, 10);
    }

    // 金の縁取り
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(x + 2, y + 8, 1, 10);
    ctx.fillRect(x + 11, y + 8, 1, 10);
  }

  _drawFlask(x, y, t) {
    const ctx = this.ctx;
    ctx.fillStyle = '#80d0ff';
    ctx.fillRect(x + 2, y, 2, 6);
    ctx.fillRect(x, y + 6, 6, 8);
    ctx.fillStyle = '#ff4080';
    ctx.fillRect(x + 1, y + 9, 4, 4);
    const bubblePhase = t % 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, y + 11 - bubblePhase, 1, 1);
    ctx.fillRect(x + 3, y + 13 - bubblePhase, 1, 1);
  }

  _drawMagicCircle(x, y, t) {
    const ctx = this.ctx;
    const colors = ['#ff4080', '#ffe040', '#60ffc0', '#40c0ff'];
    const c = colors[(t >> 1) % colors.length];
    ctx.fillStyle = c;
    const R = 14;
    for (let a = 0; a < 16; a++) {
      const theta = (a / 16) * Math.PI * 2 + (t / 10);
      const px = Math.round(x + Math.cos(theta) * R);
      const py = Math.round(y + Math.sin(theta) * R / 2);
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.fillStyle = '#ffe040';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  _drawRadialBurst(x, y, t, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const lines = 12;
    for (let i = 0; i < lines; i++) {
      const theta = (i / lines) * Math.PI * 2;
      const len = 16 + ((t + i) % 8);
      for (let r = 4; r < len; r++) {
        const px = Math.round(x + Math.cos(theta) * r);
        const py = Math.round(y + Math.sin(theta) * r * 0.5);
        if (px >= 0 && px < PIXEL_W && py >= 0 && py < PIXEL_H) {
          if (r % 2 === (t >> 1) % 2) ctx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  _drawPhilosopherStone(x, y, t) {
    const ctx = this.ctx;
    const pulse = (t % 8 < 4);
    const colors = pulse
      ? { outer: '#ff80ff', mid: '#ffe040', inner: '#ffffff' }
      : { outer: '#8040ff', mid: '#ff8040', inner: '#ffe080' };
    ctx.fillStyle = colors.outer;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x - i, y - 6 + i, 2 * i + 1, 1);
      ctx.fillRect(x - i, y + 6 - i, 2 * i + 1, 1);
    }
    ctx.fillStyle = colors.mid;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x - i, y - 4 + i, 2 * i + 1, 1);
      ctx.fillRect(x - i, y + 4 - i, 2 * i + 1, 1);
    }
    ctx.fillStyle = colors.inner;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }

  _drawBig7(x, y, color, t) {
    const ctx = this.ctx;
    const c = color === 'blue' ? '#4080ff' : '#ff4040';
    const accent = color === 'blue' ? '#80c0ff' : '#ff8080';
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 8, 2);
    ctx.fillRect(x + 6, y + 2, 2, 2);
    ctx.fillRect(x + 5, y + 4, 2, 2);
    ctx.fillRect(x + 4, y + 6, 2, 2);
    ctx.fillRect(x + 3, y + 8, 2, 2);
    if ((t % 6) < 3) {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, 8, 1);
    }
  }

  _drawFireDragon(x, y, t) {
    const ctx = this.ctx;
    const wing = (t >> 2) % 2;
    // 体（赤）
    ctx.fillStyle = '#c01010';
    ctx.fillRect(x + 6, y + 6, 18, 8);
    // 頭
    ctx.fillRect(x + 20, y + 4, 8, 6);
    // 鼻先
    ctx.fillStyle = '#ff4020';
    ctx.fillRect(x + 28, y + 6, 2, 2);
    // 目
    ctx.fillStyle = '#ffe040';
    ctx.fillRect(x + 22, y + 6, 1, 1);
    // 翼（羽ばたき）
    ctx.fillStyle = '#801010';
    if (wing === 0) {
      ctx.fillRect(x + 8, y, 8, 6);
      ctx.fillRect(x + 10, y + 6, 4, 2);
    } else {
      ctx.fillRect(x + 8, y + 2, 8, 6);
      ctx.fillRect(x + 10, y + 8, 4, 2);
    }
    // 尾
    ctx.fillStyle = '#c01010';
    ctx.fillRect(x + 2, y + 10, 6, 2);
    ctx.fillRect(x, y + 12, 4, 2);
    // 腹のハイライト
    ctx.fillStyle = '#ff6040';
    ctx.fillRect(x + 10, y + 12, 12, 1);
    // 火花を吹く
    if (t % 3 === 0) {
      this._spawnParticle(x + 30, y + 7, 1 + Math.random() * 0.5, (Math.random() - 0.5), 8, '#ffa040', 'spark');
    }
  }

  _drawWaterDragon(x, y, t) {
    const ctx = this.ctx;
    const sway = Math.sin(t / 4) * 1;
    // 体（青）
    ctx.fillStyle = '#2060b0';
    ctx.fillRect(x + 6, y + 6 + sway, 18, 8);
    // 頭
    ctx.fillRect(x + 20, y + 4 + sway, 8, 6);
    ctx.fillStyle = '#60a0ff';
    ctx.fillRect(x + 28, y + 6 + sway, 2, 2);
    // 目
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 22, y + 6 + sway, 1, 1);
    // ヒレ（背）
    ctx.fillStyle = '#80c0ff';
    ctx.fillRect(x + 10, y + 4 + sway, 8, 2);
    // ヒレ（尾）
    ctx.fillRect(x + 2, y + 10 + sway, 6, 2);
    // 腹
    ctx.fillStyle = '#80c0ff';
    ctx.fillRect(x + 10, y + 12 + sway, 12, 1);
    // 水滴
    if (t % 5 === 0) {
      this._spawnParticle(x + 14, y + 12 + sway, 0, 0.5, 10, '#80c0ff', 'spark');
    }
  }

  /**
   * ステータスパネル描画 — 「ラベル: 値」の行を縦に並べる小さな枠付きパネル
   * @param {number} x - パネル左上X
   * @param {number} y - パネル左上Y
   * @param {Array<{label:string, value:string, color:string}>} rows
   */
  _drawStatsPanel(x, y, rows) {
    const ctx = this.ctx;
    const W = 130, ROW_H = 14;
    const H = rows.length * ROW_H + 6;
    // パネル背景＋金縁
    ctx.fillStyle = 'rgba(8, 8, 24, 0.78)';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    rows.forEach((row, i) => {
      const ry = y + 4 + i * ROW_H;
      this._drawText(row.label, x + 6, ry, '#c0a060', 10);
      this._drawText(row.value, x + W - 6 - this._textWidthApprox(row.value, 12), ry - 1, row.color, 12);
    });
  }

  /** _drawText で書く文字列のおおよそのpx幅を返す（右寄せ用） */
  _textWidthApprox(text, size) {
    this.ctx.font = `bold ${size}px monospace`;
    return Math.ceil(this.ctx.measureText(text).width);
  }

  /**
   * ピクセル風テキスト描画（8pxベース）
   * @param {number} [size] - フォントサイズ(8がデフォルト、11などで大きく)
   */
  _drawText(text, x, y, color, size = 8) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px monospace`;
    ctx.textBaseline = 'top';
    // 黒縁取り
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
