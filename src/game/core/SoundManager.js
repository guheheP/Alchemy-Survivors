/**
 * SoundManager — BGMプレイリスト + プロシージャルSE
 * 
 * 外部mp3ファイルのプレイリスト再生を管理。
 * ファイル不在時はプロシージャルBGMにフォールバック。
 */
import { eventBus } from './EventBus.js';
import { assetPath } from './assetPath.js';

// --- プレイリスト定義 ---
const TITLE_TRACK = assetPath('/bgm/title_01.mp3');
const ENDING_TRACK = assetPath('/bgm/Ending_01.mp3');
// ボスID → バトルBGMのマッピング（ステージ順）
const BATTLE_TRACKS = {
  boss_plains_slime:  assetPath('/bgm/battle_01.mp3'),
  boss_cave_golem:    assetPath('/bgm/battle_02.mp3'),
  boss_forest_treant: assetPath('/bgm/battle_03.mp3'),
  boss_volcano_ifrit: assetPath('/bgm/battle_04.mp3'),
  boss_sea_kraken:    assetPath('/bgm/battle_05.mp3'),
  boss_elder_dragon:  assetPath('/bgm/battle_06.mp3'),
  boss_sky_titan:     assetPath('/bgm/battle_07.mp3'),
  boss_time_lord:     assetPath('/bgm/battle_08.mp3'),
};
const BATTLE_TRACK_DEFAULT = assetPath('/bgm/battle_EX.mp3');
const GAME_TRACKS = Array.from({ length: 15 }, (_, i) =>
  assetPath(`/bgm/bgm_${String(i + 1).padStart(2, '0')}.mp3`)
);

class SoundManagerClass {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.muted = false;
    this.initialized = false;

    // 音量設定（0.0 ~ 1.0）
    this.masterVolume = 0.3;  // デフォルト30%
    this.bgmVolume = 0.5;
    this.seVolume = 0.5;

    // --- BGMプレイリスト ---
    this.audioEl = null;        // <audio> element
    this.bgmSource = null;      // MediaElementSource
    this.shuffledPlaylist = [];  // シャッフル済みゲームBGM
    this.currentTrackIndex = 0;
    this.isTitleBGM = false;
    this.isBattleBGM = false;
    this.preBattleTrackSrc = null;
    this.preBattleTrackTime = 0;
    this.isFading = false;

    // --- プロシージャルBGM (フォールバック) ---
    this.proceduralActive = false;
    this._bgmTimeout = null;

    // --- Audio ノード管理（メモリリーク防止） ---
    this._noiseBufferCache = null;   // ノイズバッファのキャッシュ
    this._activeSeNodes = [];        // アクティブなSEノード追跡
    this._maxSeNodes = 12;           // 同時SE上限
    this._activeBgmNodes = [];       // プロシージャルBGMノード追跡

