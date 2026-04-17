/**
 * Alchemy Survivors — メインエントリポイント
 * シーン管理: title → hub → run → result → hub
 */

import { eventBus } from './core/EventBus.js';
import { SoundManager } from './core/SoundManager.js';
import { InventorySystem } from './InventorySystem.js';
import { SaveSystem } from './core/SaveSystem.js';
import { PlayFabClient } from './core/PlayFabClient.js';
import { Recipes } from './data/items.js';
import { AreaDefs } from './data/areas.js';
import { GameConfig } from './data/config.js';
import { createItemInstance } from './ItemSystem.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { HubManager } from './hub/HubManager.js';
import { RunManager } from './run/RunManager.js';
import { RunHUD } from './ui/RunHUD.js';
import { LevelUpModal } from './ui/LevelUpModal.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { RunResultScreen } from './ui/RunResultScreen.js';
import { AchievementSystem } from './AchievementSystem.js';
import { TutorialOverlay } from './ui/TutorialOverlay.js';
import { initTraitTooltipTap } from './ui/UIHelpers.js';
import { GameTooltip } from './ui/GameTooltip.js';
import { RunPickupToasts } from './ui/RunPickupToasts.js';
import { EquipmentPresetsManager } from './hub/EquipmentPresets.js';
import { DisplayNamePrompt, shouldPromptDisplayName } from './ui/DisplayNamePrompt.js';
import { initPwaRuntime, applyPwaUpdate } from './core/pwaRuntime.js';
import { CASINO_ENABLED, CasinoManager } from './casino/index.js';

