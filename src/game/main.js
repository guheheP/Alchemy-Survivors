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

class Game {
  constructor() {
    this.uiRoot = document.getElementById('ui-root');
    this.canvas = document.getElementById('game-canvas');
    this.scene = 'title'; // 'title' | 'hub' | 'run' | 'result'

    // ゲーム状態
    this.inventory = null;
    this.saveSystem = null;
    this.weaponSlots = [null, null, null, null];
    this.stats = { totalRuns: 0, totalKills: 0, bestSurvivalTime: 0, totalMaterialsCollected: 0 };

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
    eventBus.on('equipment:changed', ({ weaponSlots }) => { this.weaponSlots = [...weaponSlots]; });

    // レベルアップ選択の橋渡し
    eventBus.on('levelup:choose', ({ passiveId }) => {
      if (this.runManager?.levelUp) {
        this.runManager.levelUp.selectPassive(passiveId);
      }
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
        // 装備復元は後でUID照合
      }
    } else {
      // ニューゲーム: 初期レシピを解放
      this._unlockInitialRecipes();
    }

    this._showHub();
  }

  _unlockInitialRecipes() {
    // Rank 1のレシピは unlocked: true で既に定義済み
    // plains エリアも unlocked: true
    // 追加で stone_axe レシピ（sword タイプ）が初期解放されていることを確認
  }

  _showHub() {
    this.scene = 'hub';
    this.canvas.style.display = 'none';
    this._clearUI();

    this.hubManager = new HubManager(this.uiRoot, this.inventory);
    this.hubManager.weaponSlots = [...this.weaponSlots];
    this.hubManager.render();

    // 自動セーブ
    this._autoSave();
  }

  _startRun({ weaponSlots, areaId }) {
    this.scene = 'run';
    this._clearUI();

    // Canvas表示
    this.canvas.style.display = 'block';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // ランシステム初期化
    this.runManager = new RunManager(this.canvas, weaponSlots, areaId);

    // ランUI
    this.runHUD = new RunHUD(this.uiRoot);
    this.levelUpModal = new LevelUpModal(this.uiRoot);

    // ラン開始
    this.runManager.start();
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
    if (resultData.elapsed > this.stats.bestSurvivalTime) {
      this.stats.bestSurvivalTime = resultData.elapsed;
    }

    // リザルト画面表示
    this.resultScreen = new RunResultScreen(this.uiRoot);
    this.resultScreen.show(resultData);
  }

  _returnToHub(resultData) {
    // 獲得素材をインベントリに追加
    if (resultData.materials) {
      this.inventory.beginBatch();
      for (const mat of resultData.materials) {
        const item = createItemInstance(mat.blueprintId, mat.quality, []);
        this.inventory.forceAddItem(item);
      }
      this.inventory.endBatch();
    }

    if (this.resultScreen) { this.resultScreen.destroy(); this.resultScreen = null; }

    this._showHub();
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
      stats: this.stats,
    });
  }
}

// --- ブート ---
const game = new Game();
game.start();