    // Load saved settings
    const saved = localStorage.getItem('voxelshop_sound');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        this.muted = s.muted || false;
        if (s.masterVolume !== undefined) this.masterVolume = s.masterVolume;
        if (s.bgmVolume !== undefined) this.bgmVolume = s.bgmVolume;
        if (s.seVolume !== undefined) this.seVolume = s.seVolume;
      } catch { /* */ }
    }
  }

  /** AudioContextとAudio要素の初期化（ユーザーインタラクション後に呼ぶ） */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.masterGain);

    this.seGain = this.ctx.createGain();
    this.seGain.gain.value = this.seVolume;
    this.seGain.connect(this.masterGain);

    // <audio> element for BGM streaming
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.loop = false;
    this.audioEl.volume = 1.0; // volume is controlled via bgmGain

    // Connect audio element to Web Audio API for unified volume control
    try {
      this.bgmSource = this.ctx.createMediaElementSource(this.audioEl);
      this.bgmSource.connect(this.bgmGain);
    } catch (e) {
      // Some browsers may not support MediaElementSource
      console.warn('[SoundManager] MediaElementSource not supported, using direct audio');
    }

    // 曲終了時に次の曲へ
    this.audioEl.addEventListener('ended', () => {
      if (this.isTitleBGM) {
        // タイトル曲はループ
        this.audioEl.currentTime = 0;
        this.audioEl.play().catch(() => {});
      } else {
        this.playNextTrack();
      }
    });

    // シャッフルプレイリスト作成
    this._shufflePlaylist();

    this._bindEvents();
  }

  _bindEvents() {
    eventBus.on('item:crafted', (d) => {
      if (d?.item?.quality >= 81) {
        this.playLegendaryCraft();
      } else {
        this.playCraftSuccess();
      }
    });
    eventBus.on('item:sold', () => this.playSellCoin());
    eventBus.on('customer:arrived', () => this.playDoorBell());
    eventBus.on('rank:up', () => this.playFanfare());
    eventBus.on('adventurer:levelUp', () => this.playLevelUp());
    eventBus.on('event:triggered', () => this.playEventChime());
    eventBus.on('day:tick', () => this.playDayTick());
    eventBus.on('game:over', () => this.playGameOver());
    eventBus.on('tab:switched', () => this.playTabSwitch());
    eventBus.on('item:displayed', () => this.playItemDisplay());
    eventBus.on('item:removed', () => this.playItemRemove());
    eventBus.on('adventurer:return', () => this.playItemAcquire());

    // 日替わりでBGMフェード → 次の曲
    eventBus.on('day:newDay', () => this._onNewDay());

    // エンディング
    eventBus.on('game:clear', () => this.playEndingBGM());

    // --- バトルBGM & SE ---
    eventBus.on('battle:start', (state) => {
      // チャレンジモードなどでプレイヤーが選んだBGMがあればそちらを優先
      if (state?.overrideBgm) {
        this.startBattleBGM(state.overrideBgm);
        return;
      }
      const bossId = state?.boss?.id;
      const track = (bossId && BATTLE_TRACKS[bossId]) || BATTLE_TRACK_DEFAULT;
      this.startBattleBGM(track);
    });
    eventBus.on('battle:win', () => {
      this.playBattleVictory();
      // 少し待ってからゲームBGMに戻す
      setTimeout(() => this.stopBattleBGM(), 2500);
    });
    eventBus.on('battle:lose', () => {
      this.playBattleDefeat();
      setTimeout(() => this.stopBattleBGM(), 2000);
    });

    // バトルSEイベント
    eventBus.on('battle:se:advAttack', () => this.playBattleAdvAttack());
    eventBus.on('battle:se:bossAttack', () => this.playBattleBossAttack());
    eventBus.on('battle:se:itemUse', () => this.playBattleItemUse());
    eventBus.on('battle:se:heal', () => this.playBattleHeal());
    eventBus.on('battle:se:buff', () => this.playBattleBuff());
    eventBus.on('battle:se:debuff', () => this.playBattleDebuff());
    eventBus.on('battle:se:damage', () => this.playBattleDamage());
    eventBus.on('battle:se:stun', () => this.playBattleStun());
    eventBus.on('battle:se:ko', () => this.playBattleKO());
    eventBus.on('battle:se:revive', () => this.playBattleRevive());
    eventBus.on('battle:se:phaseShift', () => this.playBattlePhaseShift());
    // B6: ボススキルSE
    eventBus.on('battle:se:bossAoe', () => this.playBattleBossAttack());
    eventBus.on('battle:se:bossHeavy', () => this.playBattleBossAttack());
    eventBus.on('battle:se:bossHeal', () => this.playBattleHeal());
    // B8: チェインSE
    eventBus.on('battle:se:chain', () => this.playBattleBuff());
  }

  // ===== 音量制御 =====

  _saveSettings() {
    localStorage.setItem('voxelshop_sound', JSON.stringify({
      muted: this.muted,
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      seVolume: this.seVolume,
    }));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.1);
    }
    if (!this.bgmSource && this.audioEl) {
      this.audioEl.volume = this.muted ? 0 : this.masterVolume;
    }
    this._saveSettings();
    return this.muted;
  }

  /** マスター音量を設定（0.0〜1.0） */
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
    }
    this._saveSettings();
  }

  /** BGM音量を設定（0.0〜1.0） */
  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain) {
      this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }
    this._saveSettings();
  }

  /** SE音量を設定（0.0〜1.0） */
  setSeVolume(v) {
    this.seVolume = Math.max(0, Math.min(1, v));
    if (this.seGain) {
      this.seGain.gain.setTargetAtTime(this.seVolume, this.ctx.currentTime, 0.05);
    }
    this._saveSettings();
  }

  // ===== アセット読み込み待ち =====

  /** 現在ロード中のBGMトラックの読み込み完了を待つ */
  waitForCurrentTrack() {
    return new Promise(resolve => {
      if (!this.audioEl) return resolve();
      // 既にデータが十分読み込まれている場合
      if (this.audioEl.readyState >= 3) return resolve();
      const onReady = () => {
        this.audioEl.removeEventListener('canplaythrough', onReady);
        this.audioEl.removeEventListener('error', onReady);
        resolve();
      };
      this.audioEl.addEventListener('canplaythrough', onReady, { once: true });
      this.audioEl.addEventListener('error', onReady, { once: true });
    });
  }

  // ===== BGMプレイリスト =====

  /** タイトルBGM開始 */
  startTitleBGM() {
    this.isTitleBGM = true;
    this._playTrack(TITLE_TRACK);
  }

  /** ゲームBGM開始（シャッフルプレイリスト） */
  startGameBGM() {
    this.isTitleBGM = false;
    // タイトル曲がまだ再生中ならそのまま流す → 次のday:newDayで切り替わる
    // ただし、タイトル曲のloopは解除
    if (this.audioEl && !this.audioEl.paused && this.audioEl.src.includes('title_01')) {
      // タイトル曲が終了したら最初のゲームBGMへ
      this.audioEl.loop = false;
      const onTitleEnd = () => {
        this.audioEl.removeEventListener('ended', onTitleEnd);
        this._playTrack(this.shuffledPlaylist[this.currentTrackIndex]);
      };
      this.audioEl.addEventListener('ended', onTitleEnd, { once: true });
      return;
    }
    this._playTrack(this.shuffledPlaylist[this.currentTrackIndex]);
  }

  // ===== バトルBGM =====

  /** バトルBGM開始 — 現在のBGMをフェードアウトし、バトル曲へ切替 */
  startBattleBGM(track) {
    const battleTrack = track || BATTLE_TRACK_DEFAULT;
    // 現在の再生位置を保存して復帰できるようにする
    if (this.audioEl && !this.isBattleBGM) {
      this.preBattleTrackSrc = this.audioEl.src;
      this.preBattleTrackTime = this.audioEl.currentTime;
    }
    this.isBattleBGM = true;
    this._fadeOutThen(() => {
      this._playTrack(battleTrack);
      // バトル曲はループ
      if (this.audioEl) this.audioEl.loop = true;
    }, 800);
  }

  /** バトルBGM終了 — ゲームBGMに復帰 */
  stopBattleBGM() {
    if (!this.isBattleBGM) return;
    this.isBattleBGM = false;
    // バトル終了時に全アクティブSEノードを強制切断
    this._forceCleanupAllSeNodes();
    this._fadeOutThen(() => {
      if (this.audioEl) this.audioEl.loop = false;
      // 保存していた曲を再開、または次の曲を再生
      if (this.preBattleTrackSrc) {
        this._playTrack(this.preBattleTrackSrc);
        // 復帰位置を少し戻す（自然にする）
        if (this.audioEl) {
          this.audioEl.currentTime = Math.max(0, this.preBattleTrackTime - 2);
        }
        this.preBattleTrackSrc = null;
      } else {
        this.playNextTrack();
      }
    }, 1200);
  }

  /** エンディングBGM */
  playEndingBGM() {
    this.isTitleBGM = false;
    this._fadeOutThen(() => {
      this._playTrack(ENDING_TRACK);
    });
  }

  /** 次のトラック再生 */
  playNextTrack() {
    if (this.isTitleBGM) return;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.shuffledPlaylist.length;
    // 一巡したらリシャッフル
    if (this.currentTrackIndex === 0) {
      this._shufflePlaylist();
    }
    this._playTrack(this.shuffledPlaylist[this.currentTrackIndex]);
  }

  /** BGM停止 */
  stopBGM() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    this._stopProcedural();
  }

  // ===== 音量制御 =====

  /** マスター音量を設定 (0.0 ~ 1.0) */
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  /** BGM音量を設定 (0.0 ~ 1.0) */
  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain && !this.isFading) {
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  /** SE音量を設定 (0.0 ~ 1.0) */
  setSeVolume(v) {
    this.seVolume = Math.max(0, Math.min(1, v));
    if (this.seGain) {
      this.seGain.gain.setValueAtTime(this.seVolume, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  /** ミュートトグル。新しいmuted状態を返す */
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime
      );
    }
    this._saveSettings();
    return this.muted;
  }

  /** 設定をlocalStorageに保存 */
  _saveSettings() {
    try {
      localStorage.setItem('voxelshop_sound', JSON.stringify({
        muted: this.muted,
        masterVolume: this.masterVolume,
        bgmVolume: this.bgmVolume,
        seVolume: this.seVolume,
      }));
    } catch { /* quota exceeded etc. */ }
  }

  /** day:newDayイベント → フェードアウトして次の曲 */
  _onNewDay() {
    if (this.isTitleBGM || this.isBattleBGM) return;
    this._fadeOutThen(() => {
      this.playNextTrack();
    });
  }

  /** フェードアウトしてからコールバック実行 */
  _fadeOutThen(callback, durationMs = 2000) {
    if (!this.bgmGain || this.isFading) {
      callback();
      return;
    }
    this.isFading = true;
    const now = this.ctx.currentTime;
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
    this.bgmGain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    setTimeout(() => {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      // 音量復元
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
      this.isFading = false;
      callback();
    }, durationMs);
  }

  /** トラック再生（内部） */
  _playTrack(src) {
    if (!this.audioEl) return;

    // プロシージャルBGMが動いてたら止める
    this._stopProcedural();

    // 既に再生中なら一旦停止してからソースを変える
    this.audioEl.pause();
    this.audioEl.src = src;
    this.audioEl.load();

    // play()はユーザーインタラクション後でないと失敗する場合がある
    const playPromise = this.audioEl.play();
    if (playPromise) {
      playPromise.catch(err => {
        // AbortError: 新しいload()で中断された → 無視（正常動作）
        if (err.name === 'AbortError') return;
        // NotAllowedError: ユーザー操作がない → プロシージャルにフォールバック
        console.warn('[SoundManager] Track play failed:', err.message);
        this._startProcedural();
      });
    }
  }

  /** シャッフルプレイリスト生成 */
  _shufflePlaylist() {
    this.shuffledPlaylist = [...GAME_TRACKS];
    for (let i = this.shuffledPlaylist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledPlaylist[i], this.shuffledPlaylist[j]] = [this.shuffledPlaylist[j], this.shuffledPlaylist[i]];
    }
    this.currentTrackIndex = 0;
  }

  // ===== プロシージャルBGM（フォールバック） =====

  _startProcedural() {
    if (this.proceduralActive) return;
    this.proceduralActive = true;
    this._playProceduralLoop();
  }

  _stopProcedural() {
    this.proceduralActive = false;
    if (this._bgmTimeout) {
      clearTimeout(this._bgmTimeout);
      this._bgmTimeout = null;
    }
    // プロシージャルBGMノードを全切断
    for (const n of this._activeBgmNodes) {
      try {
        if (n.source) { n.source.stop?.(); n.source.disconnect(); }
        if (n.filter) n.filter.disconnect();
        if (n.gain) n.gain.disconnect();
      } catch { /* already disconnected */ }
    }
    this._activeBgmNodes.length = 0;
  }

  _playProceduralLoop() {
    if (!this.proceduralActive || !this.ctx) return;
    const pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const now = this.ctx.currentTime;
    const noteCount = 6 + Math.floor(Math.random() * 4);
    const phraseDuration = noteCount * 1.2;

    for (let i = 0; i < noteCount; i++) {
      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      const startTime = now + i * 1.2 + Math.random() * 0.2;
      const duration = 0.8 + Math.random() * 0.6;
      this._playBGMNote(freq, startTime, duration);
    }
    const chordRoot = pentatonic[Math.floor(Math.random() * 4)];
    this._playPad(chordRoot, now, phraseDuration + 1);
    this._bgmTimeout = setTimeout(() => this._playProceduralLoop(), (phraseDuration + 1.5) * 1000);
  }

  _playBGMNote(freq, startTime, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
    const node = { source: osc, gain };
    this._activeBgmNodes.push(node);
    osc.onended = () => {
      osc.disconnect(); gain.disconnect();
      const idx = this._activeBgmNodes.indexOf(node);
      if (idx !== -1) this._activeBgmNodes.splice(idx, 1);
    };
  }

  _playPad(rootFreq, startTime, duration) {
    const freqs = [rootFreq * 0.5, rootFreq * 0.5 * 1.25, rootFreq * 0.5 * 1.5];
    freqs.forEach(f => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = f;
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.5;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.04, startTime + 1.0);
      gain.gain.linearRampToValueAtTime(0.04, startTime + duration - 1.0);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
      const node = { source: osc, filter, gain };
      this._activeBgmNodes.push(node);
      osc.onended = () => {
        osc.disconnect(); filter.disconnect(); gain.disconnect();
        const idx = this._activeBgmNodes.indexOf(node);
        if (idx !== -1) this._activeBgmNodes.splice(idx, 1);
      };
    });
  }

  // ===== SE: 効果音 =====

  playCraftSuccess() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      this._playSENote(freq, now + i * 0.08, 0.3, 'sine', 0.15);
    });
  }

  playPuzzleMatch(comboLevel = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq = 440 + comboLevel * 80;
    this._playSENote(baseFreq, now, 0.15, 'square', 0.08);
    this._playSENote(baseFreq * 1.25, now + 0.06, 0.12, 'square', 0.06);
  }

  playSellCoin() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(1200, now, 0.08, 'square', 0.06);
    this._playSENote(1800, now + 0.04, 0.06, 'square', 0.04);
    this._playSENote(2400, now + 0.07, 0.1, 'sine', 0.05);
  }

  playDoorBell() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(880, now, 0.4, 'sine', 0.12);
    this._playSENote(1108.73, now + 0.15, 0.35, 'sine', 0.10);
  }

  playFanfare() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.50];
    const times = [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72];
    const durs  = [0.1, 0.1, 0.1, 0.15, 0.1, 0.15, 0.6];
    notes.forEach((freq, i) => {
      this._playSENote(freq, now + times[i], durs[i], 'square', 0.10);
    });
  }

  playLevelUp() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      this._playSENote(400 + i * 120, now + i * 0.06, 0.15, 'sine', 0.10);
    }
  }

  playEventChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(660, now, 0.25, 'sine', 0.10);
    this._playSENote(880, now + 0.12, 0.3, 'sine', 0.08);
    this._playSENote(1100, now + 0.24, 0.25, 'sine', 0.06);
  }

  playDayTick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(440, now, 0.15, 'triangle', 0.05);
  }

  playGameOver() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(110, now, 1.5, 'sawtooth', 0.15);
    this._playSENote(82.41, now + 0.1, 1.2, 'sine', 0.12);
  }

  /** レジェンダリー調合 — 華やかなアルペジオ+和音 */
  playLegendaryCraft() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 上昇アルペジオ
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, i) => {
      this._playSENote(freq, now + i * 0.06, 0.4, 'sine', 0.12);
    });
    // キラキラ和音
    this._playSENote(1046.50, now + 0.4, 0.8, 'sine', 0.08);
    this._playSENote(1318.51, now + 0.4, 0.8, 'sine', 0.06);
    this._playSENote(1567.98, now + 0.4, 0.8, 'sine', 0.05);
  }

  /** タブ切替 — 軽いクリック音 */
  playTabSwitch() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(600, now, 0.05, 'sine', 0.04);
    this._playSENote(800, now + 0.03, 0.04, 'sine', 0.03);
  }

  /** 陳列 — ストンと置く音 */
  playItemDisplay() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(300, now, 0.1, 'triangle', 0.06);
    this._playSENote(450, now + 0.05, 0.08, 'sine', 0.04);
  }

  /** 取り下げ — スッと引く音 */
  playItemRemove() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(500, now, 0.06, 'sine', 0.04);
    this._playSENote(350, now + 0.04, 0.08, 'sine', 0.03);
  }

  /** アイテム入手 — キランッ */
  playItemAcquire() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(880, now, 0.12, 'sine', 0.08);
    this._playSENote(1320, now + 0.06, 0.15, 'sine', 0.06);
    this._playSENote(1760, now + 0.12, 0.1, 'sine', 0.04);
  }

  /** エラー — ブブッ */
  playError() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(150, now, 0.08, 'square', 0.08);
    this._playSENote(120, now + 0.1, 0.1, 'square', 0.06);
  }

  // ===== バトルSE =====

  /** 冒険者攻撃 — シャキン！ */
  playBattleAdvAttack() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 金属的なスラッシュ音
    this._playSENote(800, now, 0.06, 'sawtooth', 0.10);
    this._playSENote(1200, now + 0.02, 0.04, 'square', 0.08);
    this._playSENote(600, now + 0.05, 0.08, 'triangle', 0.05);
    // ノイズ的なインパクト
    this._playNoiseBurst(now + 0.01, 0.04, 0.06);
  }

  /** ボス攻撃 — ドゴォン！ */
  playBattleBossAttack() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 重い打撃音
    this._playSENote(120, now, 0.15, 'sawtooth', 0.14);
    this._playSENote(80, now + 0.02, 0.2, 'sine', 0.10);
    this._playSENote(200, now + 0.04, 0.08, 'square', 0.08);
    this._playNoiseBurst(now, 0.06, 0.10);
  }

  /** アイテム使用 — ポン！ */
  playBattleItemUse() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(660, now, 0.08, 'sine', 0.10);
    this._playSENote(990, now + 0.04, 0.06, 'sine', 0.08);
    this._playSENote(1320, now + 0.08, 0.1, 'sine', 0.06);
  }

  /** 回復 — キラキラ上昇音 */
  playBattleHeal() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this._playSENote(f, now + i * 0.06, 0.25, 'sine', 0.08);
    });
  }

  /** バフ — パワーアップ音 */
  playBattleBuff() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(440, now, 0.12, 'triangle', 0.08);
    this._playSENote(554, now + 0.06, 0.12, 'triangle', 0.07);
    this._playSENote(659, now + 0.12, 0.2, 'sine', 0.09);
    this._playSENote(880, now + 0.18, 0.25, 'sine', 0.06);
  }

  /** デバフ — 弱体化音 */
  playBattleDebuff() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(500, now, 0.12, 'sawtooth', 0.06);
    this._playSENote(350, now + 0.08, 0.15, 'sawtooth', 0.05);
    this._playSENote(200, now + 0.16, 0.2, 'sine', 0.07);
  }

  /** 戦闘不能 — ガクッ */
  playBattleKO() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(300, now, 0.1, 'sawtooth', 0.10);
    this._playSENote(200, now + 0.08, 0.15, 'sine', 0.08);
    this._playSENote(100, now + 0.18, 0.3, 'sine', 0.06);
  }

  /** ダメージアイテム — ドカン！ */
  playBattleDamage() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 爆発的なインパクト音
    this._playSENote(150, now, 0.12, 'sawtooth', 0.12);
    this._playSENote(300, now + 0.02, 0.08, 'square', 0.10);
    this._playSENote(100, now + 0.05, 0.15, 'sine', 0.08);
    this._playNoiseBurst(now, 0.08, 0.10);
    this._playSENote(500, now + 0.08, 0.06, 'sawtooth', 0.06);
  }

  /** スタン — ビリビリッ！ */
  playBattleStun() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 電撃的なスタン音
    this._playSENote(800, now, 0.04, 'square', 0.10);
    this._playSENote(1200, now + 0.03, 0.03, 'square', 0.08);
    this._playSENote(600, now + 0.06, 0.05, 'sawtooth', 0.07);
    this._playSENote(1000, now + 0.09, 0.04, 'square', 0.06);
    this._playSENote(400, now + 0.12, 0.08, 'triangle', 0.05);
    this._playNoiseBurst(now + 0.02, 0.06, 0.06);
  }

  /** フェーズシフト — ゴゴゴゴゴ…！ */
  playBattlePhaseShift() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 低音の不吉な轟音
    this._playSENote(80, now, 0.6, 'sawtooth', 0.12);
    this._playSENote(100, now + 0.1, 0.5, 'sine', 0.10);
    this._playSENote(60, now + 0.2, 0.4, 'sawtooth', 0.08);
    // 上昇する金属音
    this._playSENote(200, now + 0.3, 0.2, 'square', 0.06);
    this._playSENote(400, now + 0.4, 0.2, 'square', 0.05);
    this._playSENote(600, now + 0.5, 0.3, 'sine', 0.04);
    this._playNoiseBurst(now + 0.1, 0.15, 0.08);
  }

  /** 復活 — シャララン */
  playBattleRevive() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [330, 440, 554, 659, 880, 1047];
    notes.forEach((f, i) => {
      this._playSENote(f, now + i * 0.07, 0.3, 'sine', 0.07);
    });
  }

  /** 勝利ファンファーレ */
  playBattleVictory() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 523, 659, 784, 1047, 784, 1047, 1319];
    const times = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.95, 1.15];
    const durs  = [0.12, 0.12, 0.12, 0.15, 0.12, 0.15, 0.2, 0.8];
    notes.forEach((freq, i) => {
      this._playSENote(freq, now + times[i], durs[i], 'square', 0.12);
    });
    // ハーモニー
    this._playSENote(1047, now + 1.15, 0.8, 'sine', 0.06);
    this._playSENote(1319, now + 1.15, 0.8, 'sine', 0.05);
    this._playSENote(1568, now + 1.15, 0.8, 'sine', 0.04);
  }

  /** 敗北ジングル */
  playBattleDefeat() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(220, now, 0.5, 'sine', 0.10);
    this._playSENote(196, now + 0.3, 0.5, 'sine', 0.08);
    this._playSENote(165, now + 0.6, 0.6, 'sine', 0.10);
    this._playSENote(110, now + 1.0, 1.2, 'sine', 0.12);
  }

  /** ノイズバースト（打撃音のインパクト補助） — バッファキャッシュ + ノード上限 */
  _playNoiseBurst(startTime, duration, volume = 0.05) {
    if (!this.ctx) return;

    // アクティブノード上限チェック — 古いノードを強制切断
    this._cleanupSeNodes();
    if (this._activeSeNodes.length >= this._maxSeNodes) return;

    // ノイズバッファをキャッシュ（毎回生成しない）
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.15); // 固定長バッファ
    if (!this._noiseBufferCache) {
      this._noiseBufferCache = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this._noiseBufferCache.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBufferCache;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.8;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.seGain);
    source.start(startTime);
    source.stop(startTime + duration + 0.05);

    const nodeGroup = { source, filter, gain };
    this._activeSeNodes.push(nodeGroup);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
      const idx = this._activeSeNodes.indexOf(nodeGroup);
      if (idx !== -1) this._activeSeNodes.splice(idx, 1);
    };
  }

  /** 全SEノードを即座に切断・解放 */
  _forceCleanupAllSeNodes() {
    for (const n of this._activeSeNodes) {
      try {
        if (n.source) { n.source.stop?.(); n.source.disconnect(); }
        if (n.filter) n.filter.disconnect();
        if (n.gain) n.gain.disconnect();
      } catch { /* already disconnected */ }
    }
    this._activeSeNodes.length = 0;
  }

  /** 古い/停止済みSEノードを強制クリーンアップ */
  _cleanupSeNodes() {
    // onendedが発火しなかったノードを安全に除去
    const now = this.ctx?.currentTime || 0;
    const stale = this._activeSeNodes.filter(n => {
      try { return n.source.playbackState === 3; } catch { return false; } // ended
    });
    for (const n of stale) {
      try { n.source.disconnect(); n.filter.disconnect(); n.gain.disconnect(); } catch { /* */ }
      const idx = this._activeSeNodes.indexOf(n);
      if (idx !== -1) this._activeSeNodes.splice(idx, 1);
    }
  }

  /** ボタンホバー — 極軽いコツッ */
  playHover() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(700, now, 0.02, 'sine', 0.02);
  }

  // ===== 共通ユーティリティ =====

  _playSENote(freq, startTime, duration, type = 'sine', volume = 0.1) {
    if (!this.ctx) return;
    // アクティブノード上限チェック
    this._cleanupSeNodes();
    if (this._activeSeNodes.length >= this._maxSeNodes) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);

    const nodeGroup = { source: osc, gain };
    this._activeSeNodes.push(nodeGroup);
    osc.onended = () => {
      osc.disconnect(); gain.disconnect();
      const idx = this._activeSeNodes.indexOf(nodeGroup);
      if (idx !== -1) this._activeSeNodes.splice(idx, 1);
    };
  }
}

// シングルトン
export const SoundManager = new SoundManagerClass();
