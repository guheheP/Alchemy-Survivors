/**
 * 実績定義データ
 * condition.type:
 *   'stat'   — stats[stat] >= value
 *   'event'  — 特定イベント発火時に即座に解放
 *   'count'  — 関数チェック（defeatedBossCount, unlockedAreaCount等）
 */

export const AchievementDefs = {
  // === 基本 ===
  first_run: {
    name: '初陣',
    desc: '初めてのランを完了した',
    icon: '🎯',
    category: 'basic',
    condition: { type: 'stat', stat: 'totalRuns', value: 1 },
  },
  runs_10: {
    name: '歴戦の冒険者',
    desc: '10回ランを完了した',
    icon: '🏃',
    category: 'basic',
    condition: { type: 'stat', stat: 'totalRuns', value: 10 },
  },
  runs_50: {
    name: '果てなき探求',
    desc: '50回ランを完了した',
    icon: '🏅',
    category: 'basic',
    condition: { type: 'stat', stat: 'totalRuns', value: 50 },
  },
  survive_full: {
    name: '生存者',
    desc: '10分生存を達成した',
    icon: '⏰',
    category: 'basic',
    condition: { type: 'stat', stat: 'totalSurvivals', value: 1 },
  },
  survive_10: {
    name: '不屈の生存者',
    desc: '10分生存を10回達成した',
    icon: '🛡',
    category: 'basic',
    condition: { type: 'stat', stat: 'totalSurvivals', value: 10 },
  },

  // === 戦闘 ===
  kill_100: {
    name: '百殺',
    desc: '累計100体の敵を倒した',
    icon: '💀',
    category: 'combat',
    condition: { type: 'stat', stat: 'totalKills', value: 100 },
  },
  kill_1000: {
    name: '千殺',
    desc: '累計1000体の敵を倒した',
    icon: '☠',
    category: 'combat',
    condition: { type: 'stat', stat: 'totalKills', value: 1000 },
  },
  kill_5000: {
    name: '殲滅者',
    desc: '累計5000体の敵を倒した',
    icon: '🗡',
    category: 'combat',
    condition: { type: 'stat', stat: 'totalKills', value: 5000 },
  },
  high_damage_100: {
    name: '一撃必殺',
    desc: '100以上のダメージを1回で与えた',
    icon: '💥',
    category: 'combat',
    condition: { type: 'stat', stat: 'highestDamageDealt', value: 100 },
  },
  high_damage_500: {
    name: '破壊神',
    desc: '500以上のダメージを1回で与えた',
    icon: '🌟',
    category: 'combat',
    condition: { type: 'stat', stat: 'highestDamageDealt', value: 500 },
  },
  level_10: {
    name: 'レベル10到達',
    desc: 'ラン中にレベル10に到達した',
    icon: '⬆',
    category: 'combat',
    condition: { type: 'stat', stat: 'highestLevel', value: 10 },
  },
  level_20: {
    name: 'レベル20到達',
    desc: 'ラン中にレベル20に到達した',
    icon: '⭐',
    category: 'combat',
    condition: { type: 'stat', stat: 'highestLevel', value: 20 },
  },

  // === ボス ===
  first_boss: {
    name: '初ボス撃破',
    desc: 'ボスを初めて撃破した',
    icon: '👑',
    category: 'boss',
    condition: { type: 'stat', stat: 'totalBossesDefeated', value: 1 },
  },
  boss_3: {
    name: 'ボスハンター',
    desc: 'ボスを3体撃破した',
    icon: '🏆',
    category: 'boss',
    condition: { type: 'stat', stat: 'totalBossesDefeated', value: 3 },
  },
  all_bosses: {
    name: '全制覇',
    desc: '全7体のボスを撃破した',
    icon: '👸',
    category: 'boss',
    condition: { type: 'count', counter: 'defeatedBossCount', value: 7 },
  },

  // === クラフト ===
  first_craft: {
    name: '見習い錬金術師',
    desc: '初めてアイテムを作成した',
    icon: '🔮',
    category: 'craft',
    condition: { type: 'stat', stat: 'totalCrafted', value: 1 },
  },
  craft_10: {
    name: '錬金術師',
    desc: '10個のアイテムを作成した',
    icon: '⚗',
    category: 'craft',
    condition: { type: 'stat', stat: 'totalCrafted', value: 10 },
  },
  craft_50: {
    name: '熟練錬金術師',
    desc: '50個のアイテムを作成した',
    icon: '🧪',
    category: 'craft',
    condition: { type: 'stat', stat: 'totalCrafted', value: 50 },
  },
  materials_100: {
    name: '素材収集家',
    desc: '累計100個の素材を収集した',
    icon: '📦',
    category: 'craft',
    condition: { type: 'stat', stat: 'totalMaterialsCollected', value: 100 },
  },
  materials_500: {
    name: '大収集家',
    desc: '累計500個の素材を収集した',
    icon: '🏗',
    category: 'craft',
    condition: { type: 'stat', stat: 'totalMaterialsCollected', value: 500 },
  },

  // === ハードモード ===
  hard_clear: {
    name: '真の戦士',
    desc: 'ハードモードで10分生存した',
    icon: '🔥',
    category: 'hard',
    condition: { type: 'stat', stat: 'hardModeClears', value: 1 },
  },
  hard_clear_5: {
    name: '鉄人',
    desc: 'ハードモードで5回10分生存した',
    icon: '🌋',
    category: 'hard',
    condition: { type: 'stat', stat: 'hardModeClears', value: 5 },
  },

  // === 探索 ===
  gold_1000: {
    name: '金持ち',
    desc: '累計1000ゴールドを獲得した',
    icon: '💰',
    category: 'exploration',
    condition: { type: 'stat', stat: 'totalGoldEarned', value: 1000 },
  },
  gold_10000: {
    name: '大富豪',
    desc: '累計10000ゴールドを獲得した',
    icon: '💎',
    category: 'exploration',
    condition: { type: 'stat', stat: 'totalGoldEarned', value: 10000 },
  },
  playtime_1h: {
    name: '冒険の始まり',
    desc: '累計プレイ時間が1時間を超えた',
    icon: '🕐',
    category: 'exploration',
    condition: { type: 'stat', stat: 'totalPlayTime', value: 3600 },
  },
  playtime_10h: {
    name: '熟練冒険者',
    desc: '累計プレイ時間が10時間を超えた',
    icon: '🕰',
    category: 'exploration',
    condition: { type: 'stat', stat: 'totalPlayTime', value: 36000 },
  },
};

export const AchievementCategories = {
  basic: '基本',
  combat: '戦闘',
  boss: 'ボス',
  craft: 'クラフト',
  hard: 'ハードモード',
  exploration: '探索',
};
