/**
 * Alchemy Survivors — メインエントリポイント
 * シーン管理: title → hub → run → result → hub
 */

import { eventBus } from './core/EventBus.js';
import { SoundManager } from './core/SoundManager.js';
import { InventorySystem } from './InventorySystem.js';
import { SaveSystem } from './core/SaveSystem.js';
import { Recipes } from './data/items.js';
import { AreaDefs } from './data/areas.js';
import { GameConfig } from './data/config.js';
import { createItemInstance } from './ItemSystem.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { HubManager } from './hub/HubManager.js';
import { RunManager } from './run/RunManager.js';
import { RunHUD } from './ui/RunHUD.js';
import { LevelUpModal } from './ui/LevelUpModal.js';
import { RunResultScreen } from './ui/RunResultScreen.js';
import { AchievementSystem } from './AchievementSystem.js';
import { TutorialOverlay } from './ui/TutorialOverlay.js';

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
      if (changed) {
        eventBus.emit('equipment:changed', { weaponSlots: this.weaponSlots, armor: this.equippedArmor, accessory: this.equippedAccessory });
        eventBus.emit('toast', { message: '⚠️ 消費した素材が装備欄から外されました', type: 'warning' });
      }
    });

    // レベルアップ選択の橋渡し
    eventBus.on('levelup:choose', ({ passiveId }) => {
      if (this.runManager?.levelUp) {
        this.runManager.levelUp.selectPassive(passiveId);
      }
    });

    // SE
    eventBus.on('item:crafted', () => { SoundManager.playCraftSuccess(); this.stats.totalCrafted++; });
    eventBus.on('enemy:killed', () => SoundManager.playBattleAdvAttack());
    eventBus.on('player:damaged', () => SoundManager.playBattleDamage());
    eventBus.on('levelup:show', () => SoundManager.playLevelUp());
    eventBus.on('boss:spawned', () => SoundManager.playEventChime());
    eventBus.on('boss:defeated', ({ bossId }) => {
      SoundManager.playBattleVictory();
      // Boss BGM → normal BGM
      SoundManager.startGameBGM();
      // ラン中のクラッシュで解放が失われないように即時チェックポイントセーブ
      if (this.saveSystem) {
        try { this._autoSave(); } catch (e) { /* save 失敗は致命的でないので握りつぶす */ }
      }
    });
    eventBus.on('boss:intro', ({ name }) => {
      // Switch to battle BGM if it's a real boss (not reaper)
      if (name !== '死神') {
        SoundManager.startBattleBGM();
      }
    });

    // トースト通知
    eventBus.on('toast', ({ message, type }) => {
      this._showToast(message, type);
    });
  }

  start() {
    // タイトル画面表示
    this._showTitle();
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

    if (mode === 'continue') {
      const data = this.saveSystem.load();
      if (data) {
        const saveData = this.saveSystem.applySaveData(data);
        this.stats = saveData.stats || this.stats;
        // 装備復元
        if (saveData.restoredEquipment) {
          this.weaponSlots = saveData.restoredEquipment.weaponSlots;
          this.equippedArmor = saveData.restoredEquipment.armor;
          this.equippedAccessory = saveData.restoredEquipment.accessory;
        }
        // 実績復元
        this.achievements = new AchievementSystem(this.stats, saveData.achievements || []);
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
    this.hubManager.render();

    // 自動セーブ
    this._autoSave();
    SoundManager.startGameBGM();
  }

  _startRun({ weaponSlots, areaId, consumables, hardMode }) {
    this.scene = 'run';
    this._clearUI();

    // Canvas表示
    this.canvas.style.display = 'block';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // ランシステム初期化
    this.runManager = new RunManager(this.canvas, weaponSlots, areaId, this.equippedArmor, this.equippedAccessory, consumables || [], hardMode || false);

    // ランUI
    this.runHUD = new RunHUD(this.uiRoot);
    this.levelUpModal = new LevelUpModal(this.uiRoot);

    // ラン開始
    this.runManager.start();
    SoundManager.startGameBGM();
    this.stats.totalRuns++;
  }

  _onRunComplete(resultData) {
    this.scene = 'result';

    // ランUI片付け
    if (this.runHUD) { this.runHUD.destroy(); this.runHUD = null; }
    if (this.levelUpModal) { this.levelUpModal.destroy(); this.levelUpModal = null; }
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
    } else if (resultData.reason === 'timeout') {
      this.stats.totalSurvivals++;
    }
    if (resultData.bossDefeated) {
      this.stats.totalBossesDefeated++;
    }
    if (resultData.hardMode && resultData.reason === 'timeout') {
      this.stats.hardModeClears++;
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
      if (resultData.reason === 'timeout') areaStats.clears++;
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

    // リザルト画面表示
    this.resultScreen = new RunResultScreen(this.uiRoot);
    this.resultScreen.show(resultData);
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

  _clearUI() {
    if (this.hubManager) { this.hubManager.destroy(); this.hubManager = null; }
    if (this.runHUD) { this.runHUD.destroy(); this.runHUD = null; }
    if (this.levelUpModal) { this.levelUpModal.destroy(); this.levelUpModal = null; }
    if (this.resultScreen) { this.resultScreen.destroy(); this.resultScreen = null; }
    this.uiRoot.innerHTML = '';
  }

  _autoSave() {
    this.saveSystem.save({
      equippedWeaponUids: this.weaponSlots.map(w => w?.uid || null),
      equippedArmorUid: this.equippedArmor?.uid || null,
      equippedAccessoryUid: this.equippedAccessory?.uid || null,
      stats: this.stats,
      achievements: this.achievements ? this.achievements.getUnlockedIds() : [],
    });
  }
}

// --- ブート ---
const game = new Game();
game.start();
