/**
 * BossRushManager — ボスラッシュモードの進行管理
 *
 * 全7エリアのボスを連続戦。HP/装備/Lv 持ち越し、ボス間ロビーで30秒の小休憩。
 * RunManager と協調動作する: BossRushManager は順序とフェーズ進行を握り、
 * 戦闘ロジックは RunManager / BossSystem / EnemySpawner に委譲する。
 */

import { eventBus } from '../core/EventBus.js';

/** ボスラッシュ順序（推奨難度順）。areaId + boss/エリアスタイルで再利用 */
export const BOSS_RUSH_ORDER = [
  'plains',
  'cave',
  'forest',
  'volcano',
  'deep_sea',
  'dragon_nest',
  'sky_tower',
];

/** ボス間ロビー長 (秒) */
export const LOBBY_DURATION = 30;

/** ボス間 HP 回復割合（最大HPの%） */
export const LOBBY_HP_RESTORE_RATIO = 0.3;

/** 段階報酬（撃破数→報酬種別） */
export const TIER_REWARDS = {
  3: { gold: 5000, label: '金貨袋' },
  5: { gold: 8000, label: '希少素材券', material: 'fairy_dust' },
  7: { gold: 15000, label: '伝説のペット卵', petEggBlueprintId: 'pet_egg_dragonling' },
};

export class BossRushManager {
  constructor() {
    /** 現在のボスインデックス（0-based） */
    this.currentBossIndex = 0;
    /** 撃破した数 */
    this.defeatedCount = 0;
    /** 'boss' | 'lobby' | 'ended' */
    this.phase = 'boss';
    /** ロビー残り時間（秒） */
    this.lobbyRemaining = 0;
    /** ラッシュ全体の経過時間 */
    this.totalElapsed = 0;
    this.startedAt = Date.now();
    this.endReason = null;
    this._endResolved = false;
  }

  /** 現在挑戦中のエリアID */
  getCurrentAreaId() {
    return BOSS_RUSH_ORDER[this.currentBossIndex] || null;
  }

  /** 残りボス数 */
  getRemaining() {
    return BOSS_RUSH_ORDER.length - this.currentBossIndex;
  }

  /** ボス撃破。ロビーへ移行 or 全クリア */
  onBossDefeated() {
    this.defeatedCount += 1;
    this.currentBossIndex += 1;

    if (this.currentBossIndex >= BOSS_RUSH_ORDER.length) {
      this.phase = 'ended';
      this.endReason = 'cleared';
      eventBus.emit('bossrush:cleared', this._snapshot());
      return { type: 'cleared' };
    }

    this.phase = 'lobby';
    this.lobbyRemaining = LOBBY_DURATION;
    eventBus.emit('bossrush:lobby:start', {
      remaining: this.getRemaining(),
      defeated: this.defeatedCount,
      nextAreaId: this.getCurrentAreaId(),
      duration: LOBBY_DURATION,
    });
    return { type: 'lobby', nextAreaId: this.getCurrentAreaId() };
  }

  /** ロビー進行。タイマー切れで戦闘再開を返す */
  updateLobby(dt) {
    if (this.phase !== 'lobby') return null;
    this.lobbyRemaining -= dt;
    if (this.lobbyRemaining <= 0) {
      this.lobbyRemaining = 0;
      this.phase = 'boss';
      eventBus.emit('bossrush:lobby:end', { nextAreaId: this.getCurrentAreaId() });
      return { type: 'resume' };
    }
    return null;
  }

  /** プレイヤー死亡で終了 */
  onPlayerDied() {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endReason = 'death';
    eventBus.emit('bossrush:failed', this._snapshot());
  }

  /** 報酬計算（クリア/失敗の双方で部分報酬を返す） */
  calculateRewards() {
    const tiers = Object.keys(TIER_REWARDS).map(Number).sort((a, b) => a - b);
    const earnedTiers = [];
    for (const tier of tiers) {
      if (this.defeatedCount >= tier) earnedTiers.push({ tier, ...TIER_REWARDS[tier] });
    }
    return earnedTiers;
  }

  _snapshot() {
    return {
      defeated: this.defeatedCount,
      total: BOSS_RUSH_ORDER.length,
      elapsed: this.totalElapsed,
      reason: this.endReason,
    };
  }
}
