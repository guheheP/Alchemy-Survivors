/**
 * BossSystem — ボス出現・管理・エリア解放
 */

import { BossEntity } from './BossEntity.js';
import { GameConfig } from '../data/config.js';
import { AreaDefs } from '../data/areas.js';
import { Recipes } from '../data/items.js';
import { eventBus } from '../core/EventBus.js';
import { Progression } from '../data/progression.js';

/** ボス撃破 → 次エリア + レシピ解放のマッピング */
const BOSS_UNLOCK_MAP = {
  'boss_plains_slime':  { areas: ['cave'],    recipeKeys: ['sword','antidote','silver_dagger','leather_armor','iron_spear','amber_ring','bone_charm','stamina_drink','iron_helm','iron_spike','steel_ingot','alloy_ore','pure_crystal'] },
  'boss_cave_golem':    { areas: ['forest'],  recipeKeys: ['mage_staff','chainmail','elixir','wind_bow','spirit_robe','strength_potion','spider_cloak','crystal_orb','dark_blade','fairy_necklace','poison_dagger','magic_ink','weakness_draught','magic_cloth','spirit_thread'] },
  'boss_forest_treant': { areas: ['volcano'], recipeKeys: ['fire_sword','ice_shield','holy_sword','dragon_armor','phoenix_feather_acc','flame_lance','moonlight_staff','silver_mail','spirit_potion','thunder_hammer','cursed_ring','lava_shield','fire_cloak','enchant_scroll','thunder_bomb'] },
  'boss_volcano_ifrit': { areas: ['deep_sea'], recipeKeys: ['trident','coral_armor','pearl_tiara','tidal_bow','deep_elixir','mithril_sword','mithril_shield','void_amulet','frost_blade','elder_staff','sea_serpent_whip','lotus_perfume','revival_herb','dragon_alloy'] },
  'boss_sea_kraken':    { areas: ['dragon_nest'], recipeKeys: ['dragon_slayer','storm_cloak','ancient_crown','sage_stone','mystic_amulet','dragon_bow','phoenix_robe','void_blade','dragon_potion','thunder_spear','cursed_crown','scale_shield'] },
  'boss_elder_dragon':  { areas: ['sky_tower'], recipeKeys: ['sky_sword','time_hourglass','star_shield','divine_armor','aether_staff','sky_bow','rainbow_robe','divine_elixir','chaos_ring','star_pendant','wind_lance','phoenix_bow'] },
  'boss_sky_titan':     { areas: ['time_corridor'], recipeKeys: ['legendary_blade','world_tree_staff','genesis_armor','time_blade','primordial_crown','eternity_ring','cosmos_bow','panacea','oblivion_shield','astral_robe'] },
};

export class BossSystem {
  constructor(areaId, modifiers = null) {
    this.areaId = areaId;
    this.area = AreaDefs[areaId];
    this.modifiers = modifiers;
    this.boss = null;
    this.bossEntity = new BossEntity();
    this.spawnTimes = [...GameConfig.run.bossSpawnTimes]; // [300, 600, 900]
    this.currentBossIndex = 0;
    this.bossDefeated = false;
    this.spawnerPaused = false;

    // 死神（20分）
    this.reaperSpawned = false;
    this.reaperEntity = new BossEntity();
  }

  update(dt, elapsed, playerX, playerY, cameraW, cameraH) {
    // ボス出現チェック（最初のボスのみ — このエリアのボス）
    if (!this.boss && !this.bossDefeated && this.currentBossIndex === 0) {
      if (elapsed >= this.spawnTimes[0] && this.area.boss) {
        this._spawnBoss(playerX, playerY, cameraW, cameraH);
      }
    }

    // 死神出現チェック（20分）
    if (!this.reaperSpawned && elapsed >= GameConfig.run.reaperSpawnTime) {
      this._spawnReaper(playerX, playerY, cameraW, cameraH);
    }

    // ボス更新
    if (this.boss && this.bossEntity.active) {
      this.bossEntity.update(dt, playerX, playerY);
    }

    // 死神更新
    if (this.reaperSpawned && this.reaperEntity.active) {
      this.reaperEntity.update(dt, playerX, playerY);
    }
  }

  _spawnBoss(playerX, playerY, camW, camH) {
    const bossDef = this.area.boss;
    this.boss = bossDef;

    // カメラ外上方にスポーン
    const sx = playerX + (Math.random() - 0.5) * camW * 0.5;
    const sy = playerY - camH / 2 - 100;

    this.bossEntity.initBoss(bossDef, sx, sy);

    // ハードモード倍率適用
    if (this.modifiers) {
      this.bossEntity.maxHp = Math.floor(this.bossEntity.maxHp * this.modifiers.bossHpMultiplier);
      this.bossEntity.hp = this.bossEntity.maxHp;
      this.bossEntity.damage = Math.floor(this.bossEntity.damage * this.modifiers.bossDamageMultiplier);
    }

    this.spawnerPaused = true;

    eventBus.emit('boss:intro', { name: bossDef.name, icon: bossDef.icon });
  }

  _spawnReaper(playerX, playerY, camW, camH) {
    this.reaperSpawned = true;

    const reaperDef = {
      id: 'reaper',
      name: '死神',
      icon: '💀',
      maxHp: 999999,
      atk: 9999,
      def: 9999,
      spd: 120,
      phases: [],
      skills: [],
    };

    const sx = playerX + camW / 2 + 100;
    const sy = playerY;

    this.reaperEntity.initBoss(reaperDef, sx, sy);
    this.reaperEntity.color = '#000';
    this.reaperEntity.radius = 30;
    this.reaperEntity.expValue = 0;

    eventBus.emit('boss:intro', { name: '死神', icon: '💀' });
  }

  onBossKilled() {
    this.bossDefeated = true;
    const bossId = this.bossEntity.enemyId;
    Progression.markBossDefeated(bossId);
    this.boss = null;
    this.spawnerPaused = false;

    // エリア解放
    const unlocks = BOSS_UNLOCK_MAP[bossId];
    if (unlocks) {
      for (const areaId of unlocks.areas) {
        if (AreaDefs[areaId]) {
          AreaDefs[areaId].unlocked = true;
          eventBus.emit('area:unlocked', { areaId, name: AreaDefs[areaId].name });
        }
      }
      for (const key of unlocks.recipeKeys) {
        if (Recipes[key]) {
          Recipes[key].unlocked = true;
        }
      }
      eventBus.emit('toast', {
        message: `🎉 新エリア「${unlocks.areas.map(a => AreaDefs[a]?.name).join('、')}」が解放されました！`,
        type: 'special'
      });
    }

    eventBus.emit('boss:defeated', { bossId, areaId: this.areaId });
  }

  /** アクティブなボスエンティティ一覧（描画・衝突判定用） */
  getActiveBosses() {
    const result = [];
    if (this.bossEntity.active) result.push(this.bossEntity);
    if (this.reaperEntity.active) result.push(this.reaperEntity);
    return result;
  }

  destroy() {
    this.bossEntity.reset();
    this.reaperEntity.reset();
  }
}