class Game {
  constructor() {
    this.uiRoot = document.getElementById('ui-root');
    this.canvas = document.getElementById('game-canvas');
    this.scene = 'title'; // 'title' | 'hub' | 'run' | 'result'

    // ゲーム状態
    this.inventory = null;
    this.saveSystem = null;
    this.weaponSlots = [null, null, null, null];
    this.equippedArmor = null;
    this.equippedAccessory = null;
    this.savedConsumableUids = [];
    this.lastSelectedAreaId = null;
    this.presetsManager = new EquipmentPresetsManager([]);
    this.stats = {
      totalRuns: 0,
      totalKills: 0,
      bestSurvivalTime: 0,
      totalMaterialsCollected: 0,
      totalGoldEarned: 0,
      totalBossesDefeated: 0,
      totalDeaths: 0,
      totalSurvivals: 0,
      totalCrafted: 0,
      totalPlayTime: 0,
      highestLevel: 0,
      highestDamageDealt: 0,
      perArea: {},
      perWeaponType: {},
      hardModeClears: 0,
      challengeClears: 0,
      nightmareClears: 0,
      firstPlayDate: null,
    };

    // 実績
    this.achievements = null;

    // アクティブなUI/システム
    this.hubManager = null;
    this.runManager = null;
    this.runHUD = null;
    this.levelUpModal = null;
    this.resultScreen = null;

    // イベント購読
    eventBus.on('run:start', (data) => this._startRun(data));
    eventBus.on('run:complete', (data) => this._onRunComplete(data));
    eventBus.on('result:continue', (data) => this._returnToHub(data));
    eventBus.on('equipment:changed', ({ weaponSlots, armor, accessory }) => { this.weaponSlots = [...weaponSlots]; this.equippedArmor = armor; this.equippedAccessory = accessory; });
    eventBus.on('consumables:selected', ({ uids }) => { this.savedConsumableUids = [...(uids || [])]; });
    eventBus.on('area:selected', ({ areaId }) => { this.lastSelectedAreaId = areaId || null; });
    eventBus.on('save:request', () => { try { this._autoSave(); } catch (e) { /* ignore */ } });

    // 属性コンボ発動時: ラン中の初回のみトーストで教える
    this._seenCombosThisRun = new Set();
    eventBus.on('combo:fired', ({ combo }) => {
      if (!combo || this._seenCombosThisRun.has(combo.id)) return;
      this._seenCombosThisRun.add(combo.id);
      eventBus.emit('toast', {
        message: `${combo.icon} 属性コンボ「${combo.name}」発動!`,
        type: 'success',
      });
    });
    // ラン終了時にセット解放
    eventBus.on('run:complete', () => { this._seenCombosThisRun = new Set(); });

    // インベントリからUIDが消えたら装備欄もクリア（クラフト・売却・消費で発生）
    eventBus.on('inventory:uidsRemoved', ({ uids }) => {
      const uidSet = new Set(uids);
      let changed = false;
      for (let i = 0; i < this.weaponSlots.length; i++) {
        if (this.weaponSlots[i] && uidSet.has(this.weaponSlots[i].uid)) {
          this.weaponSlots[i] = null; changed = true;
        }
      }
      if (this.equippedArmor && uidSet.has(this.equippedArmor.uid)) { this.equippedArmor = null; changed = true; }
      if (this.equippedAccessory && uidSet.has(this.equippedAccessory.uid)) { this.equippedAccessory = null; changed = true; }
      // 消耗品選択からも消えたUIDを除外
      if (this.savedConsumableUids.length > 0) {
        const filtered = this.savedConsumableUids.filter(uid => !uidSet.has(uid));
        if (filtered.length !== this.savedConsumableUids.length) this.savedConsumableUids = filtered;
      }
      if (changed) {
        eventBus.emit('equipment:changed', { weaponSlots: this.weaponSlots, armor: this.equippedArmor, accessory: this.equippedAccessory });
        eventBus.emit('toast', { message: '⚠️ 消費した素材が装備欄から外されました', type: 'warning' });
      }
      // プリセット内の消失UIDも静かにクリーンアップ
      this.presetsManager.cleanupRemovedUids(uidSet);
    });

    // プリセット操作
    eventBus.on('preset:create', ({ name }) => {
      const preset = this.presetsManager.createFromCurrent(name, {
        weaponSlots: this.weaponSlots,
        armor: this.equippedArmor,
        accessory: this.equippedAccessory,
      });
      if (preset) {
        eventBus.emit('toast', { message: `✨ プリセット「${preset.name}」を保存しました`, type: 'success' });
        this._autoSave();
        eventBus.emit('preset:changed');
      } else {
        eventBus.emit('toast', { message: `プリセットは最大${this.presetsManager.maxPresets}個までです`, type: 'error' });
      }
    });
    eventBus.on('preset:overwrite', ({ id }) => {
      if (this.presetsManager.overwrite(id, {
        weaponSlots: this.weaponSlots,
        armor: this.equippedArmor,
        accessory: this.equippedAccessory,
      })) {
        eventBus.emit('toast', { message: '💾 プリセットを上書きしました', type: 'success' });
        this._autoSave();
        eventBus.emit('preset:changed');
      }
    });
    eventBus.on('preset:rename', ({ id, name }) => {
      if (this.presetsManager.rename(id, name)) {
        this._autoSave();
        eventBus.emit('preset:changed');
      }
    });
    eventBus.on('preset:delete', ({ id }) => {
      if (this.presetsManager.remove(id)) {
        eventBus.emit('toast', { message: '🗑 プリセットを削除しました', type: 'default' });
        this._autoSave();
        eventBus.emit('preset:changed');
      }
    });
    eventBus.on('preset:apply', ({ id }) => {
      const resolved = this.presetsManager.resolve(id, this.inventory);
      if (!resolved) return;
      this.weaponSlots = [...resolved.weaponSlots];
      this.equippedArmor = resolved.armor;
      this.equippedAccessory = resolved.accessory;
      eventBus.emit('equipment:changed', {
        weaponSlots: this.weaponSlots,
        armor: this.equippedArmor,
        accessory: this.equippedAccessory,
      });
      if (resolved.missingCount > 0) {
        eventBus.emit('toast', {
          message: `⚠️ プリセット内の ${resolved.missingCount} 個のアイテムが見つかりません (空スロットで適用)`,
          type: 'warning',
        });
      } else {
        eventBus.emit('toast', { message: '🔄 プリセットを適用しました', type: 'success' });
      }
      this._autoSave();
    });

    // レベルアップ選択の橋渡し
    eventBus.on('levelup:choose', ({ passiveId }) => {
      if (this.runManager?.levelUp) {
        this.runManager.levelUp.selectPassive(passiveId);
      }
    });

    // SE
    eventBus.on('item:crafted', () => { SoundManager.playCraftSuccess(); this.stats.totalCrafted++; });
    // ボス撃破だけは重め(playBattleKO)、通常敵は軽め(playBattleAdvAttack)に差別化
    eventBus.on('enemy:killed', ({ isBoss }) => {
      if (isBoss) SoundManager.playBattleKO?.() || SoundManager.playBattleAdvAttack();
      else SoundManager.playBattleAdvAttack();
    });
    eventBus.on('player:damaged', () => SoundManager.playBattleDamage());
    eventBus.on('player:died', () => SoundManager.playGameOver?.() || SoundManager.playBattleDefeat?.());
    eventBus.on('levelup:show', () => SoundManager.playLevelUp());
    eventBus.on('boss:spawned', () => SoundManager.playEventChime());
    eventBus.on('weapon:unlocked', () => SoundManager.playFanfare?.());
    eventBus.on('area:unlocked', () => SoundManager.playFanfare?.());
    eventBus.on('skill:activated', () => SoundManager.playBattleBuff?.());
    eventBus.on('player:dashed', () => SoundManager.playHover?.());
    // 消耗品: type 別に分岐
    eventBus.on('consumable:used', ({ type }) => {
      if (type === 'heal') SoundManager.playBattleHeal?.();
      else if (type === 'buff') SoundManager.playBattleBuff?.();
      else if (type === 'damage') SoundManager.playBattleBossAttack?.();
      else if (type === 'debuff') SoundManager.playBattleDebuff?.();
      else if (type === 'stun') SoundManager.playBattleStun?.();
      else SoundManager.playBattleItemUse?.();
    });
    // 経験値収集: 連続取得時の重複発火を抑制（16ms以内はマージ）
    let _lastExpSeAt = 0;
    eventBus.on('exp:collected', () => {
      const now = performance.now();
      if (now - _lastExpSeAt < 16) return;
      _lastExpSeAt = now;
      SoundManager.playMaterialPickup?.();
    });
    eventBus.on('boss:defeated', ({ bossId }) => {
      SoundManager.playBattleVictory();
      // ボスBGM → ラン中BGMに復帰
      SoundManager.stopBattleBGM();
      // ラン中のクラッシュで解放が失われないように即時チェックポイントセーブ
      if (this.saveSystem) {
        try {
          this._autoSave();
          // ボス撃破は重要な進行なのでクラウドへも即時プッシュ
          this.saveSystem.flushCloudSaveNow().catch(() => {});
        } catch (e) { /* save 失敗は致命的でないので握りつぶす */ }
      }
    });

    // ページ離脱時: 保留中のクラウドプッシュを試行
    window.addEventListener('pagehide', () => {
      if (this.saveSystem) this.saveSystem.flushCloudSaveNow().catch(() => {});
    });
    eventBus.on('boss:intro', ({ name }) => {
      // 死神以外はエリア毎のボスBGMに切替
      if (name !== '死神' && this.runManager?.areaId) {
        SoundManager.startBossBGM(this.runManager.areaId);
      }
    });

    // トースト通知
    eventBus.on('toast', ({ message, type }) => {
      this._showToast(message, type);
    });
  }

