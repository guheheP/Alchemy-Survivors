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
// カジノ(スロット) — ボーナス/ARTの専用BGM
const CASINO_TRACKS = {
  big: assetPath('/bgm/BIG_BONUS.mp3'),
  reg: assetPath('/bgm/REG_BONUS.mp3'),
  art: assetPath('/bgm/ART.mp3'),
};
// 拠点（ハブ）BGM — シャッフル再生
const GAME_TRACKS = Array.from({ length: 6 }, (_, i) =>
  assetPath(`/bgm/bgm_${String(i + 1).padStart(2, '0')}.mp3`)
);
// ラン中BGM — エリアID → run_NN.mp3
const RUN_TRACKS = {
  plains:        assetPath('/bgm/run_01.mp3'),
  cave:          assetPath('/bgm/run_02.mp3'),
  forest:        assetPath('/bgm/run_03.mp3'),
  volcano:       assetPath('/bgm/run_04.mp3'),
  deep_sea:      assetPath('/bgm/run_05.mp3'),
  dragon_nest:   assetPath('/bgm/run_06.mp3'),
  sky_tower:     assetPath('/bgm/run_07.mp3'),
  time_corridor: assetPath('/bgm/run_08.mp3'),
};
const RUN_TRACK_DEFAULT = assetPath('/bgm/run_01.mp3');
// ボス戦BGM — エリアID → battle_NN.mp3
const BOSS_TRACKS_BY_AREA = {
  plains:        assetPath('/bgm/battle_01.mp3'),
  cave:          assetPath('/bgm/battle_02.mp3'),
  forest:        assetPath('/bgm/battle_03.mp3'),
  volcano:       assetPath('/bgm/battle_04.mp3'),
  deep_sea:      assetPath('/bgm/battle_05.mp3'),
  dragon_nest:   assetPath('/bgm/battle_06.mp3'),
  sky_tower:     assetPath('/bgm/battle_07.mp3'),
  time_corridor: assetPath('/bgm/battle_08.mp3'),
};

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
    this._seVolumeScale = 1.0;  // SEシーン別スケール (カジノ内SE音量など)

    // --- BGMプレイリスト ---
    this.audioEl = null;        // <audio> element
    this.bgmSource = null;      // MediaElementSource
    this.shuffledPlaylist = [];  // シャッフル済みゲームBGM
    this.currentTrackIndex = 0;
    this.isTitleBGM = false;
    this.isBattleBGM = false;
    this.isRunBGM = false;
    this.currentAreaId = null;
    this.preBattleTrackSrc = null;
    this.preBattleTrackTime = 0;
    this.isFading = false;

    // カジノBGMスタック — ART→BONUS→ART復帰のようなネストに対応
    /** @type {Array<{src: string, time: number}>} */
    this._casinoBgmStack = [];
    // 競合対策: start/stop の都度インクリメント。fadeコールバック内で自分の世代か確認
    this._casinoBgmPendingToken = 0;

    // --- プロシージャルBGM (フォールバック) ---
    this.proceduralActive = false;
    this._bgmTimeout = null;
    this._fadeTimeoutId = null;

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
    this.seGain.gain.value = this.seVolume * this._seVolumeScale;
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
      if (this.isTitleBGM || this.isRunBGM) {
        // タイトル / ラン中BGMはループ
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
    if (this.bgmGain && !this.isFading) {
      this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }
    this._saveSettings();
  }

  /** SE音量を設定（0.0〜1.0） */
  setSeVolume(v) {
    this.seVolume = Math.max(0, Math.min(1, v));
    if (this.seGain) {
      this.seGain.gain.setTargetAtTime(this.seVolume * this._seVolumeScale, this.ctx.currentTime, 0.05);
    }
    this._saveSettings();
  }

  /**
   * シーン別SEスケール (0.0〜1.0) を設定。
   * 永続化せず、画面遷移で一時的にSE音量を縮小する用途に使う (カジノ内のSE音量など)。
   * @param {number} scale
   */
  setSeVolumeScale(scale) {
    this._seVolumeScale = Math.max(0, Math.min(1, scale));
    if (this.seGain && this.ctx) {
      this.seGain.gain.setTargetAtTime(this.seVolume * this._seVolumeScale, this.ctx.currentTime, 0.05);
    }
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

  /** 拠点BGM開始（bgm_01〜06 シャッフル） */
  startGameBGM() {
    this.isTitleBGM = false;
    this.isRunBGM = false;
    this.currentAreaId = null;
    if (this.audioEl) this.audioEl.loop = false;
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

  // ===== ラン中BGM =====

  /** ラン中BGM開始 — エリア毎の固定曲をループ再生 */
  startRunBGM(areaId) {
    const track = RUN_TRACKS[areaId] || RUN_TRACK_DEFAULT;
    this.isTitleBGM = false;
    this.isBattleBGM = false;
    this.isRunBGM = true;
    this.currentAreaId = areaId;
    this._fadeOutThen(() => {
      this._playTrack(track);
      if (this.audioEl) this.audioEl.loop = true;
    }, 800);
  }

  // ===== バトルBGM =====

  /** エリア毎のボス戦BGMを開始 */
  startBossBGM(areaId) {
    const track = BOSS_TRACKS_BY_AREA[areaId] || BATTLE_TRACK_DEFAULT;
    this.startBattleBGM(track);
  }

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
      if (this.audioEl) this.audioEl.loop = this.isRunBGM;
      // 保存していた曲を再開、または次の曲を再生
      if (this.preBattleTrackSrc) {
        this._playTrack(this.preBattleTrackSrc);
        // 復帰位置を少し戻す（自然にする）
        if (this.audioEl) {
          this.audioEl.currentTime = Math.max(0, this.preBattleTrackTime - 2);
          this.audioEl.loop = this.isRunBGM;
        }
        this.preBattleTrackSrc = null;
      } else {
        this.playNextTrack();
      }
    }, 1200);
  }

  // ===== カジノBGM (BIG/REG/ART) =====

  /**
   * カジノ専用BGMを開始。スタックに現在の再生状態を積んでから切替。
   * @param {'big'|'reg'|'art'} kind
   */
  startCasinoBGM(kind) {
    const track = CASINO_TRACKS[kind];
    if (!track) return;
    if (this.audioEl) {
      this._casinoBgmStack.push({
        src: this.audioEl.src || '',
        time: this.audioEl.currentTime || 0,
      });
    }
    const token = ++this._casinoBgmPendingToken;
    this._fadeOutThen(() => {
      // 世代が進んでいたら (stop等で割り込まれた) キャンセル
      if (token !== this._casinoBgmPendingToken) return;
      this._playTrack(track);
      if (this.audioEl) this.audioEl.loop = true;
    }, 400);
  }

  /** カジノBGMを終了。スタックから直前の再生状態を復元。 */
  stopCasinoBGM() {
    if (this._casinoBgmStack.length === 0) return;
    const prev = this._casinoBgmStack.pop();
    const token = ++this._casinoBgmPendingToken;
    this._fadeOutThen(() => {
      if (token !== this._casinoBgmPendingToken) return;
      if (prev && prev.src) {
        this._playTrack(prev.src);
        if (this.audioEl) {
          this.audioEl.currentTime = Math.max(0, (prev.time || 0) - 0.5);
          this.audioEl.loop = true;
        }
      } else {
        // スタックエントリにsrcなし → 通常プレイリストへ
        this.playNextTrack();
      }
    }, 600);
  }

  /**
   * カジノBGMスタックを全部剥がして通常BGMへ戻す (画面離脱時の後始末)。
   * ネストされた ART→BONUS 状態から一度のフェードで通常BGMへ戻す。
   */
  drainCasinoBGM() {
    if (this._casinoBgmStack.length === 0) return;
    // 最下層の通常BGMエントリだけ残してネスト分は破棄
    const base = this._casinoBgmStack[0];
    this._casinoBgmStack.length = 0;
    this._casinoBgmStack.push(base);
    this.stopCasinoBGM();
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

  /** day:newDayイベント → フェードアウトして次の曲（拠点シャッフル時のみ） */
  _onNewDay() {
    if (this.isTitleBGM || this.isBattleBGM || this.isRunBGM) return;
    this._fadeOutThen(() => {
      this.playNextTrack();
    });
  }

  /** 進行中のフェードタイマーをキャンセル（競合で新トラックが停止されるのを防ぐ） */
  _cancelFade() {
    if (this._fadeTimeoutId !== null) {
      clearTimeout(this._fadeTimeoutId);
      this._fadeTimeoutId = null;
    }
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
    }
    this.isFading = false;
  }

  /** フェードアウトしてからコールバック実行 */
  _fadeOutThen(callback, durationMs = 2000) {
    if (!this.bgmGain) {
      callback();
      return;
    }
    // 既にフェード中なら打ち切って新しい要求を優先
    if (this.isFading) {
      this._cancelFade();
    }
    this.isFading = true;
    const now = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
    this.bgmGain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    this._fadeTimeoutId = setTimeout(() => {
      this._fadeTimeoutId = null;
      if (this.audioEl) {
        this.audioEl.pause();
      }
      // 音量復元
      this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
      this.isFading = false;
      callback();
    }, durationMs);
  }

  /** トラック再生（内部） */
  _playTrack(src) {
    if (!this.audioEl) return;

    // 進行中のフェードが残っていると直後にpause()されるのでキャンセル
    this._cancelFade();

    // プロシージャルBGMが動いてたら止める
    this._stopProcedural();

    // AudioContextが停止している場合は復帰
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

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

  /** 素材ピックアップ (通常品質) — 軽い "ピッ" */
  playMaterialPickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(820, now, 0.05, 'sine', 0.05);
    this._playSENote(1100, now + 0.02, 0.04, 'sine', 0.035);
  }

  /** 素材ピックアップ (高品質 / 良品〜優品) — 二音上昇の "チロン" */
  playMaterialPickupRare() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(880, now, 0.08, 'sine', 0.06);
    this._playSENote(1320, now + 0.04, 0.10, 'sine', 0.05);
    this._playSENote(1760, now + 0.10, 0.12, 'triangle', 0.04);
  }

  /** 素材ピックアップ (極上 / 特性付き) — 三音上昇 + キラキラ */
  playMaterialPickupSpecial() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 上昇アルペジオ
    this._playSENote(659, now, 0.08, 'triangle', 0.06);
    this._playSENote(880, now + 0.05, 0.10, 'triangle', 0.06);
    this._playSENote(1175, now + 0.10, 0.12, 'triangle', 0.06);
    this._playSENote(1568, now + 0.16, 0.18, 'sine', 0.07);
    // キラッ (高音アクセント)
    this._playSENote(2637, now + 0.22, 0.10, 'sine', 0.04);
    this._playSENote(3136, now + 0.28, 0.12, 'sine', 0.03);
  }

  /** 素材ピックアップ (伝説以上) — 短いファンファーレ + 倍音 */
  playMaterialPickupLegendary() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // メインのアルペジオ (Cmaj9 風)
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((f, i) => this._playSENote(f, now + i * 0.05, 0.25, 'triangle', 0.07));
    // ベル系の倍音
    this._playSENote(2093, now + 0.20, 0.30, 'sine', 0.05);
    this._playSENote(2637, now + 0.26, 0.30, 'sine', 0.04);
    this._playSENote(3136, now + 0.32, 0.30, 'sine', 0.03);
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

    const nodeGroup = { source, filter, gain, createdAt: this.ctx.currentTime, duration: duration + 0.05 };
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
    // 作成時刻 + 再生時間を超過したノードを安全に除去
    const now = this.ctx?.currentTime || 0;
    const stale = this._activeSeNodes.filter(n => {
      return n.createdAt != null && now > n.createdAt + (n.duration || 2) + 0.5;
    });
    for (const n of stale) {
      try { n.source.disconnect(); if (n.filter) n.filter.disconnect(); n.gain.disconnect(); } catch { /* */ }
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

  // ===== スロット専用SE (NES/ファミコン風チップチューン — 矩形波/三角波/ノイズのみ) =====

  /**
   * SE同時発音数の上限を一時的に変更する。
   * スロット画面のように短時間にSEが集中する場面で呼び出し、離脱時に復元する。
   * @param {number} n
   */
  setSeNodeBudget(n) {
    const value = Math.max(4, Math.min(32, Math.floor(n)));
    this._maxSeNodes = value;
  }

  /** レバーON — 8bit「ドンッ」 低音トライアングル + 矩形 + ノイズ */
  playSlotLever() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(110, now,        0.05, 'triangle', 0.14);
    this._playSENote(70,  now + 0.03, 0.10, 'triangle', 0.12);
    this._playSENote(220, now,        0.05, 'square',   0.07);
    this._playNoiseBurst(now, 0.05, 0.08);
  }

  /** リール停止 — 短くクリスプな「カッ」 矩形+ノイズ (全リール共通) */
  playSlotReelStop() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(440, now, 0.03, 'square', 0.09);
    this._playNoiseBurst(now, 0.025, 0.05);
  }

  /** BET — Mario風コイン音 (B5→E6 矩形波2音上昇) */
  playSlotBet() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(987.77,  now,        0.04, 'square', 0.08);  // B5
    this._playSENote(1318.51, now + 0.04, 0.12, 'square', 0.07);  // E6
  }

  /**
   * テンパイ/リーチ — 8bitアルペジオ
   * @param {1|2|3} level  1=弱(保持音), 2=強(2音上昇), 3=プレミア(完全5度アルペジオ)
   */
  playSlotTenpai(level = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (level >= 3) {
      // プレミア: ソ-シ-レ-ソ(完全5度アルペジオ) + ノイズアクセント
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) =>
        this._playSENote(f, now + i * 0.07, 0.14, 'square', 0.10)
      );
      this._playSENote(1567.98, now + 0.32, 0.30, 'triangle', 0.08);
      this._playNoiseBurst(now, 0.03, 0.04);
    } else if (level === 2) {
      // 強: ミ→シ 完全5度ジャンプ
      this._playSENote(659.25, now,        0.10, 'square', 0.10);
      this._playSENote(987.77, now + 0.12, 0.25, 'square', 0.10);
    } else {
      // 弱: 保持音トレモロ (矩形でチープに)
      this._playSENote(783.99, now,        0.10, 'square', 0.09);
      this._playSENote(783.99, now + 0.14, 0.20, 'square', 0.07);
    }
  }

  /** CHANCE目 — NES「アイテム入手」風3音上昇 */
  playSlotChanceMoku() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(987.77,  now,        0.06, 'square', 0.08);
    this._playSENote(1318.51, now + 0.05, 0.06, 'square', 0.07);
    this._playSENote(1567.98, now + 0.10, 0.10, 'square', 0.06);
  }

  /**
   * 内部成立告知 — ボーナス種別で音色変化 (全て矩形波のみ)
   * @param {'big'|'reg'|'blue7'} [kind]
   */
  playSlotBonusInternal(kind = 'big') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (kind === 'blue7') {
      // 青7: 高速アルペジオ + トライアングル余韻
      [1046.50, 1318.51, 1567.98, 2093.00, 2637.02].forEach((f, i) =>
        this._playSENote(f, now + i * 0.05, 0.08, 'square', 0.09)
      );
      this._playSENote(1318.51, now + 0.35, 0.35, 'triangle', 0.08);
      this._playNoiseBurst(now, 0.04, 0.05);
    } else if (kind === 'reg') {
      // REG: 控えめ2音 (ソ→レ 完全4度上昇)
      this._playSENote(783.99,  now,        0.10, 'square', 0.09);
      this._playSENote(1174.66, now + 0.12, 0.22, 'square', 0.08);
    } else {
      // BIG (デフォルト): Mario 1-UP風 6音ファンファーレ (ミ-ソ-ミ6-ド6-レ6-ソ6)
      const big = [659.25, 783.99, 1318.51, 1046.50, 1174.66, 1567.98];
      big.forEach((f, i) => this._playSENote(f, now + i * 0.07, 0.09, 'square', 0.10));
    }
  }

  /** ART突入ジングル — 明るい4音上昇 (ミ-ソ-シ-ミ6) 矩形+トライアングル余韻 */
  playSlotArtStart() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [659.25, 783.99, 987.77, 1318.51].forEach((f, i) =>
      this._playSENote(f, now + i * 0.07, 0.11, 'square', 0.10)
    );
    this._playSENote(1318.51, now + 0.28, 0.25, 'triangle', 0.08);
  }

  /** ART終了 — 2音下降 (レ→ラ) 矩形のみ */
  playSlotArtEnd() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(1174.66, now,        0.12, 'square', 0.08);
    this._playSENote(880.00,  now + 0.13, 0.22, 'square', 0.08);
  }

  /** ART上乗せ — 短い3音上昇「チャリン♪」 */
  playSlotArtAdd() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playSENote(1318.51, now,        0.05, 'square', 0.08);
    this._playSENote(1567.98, now + 0.04, 0.06, 'square', 0.07);
    this._playSENote(2093.00, now + 0.08, 0.10, 'square', 0.06);
  }

  /** フリーズ演出 — 8bitボス登場風 (トライアングル低音 + 矩形スウィープ + ノイズ) */
  playSlotFreeze() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // トライアングル低音ランブル (sine代わり)
    this._playSENote(55, now,        0.75, 'triangle', 0.14);
    this._playSENote(82, now + 0.05, 0.65, 'triangle', 0.10);
    // 矩形波でステップ状スウィープ (NES風の階段的ピッチ)
    [196, 392, 784, 1175, 1568].forEach((f, i) =>
      this._playSENote(f, now + 0.10 + i * 0.11, 0.09, 'square', 0.06)
    );
    // 突入ノイズ (長め)
    this._playNoiseBurst(now, 0.15, 0.08);
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

    const nodeGroup = { source: osc, gain, createdAt: this.ctx.currentTime, duration: duration + 0.1 };
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