  async start() {
    // タッチ端末用: 特性ツールチップのタップ開閉
    initTraitTooltipTap();
    // data-tooltip 属性ベースの汎用ツールチップ (属性バッジ等)
    GameTooltip.init();

    // PWA ランタイム初期化 (インストールプロンプト / online 復帰時再送 / SW更新検知)
    initPwaRuntime({ getSaveSystem: () => this.saveSystem });

    // 新バージョン検知 → プレイ中でなければ即適用、プレイ中は通知のみ
    eventBus.on('pwa:updateAvailable', () => {
      const inRun = !!this.runManager;
      if (inRun) {
        // プレイ中断はしない。次回起動時に新バージョンで起動するよう案内のみ。
        this._showToast('🆕 新しいバージョンがあります（次回起動時に反映）', 'default');
      } else {
        // ハブ画面等ならボタン付きトーストで即リロード選択可能
        this._showUpdateToast();
      }
    });

    // PlayFab 初期化（Title ID 未設定ならスキップされる）
    const pfReady = PlayFabClient.initialize();
    if (pfReady) {
      // 起動時にクラウド側のセーブを取りに行き、より新しければ localStorage に反映
      // TitleScreen は localStorage を読むので、事前に反映することでコンティニュー表示が正しくなる
      await this._bootCloudSync();
    }

    // タイトル画面表示
    this._showTitle();
  }

  /** 起動時のクラウド同期: タイムアウト付きで試行し、失敗しても続行 */
  async _bootCloudSync() {
    const SYNC_TIMEOUT_MS = 4000;
    // 一時 SaveSystem で同期だけ実行（inventory は不要）
    const tempSave = new SaveSystem({ items: [], gold: 0, maxCapacity: 0 });
    try {
      const result = await Promise.race([
        tempSave.syncOnBoot(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SYNC_TIMEOUT_MS)),
      ]);
      if (result.source === 'cloud' && result.data) {
        // クラウドデータが採用された → localStorage に書き戻し
        localStorage.setItem('alchemy_survivors_save_v1', JSON.stringify(result.data));
        if (result.conflict) {
          console.info('[Game] Cloud save adopted over local (newer timestamp). Local backed up.');
        }
      }
      // 表示名をサーバから取得しておく（他デバイスで設定済みの場合に備える）
      try { await PlayFabClient.fetchDisplayName(); } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('[Game] Boot cloud sync skipped:', e.message || e);
    }
  }

  _showTitle() {
    this.scene = 'title';
    this.canvas.style.display = 'none';
    this._clearUI();

    new TitleScreen(this.uiRoot, (mode) => {
      SoundManager.init();
      this._initGame(mode);
    });
  }

  _initGame(mode) {
    this.inventory = new InventorySystem();
    this.saveSystem = new SaveSystem(this.inventory);
    // クラウド同期ステータスをトーストで通知
    this.saveSystem.setCloudSyncListener((event, detail) => {
      if (event === 'error' && detail?.phase === 'push') {
        this._showToast('☁ クラウド保存に失敗しました（次回再試行）', 'warning');
      }
    });

    // カジノ機能の初期化（CASINO_ENABLED=false なら何もしない）
    if (CASINO_ENABLED) {
      CasinoManager.getInstance().init(this.inventory);
    }

    if (mode === 'continue') {
      const data = this.saveSystem.load();
      // applySaveData はバージョン不一致/破損時に false を返す。その場合は新規ゲーム扱いにフォールバックする
      const saveData = data ? this.saveSystem.applySaveData(data) : null;
      if (saveData) {
        this.stats = saveData.stats || this.stats;
        // 装備復元
        if (saveData.restoredEquipment) {
          this.weaponSlots = saveData.restoredEquipment.weaponSlots;
          this.equippedArmor = saveData.restoredEquipment.armor;
          this.equippedAccessory = saveData.restoredEquipment.accessory;
        }
        // 消耗品選択UIDを復元（インベントリにまだ存在するものだけ）
        if (saveData.savedConsumableUids) {
          this.savedConsumableUids = saveData.savedConsumableUids.filter(
            uid => this.inventory.getItemByUid(uid)
          );
        }
        // 前回選択したステージを復元
        if (saveData.lastSelectedAreaId) {
          this.lastSelectedAreaId = saveData.lastSelectedAreaId;
        }
        // 装備プリセット復元
        if (saveData.equipmentPresets) {
          this.presetsManager = new EquipmentPresetsManager(saveData.equipmentPresets);
        }
        // 実績復元
        this.achievements = new AchievementSystem(this.stats, saveData.achievements || []);
        // カジノstate復元（CASINO_ENABLED=false時はスキップ）
        if (CASINO_ENABLED) {
          CasinoManager.getInstance().hydrate(saveData.casino);
        }
      } else {
        // セーブ破損/非対応バージョン: 実績だけでも空で初期化してクラッシュ回避
        if (data) {
          console.warn('[Game] Save data is invalid or from an unsupported version. Starting fresh.');
          eventBus.emit('toast', {
            message: '⚠️ セーブデータを読み込めませんでした。新規データで開始します。',
            type: 'warning',
          });
        }
        this.achievements = new AchievementSystem(this.stats, []);
      }
    } else {
      // ニューゲーム: 初期装備（石斧）を武器スロット1に自動装備
      const axe = this.inventory.items.find(i => i.blueprintId === 'stone_axe');
      if (axe) {
        this.weaponSlots = [axe, null, null, null];
      }
      this.achievements = new AchievementSystem(this.stats, []);
      this.tutorialCompleted = false;
    }

    this._showHub();

    // ニューゲーム時にチュートリアル表示
    if (mode === 'new' && !this.tutorialCompleted) {
      new TutorialOverlay(this.uiRoot, () => {
        this.tutorialCompleted = true;
      });
    }
  }

  _showHub() {
    this.scene = 'hub';
    this.canvas.style.display = 'none';
    this._clearUI();

    this.hubManager = new HubManager(this.uiRoot, this.inventory, this.stats, this.achievements);
    this.hubManager.weaponSlots = [...this.weaponSlots];
    this.hubManager.equippedArmor = this.equippedArmor;
    this.hubManager.equippedAccessory = this.equippedAccessory;
    this.hubManager.savedConsumableUids = [...this.savedConsumableUids];
    this.hubManager.lastSelectedAreaId = this.lastSelectedAreaId;
    this.hubManager.presetsManager = this.presetsManager;
    this.hubManager.render();

    // 自動セーブ
    this._autoSave();
    SoundManager.startGameBGM();

    // 初回ハブ到達時に表示名入力を促す（1 回だけ、スキップ可）
    if (!this._displayNamePrompted && shouldPromptDisplayName()) {
      this._displayNamePrompted = true;
      // 少し遅延して他の UI 初期化を待つ
      setTimeout(() => {
        new DisplayNamePrompt(this.uiRoot, () => { /* モーダル閉じたら何もしない */ });
      }, 500);
    }
  }

  _startRun({ weaponSlots, areaId, consumables, difficulty, hardMode }) {
    this.scene = 'run';
    // 出撃したステージを記憶（次回の出撃準備画面で初期選択）
    if (areaId) this.lastSelectedAreaId = areaId;
    this._clearUI();

    // Canvas表示
    this.canvas.style.display = 'block';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // 難易度の解決: 新APIの difficulty 文字列を優先、無ければ旧 hardMode boolean を変換
    const resolvedDifficulty = difficulty || (hardMode ? 'hard' : 'normal');

    // ランシステム初期化
    this.runManager = new RunManager(this.canvas, weaponSlots, areaId, this.equippedArmor, this.equippedAccessory, consumables || [], resolvedDifficulty);

    // ランUI
    this.runHUD = new RunHUD(this.uiRoot);
    this.levelUpModal = new LevelUpModal(this.uiRoot);
    this.pauseMenu = new PauseMenu(this.uiRoot, this.runManager);
    this.runPickupToasts = new RunPickupToasts();

    // ラン開始
    this.runManager.start();
    SoundManager.startRunBGM(areaId);
    this.stats.totalRuns++;
  }

  _onRunComplete(resultData) {
    this.scene = 'result';

    // ランUI片付け
    if (this.runHUD) { this.runHUD.destroy(); this.runHUD = null; }
    if (this.levelUpModal) { this.levelUpModal.destroy(); this.levelUpModal = null; }
    if (this.pauseMenu) { this.pauseMenu.destroy(); this.pauseMenu = null; }
    if (this.runPickupToasts) { this.runPickupToasts.destroy(); this.runPickupToasts = null; }
    if (this.runManager) { this.runManager.destroy(); this.runManager = null; }

    this.canvas.style.display = 'none';

    // 統計更新
    this.stats.totalKills += resultData.killCount;
    this.stats.totalMaterialsCollected += resultData.materials.length;
    this.stats.totalGoldEarned += resultData.goldEarned || 0;
    this.stats.totalPlayTime += resultData.elapsed || 0;
    if (resultData.elapsed > this.stats.bestSurvivalTime) {
      this.stats.bestSurvivalTime = resultData.elapsed;
    }
    if ((resultData.level || 0) > this.stats.highestLevel) {
      this.stats.highestLevel = resultData.level;
    }
    if ((resultData.highestDamage || 0) > this.stats.highestDamageDealt) {
      this.stats.highestDamageDealt = resultData.highestDamage;
    }
    if (resultData.reason === 'death') {
      this.stats.totalDeaths++;
    } else if (resultData.reason === 'timeout' || resultData.reason === 'clear') {
      this.stats.totalSurvivals++;
    }
    if (resultData.bossDefeated) {
      this.stats.totalBossesDefeated++;
    }
    const cleared = (resultData.reason === 'timeout' || resultData.reason === 'clear');
    if (cleared) {
      const diff = resultData.difficulty || (resultData.hardMode ? 'hard' : 'normal');
      if (diff === 'hard')      this.stats.hardModeClears++;
      if (diff === 'challenge') this.stats.challengeClears = (this.stats.challengeClears || 0) + 1;
      if (diff === 'nightmare') this.stats.nightmareClears = (this.stats.nightmareClears || 0) + 1;
    }
    // エリア別統計
    const areaId = resultData.areaId;
    if (areaId) {
      if (!this.stats.perArea[areaId]) {
        this.stats.perArea[areaId] = { runs: 0, clears: 0, bestTime: 0, kills: 0 };
      }
      const areaStats = this.stats.perArea[areaId];
      areaStats.runs++;
      areaStats.kills += resultData.killCount;
      if (resultData.reason === 'timeout' || resultData.reason === 'clear') areaStats.clears++;
      if (resultData.elapsed > areaStats.bestTime) areaStats.bestTime = resultData.elapsed;
    }
    // 武器種別統計
    if (resultData.weaponTypesUsed) {
      for (const wtype of resultData.weaponTypesUsed) {
        if (!this.stats.perWeaponType[wtype]) {
          this.stats.perWeaponType[wtype] = { runsUsed: 0, kills: 0 };
        }
        this.stats.perWeaponType[wtype].runsUsed++;
      }
    }
    if (!this.stats.firstPlayDate) {
      this.stats.firstPlayDate = Date.now();
    }

    // 実績チェック
    if (this.achievements) this.achievements.check();

    // サーバ検証経由で統計送信（失敗しても体験に影響させない）
    this._submitRunResultToServer(resultData);

    // リザルト画面表示
    this.resultScreen = new RunResultScreen(this.uiRoot);
    this.resultScreen.show(resultData);
  }

  /**
   * Azure Functions 経由で統計を送信。
   * サーバ側で妥当性検証 → 合格時のみ PlayFab Statistics を更新する。
   */
  _submitRunResultToServer(resultData) {
    if (!PlayFabClient.isAvailable()) return;
    const payload = {
      survivalTime: Math.floor(resultData.elapsed || 0),
      killCount: resultData.killCount || 0,
      highestDamage: resultData.highestDamage || 0,
      level: resultData.level || 0,
      goldEarned: resultData.goldEarned || 0,
      hardMode: !!resultData.hardMode,
      bossDefeated: !!resultData.bossDefeated,
      reason: resultData.reason || 'death',
      areaId: resultData.areaId || null,
    };
    PlayFabClient.executeFunction('submitRunResult', payload)
      .then((data) => {
        const body = data?.FunctionResult;
        if (body && body.accepted === false) {
          console.warn('[Game] Run result rejected by server:', body.reason);
        }
      })
      .catch((e) => {
        console.warn('[Game] submitRunResult failed:', e.message || e);
      });
  }

  _returnToHub(resultData) {
    // ゴールド追加
    if (resultData.goldEarned) {
      this.inventory.addGold(resultData.goldEarned);
    }

    // 獲得素材をインベントリに追加
    if (resultData.materials) {
      this.inventory.beginBatch();
      for (const mat of resultData.materials) {
        const item = createItemInstance(mat.blueprintId, mat.quality, mat.traits || []);
        this.inventory.forceAddItem(item);
      }
      this.inventory.endBatch();
    }

    if (this.resultScreen) { this.resultScreen.destroy(); this.resultScreen = null; }

    this._showHub();
  }

  _showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `game-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /** PWA 更新通知: 再読込ボタン付き、ユーザー操作で消えるまで表示 */
  _showUpdateToast() {
    // 多重表示を防止
    if (document.querySelector('.game-toast.pwa-update-toast')) return;
    const toast = document.createElement('div');
    toast.className = 'game-toast toast-success pwa-update-toast';
    toast.innerHTML = `
      <span class="pwa-update-text">🆕 新しいバージョンがあります</span>
      <button class="pwa-update-btn" type="button">再読込</button>
      <button class="pwa-update-close" type="button" aria-label="閉じる">✕</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);

    const close = () => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.pwa-update-btn').addEventListener('click', () => {
      applyPwaUpdate();
    });
    toast.querySelector('.pwa-update-close').addEventListener('click', close);
  }

  _clearUI() {
    if (this.hubManager) { this.hubManager.destroy(); this.hubManager = null; }
    if (this.runHUD) { this.runHUD.destroy(); this.runHUD = null; }
    if (this.levelUpModal) { this.levelUpModal.destroy(); this.levelUpModal = null; }
    if (this.pauseMenu) { this.pauseMenu.destroy(); this.pauseMenu = null; }
    if (this.runPickupToasts) { this.runPickupToasts.destroy(); this.runPickupToasts = null; }
    if (this.resultScreen) { this.resultScreen.destroy(); this.resultScreen = null; }
    this.uiRoot.innerHTML = '';
  }

  _autoSave() {
    this.saveSystem.save({
      equippedWeaponUids: this.weaponSlots.map(w => w?.uid || null),
      equippedArmorUid: this.equippedArmor?.uid || null,
      equippedAccessoryUid: this.equippedAccessory?.uid || null,
      savedConsumableUids: [...this.savedConsumableUids],
      lastSelectedAreaId: this.lastSelectedAreaId,
      stats: this.stats,
      achievements: this.achievements ? this.achievements.getUnlockedIds() : [],
      equipmentPresets: this.presetsManager.toJSON(),
      casino: CASINO_ENABLED ? CasinoManager.getInstance().serialize() : null,
    });
  }
}

// --- ブート ---
const game = new Game();
game.start();
