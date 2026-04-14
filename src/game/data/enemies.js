/**
 * 敵タイプ定義
 * Phase 1: 草原の敵のみ
 */

export const EnemyDefs = {
  // --- 草原 ---
  slime: {
    id: 'slime',
    name: 'スライム',
    hp: 15,
    speed: 40,
    damage: 5,
    expValue: 1,
    radius: 10,
    color: '#4a4',
    preset: '/presets/RPG_Characters/Slime.json',
  },
  bat: {
    id: 'bat',
    name: 'コウモリ',
    hp: 8,
    speed: 70,
    damage: 3,
    expValue: 1,
    radius: 8,
    color: '#66a',
    preset: '/presets/RPG_Characters/Bat.json',
  },
  goblin: {
    id: 'goblin',
    name: 'ゴブリン',
    hp: 25,
    speed: 50,
    damage: 8,
    expValue: 2,
    radius: 11,
    color: '#a64',
    preset: '/presets/TD_Enemies/Goblin.json',
  },
  wolf: {
    id: 'wolf',
    name: 'ウルフ',
    hp: 20,
    speed: 80,
    damage: 6,
    expValue: 2,
    radius: 12,
    color: '#888',
    preset: '/presets/RPG_Characters/Dog.json',
  },

  // --- 洞窟 ---
  cave_bat: {
    id: 'cave_bat', name: '洞窟コウモリ',
    hp: 12, speed: 85, damage: 4, expValue: 2, radius: 8, color: '#537',
    preset: '/presets/RPG_Characters/Bat.json',
  },
  skeleton: {
    id: 'skeleton', name: 'スケルトン',
    hp: 35, speed: 45, damage: 10, expValue: 3, radius: 12, color: '#dda',
    preset: '/presets/RPG_Characters/Skeleton.json',
  },
  rock_golem: {
    id: 'rock_golem', name: 'ロックゴーレム',
    hp: 60, speed: 30, damage: 15, expValue: 4, radius: 16, color: '#886',
    preset: '/presets/Bosses/Golem.json',
  },
  dark_mage: {
    id: 'dark_mage', name: 'ダークメイジ',
    hp: 20, speed: 60, damage: 12, expValue: 3, radius: 10, color: '#63a',
    preset: '/presets/RPG_Characters/Mage.json',
  },

  // --- 森 ---
  wolf_alpha: {
    id: 'wolf_alpha', name: 'アルファウルフ',
    hp: 30, speed: 95, damage: 8, expValue: 3, radius: 13, color: '#666',
    preset: '/presets/RPG_Characters/Dog.json',
  },
  treant_sapling: {
    id: 'treant_sapling', name: 'トレントの苗木',
    hp: 80, speed: 20, damage: 12, expValue: 5, radius: 18, color: '#483',
    preset: '/presets/Bosses/Treant.json',
  },
  fairy_wisp: {
    id: 'fairy_wisp', name: 'フェアリーウィスプ',
    hp: 10, speed: 110, damage: 3, expValue: 2, radius: 6, color: '#aef',
    preset: '/presets/RPG_Characters/Bird.json',
  },
  spider: {
    id: 'spider', name: '大蜘蛛',
    hp: 40, speed: 55, damage: 10, expValue: 3, radius: 12, color: '#543',
    preset: '/presets/TD_Enemies/Giant Spider.json',
  },

  // --- 火山 ---
  fire_elemental: {
    id: 'fire_elemental', name: '炎精霊', hp: 30, speed: 65, damage: 12, expValue: 3, radius: 10, color: '#f62',
    preset: '/presets/RPG_Characters/Mage.json',
  },
  lava_golem: {
    id: 'lava_golem', name: '溶岩ゴーレム', hp: 70, speed: 25, damage: 18, expValue: 5, radius: 18, color: '#a42',
    preset: '/presets/Bosses/Golem.json',
  },
  fire_bat: {
    id: 'fire_bat', name: '火蝙蝠', hp: 15, speed: 100, damage: 8, expValue: 2, radius: 8, color: '#f84',
    preset: '/presets/RPG_Characters/Bat.json',
  },
  magma_worm: {
    id: 'magma_worm', name: 'マグマワーム', hp: 45, speed: 40, damage: 14, expValue: 4, radius: 14, color: '#d52',
    preset: '/presets/TD_Enemies/Giant Spider.json',
  },

  // --- 深海 ---
  sea_serpent: {
    id: 'sea_serpent', name: 'シーサーペント', hp: 50, speed: 55, damage: 14, expValue: 4, radius: 14, color: '#28a',
    preset: '/presets/Bosses/Kraken.json',
  },
  jellyfish: {
    id: 'jellyfish', name: '電気クラゲ', hp: 20, speed: 35, damage: 10, expValue: 3, radius: 10, color: '#6cf',
    preset: '/presets/RPG_Characters/Slime.json',
  },
  deep_fish: {
    id: 'deep_fish', name: '深海魚', hp: 35, speed: 75, damage: 10, expValue: 3, radius: 10, color: '#148',
    preset: '/presets/RPG_Characters/Bird.json',
  },
  coral_guardian: {
    id: 'coral_guardian', name: '珊瑚の番人', hp: 90, speed: 20, damage: 16, expValue: 5, radius: 20, color: '#f8a',
    preset: '/presets/Bosses/Treant.json',
  },

  // --- 竜の巣 ---
  drake: {
    id: 'drake', name: 'ドレイク', hp: 55, speed: 68, damage: 15, expValue: 6, radius: 14, color: '#a44',
    preset: '/presets/Bosses/Dragon.json',
  },
  wyvern: {
    id: 'wyvern', name: 'ワイバーン', hp: 35, speed: 88, damage: 11, expValue: 5, radius: 12, color: '#866',
    preset: '/presets/RPG_Characters/Bat.json',
  },
  dragon_hatchling: {
    id: 'dragon_hatchling', name: '幼竜', hp: 90, speed: 28, damage: 18, expValue: 8, radius: 20, color: '#c62',
    preset: '/presets/Bosses/Dragon.json',
  },
  fire_wisp: {
    id: 'fire_wisp', name: '竜火ウィスプ', hp: 14, speed: 105, damage: 6, expValue: 4, radius: 6, color: '#fa4',
    preset: '/presets/RPG_Characters/Bird.json',
  },

  // --- 天空 ---
  sky_knight: {
    id: 'sky_knight', name: '天空騎士', hp: 65, speed: 58, damage: 16, expValue: 7, radius: 14, color: '#aaf',
    preset: '/presets/RPG_Characters/Knight.json',
  },
  thunder_hawk: {
    id: 'thunder_hawk', name: '雷鷹', hp: 28, speed: 105, damage: 11, expValue: 5, radius: 10, color: '#ff6',
    preset: '/presets/RPG_Characters/Bird.json',
  },
  cloud_golem: {
    id: 'cloud_golem', name: '雲のゴーレム', hp: 100, speed: 18, damage: 20, expValue: 9, radius: 22, color: '#cce',
    preset: '/presets/Bosses/Golem.json',
  },
  wind_spirit: {
    id: 'wind_spirit', name: '風の精霊', hp: 22, speed: 92, damage: 7, expValue: 4, radius: 8, color: '#afa',
    preset: '/presets/RPG_Characters/Mage.json',
  },

  // --- 時の回廊 ---
  time_phantom: {
    id: 'time_phantom', name: '時の亡霊', hp: 48, speed: 78, damage: 16, expValue: 7, radius: 12, color: '#a6f',
    preset: '/presets/RPG_Characters/Skeleton.json',
  },
  chrono_golem: {
    id: 'chrono_golem', name: '時空ゴーレム', hp: 130, speed: 22, damage: 22, expValue: 10, radius: 24, color: '#86a',
    preset: '/presets/Bosses/Golem.json',
  },
  paradox_wisp: {
    id: 'paradox_wisp', name: 'パラドクスウィスプ', hp: 18, speed: 115, damage: 9, expValue: 5, radius: 6, color: '#f6f',
    preset: '/presets/RPG_Characters/Bird.json',
  },
  void_walker: {
    id: 'void_walker', name: 'ヴォイドウォーカー', hp: 75, speed: 62, damage: 18, expValue: 8, radius: 16, color: '#426',
    preset: '/presets/RPG_Characters/Mage.json',
  },
};

/** エリアごとの敵スポーン設定 */
export const AreaEnemyConfig = {
  plains: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'slime', weight: 60 }, { id: 'bat', weight: 40 }] },
      { startTime: 60,  enemies: [{ id: 'slime', weight: 40 }, { id: 'bat', weight: 30 }, { id: 'goblin', weight: 30 }] },
      { startTime: 120, enemies: [{ id: 'slime', weight: 20 }, { id: 'goblin', weight: 40 }, { id: 'wolf', weight: 40 }] },
      { startTime: 180, enemies: [{ id: 'goblin', weight: 30 }, { id: 'wolf', weight: 50 }, { id: 'bat', weight: 20 }] },
      { startTime: 240, enemies: [{ id: 'wolf', weight: 50 }, { id: 'goblin', weight: 50 }] },
      { startTime: 300, enemies: [{ id: 'wolf', weight: 40 }, { id: 'goblin', weight: 40 }, { id: 'bat', weight: 20 }] },
      { startTime: 420, enemies: [{ id: 'wolf', weight: 50 }, { id: 'goblin', weight: 50 }] },
      { startTime: 600, enemies: [{ id: 'wolf', weight: 50 }, { id: 'goblin', weight: 30 }, { id: 'slime', weight: 20 }] },
      { startTime: 900, enemies: [{ id: 'wolf', weight: 60 }, { id: 'goblin', weight: 40 }] },
      { startTime: 1080, enemies: [{ id: 'wolf', weight: 70 }, { id: 'goblin', weight: 30 }] },
    ],
  },
  cave: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'cave_bat', weight: 50 }, { id: 'skeleton', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'cave_bat', weight: 30 }, { id: 'skeleton', weight: 40 }, { id: 'dark_mage', weight: 30 }] },
      { startTime: 240, enemies: [{ id: 'skeleton', weight: 30 }, { id: 'dark_mage', weight: 30 }, { id: 'rock_golem', weight: 40 }] },
      { startTime: 360, enemies: [{ id: 'dark_mage', weight: 30 }, { id: 'rock_golem', weight: 40 }, { id: 'cave_bat', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'rock_golem', weight: 40 }, { id: 'skeleton', weight: 30 }, { id: 'dark_mage', weight: 30 }] },
      { startTime: 600, enemies: [{ id: 'skeleton', weight: 25 }, { id: 'dark_mage', weight: 35 }, { id: 'rock_golem', weight: 40 }] },
      { startTime: 720, enemies: [{ id: 'rock_golem', weight: 50 }, { id: 'dark_mage', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'rock_golem', weight: 40 }, { id: 'dark_mage', weight: 30 }, { id: 'skeleton', weight: 30 }] },
      { startTime: 1080, enemies: [{ id: 'rock_golem', weight: 50 }, { id: 'dark_mage', weight: 50 }] },
    ],
  },
  forest: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'wolf_alpha', weight: 40 }, { id: 'fairy_wisp', weight: 60 }] },
      { startTime: 120, enemies: [{ id: 'wolf_alpha', weight: 30 }, { id: 'spider', weight: 40 }, { id: 'fairy_wisp', weight: 30 }] },
      { startTime: 240, enemies: [{ id: 'spider', weight: 40 }, { id: 'treant_sapling', weight: 30 }, { id: 'wolf_alpha', weight: 30 }] },
      { startTime: 360, enemies: [{ id: 'treant_sapling', weight: 40 }, { id: 'spider', weight: 30 }, { id: 'fairy_wisp', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'wolf_alpha', weight: 30 }, { id: 'treant_sapling', weight: 40 }, { id: 'spider', weight: 30 }] },
      { startTime: 600, enemies: [{ id: 'treant_sapling', weight: 40 }, { id: 'wolf_alpha', weight: 30 }, { id: 'fairy_wisp', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'treant_sapling', weight: 50 }, { id: 'spider', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'treant_sapling', weight: 40 }, { id: 'wolf_alpha', weight: 30 }, { id: 'spider', weight: 30 }] },
      { startTime: 1080, enemies: [{ id: 'treant_sapling', weight: 50 }, { id: 'wolf_alpha', weight: 50 }] },
    ],
  },
  volcano: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'fire_elemental', weight: 50 }, { id: 'fire_bat', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'fire_elemental', weight: 30 }, { id: 'fire_bat', weight: 30 }, { id: 'magma_worm', weight: 40 }] },
      { startTime: 300, enemies: [{ id: 'magma_worm', weight: 40 }, { id: 'lava_golem', weight: 30 }, { id: 'fire_elemental', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'lava_golem', weight: 40 }, { id: 'magma_worm', weight: 30 }, { id: 'fire_bat', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'lava_golem', weight: 50 }, { id: 'fire_elemental', weight: 25 }, { id: 'magma_worm', weight: 25 }] },
      { startTime: 900, enemies: [{ id: 'lava_golem', weight: 50 }, { id: 'magma_worm', weight: 50 }] },
      { startTime: 1080, enemies: [{ id: 'lava_golem', weight: 60 }, { id: 'fire_elemental', weight: 40 }] },
    ],
  },
  deep_sea: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'jellyfish', weight: 50 }, { id: 'deep_fish', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'deep_fish', weight: 30 }, { id: 'sea_serpent', weight: 40 }, { id: 'jellyfish', weight: 30 }] },
      { startTime: 300, enemies: [{ id: 'sea_serpent', weight: 40 }, { id: 'coral_guardian', weight: 30 }, { id: 'deep_fish', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'coral_guardian', weight: 40 }, { id: 'sea_serpent', weight: 30 }, { id: 'jellyfish', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'coral_guardian', weight: 50 }, { id: 'sea_serpent', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'coral_guardian', weight: 50 }, { id: 'deep_fish', weight: 25 }, { id: 'sea_serpent', weight: 25 }] },
      { startTime: 1080, enemies: [{ id: 'coral_guardian', weight: 60 }, { id: 'sea_serpent', weight: 40 }] },
    ],
  },
  dragon_nest: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'wyvern', weight: 50 }, { id: 'fire_wisp', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'wyvern', weight: 30 }, { id: 'drake', weight: 40 }, { id: 'fire_wisp', weight: 30 }] },
      { startTime: 300, enemies: [{ id: 'drake', weight: 40 }, { id: 'dragon_hatchling', weight: 30 }, { id: 'wyvern', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'dragon_hatchling', weight: 40 }, { id: 'drake', weight: 30 }, { id: 'fire_wisp', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'dragon_hatchling', weight: 50 }, { id: 'drake', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'dragon_hatchling', weight: 50 }, { id: 'wyvern', weight: 25 }, { id: 'drake', weight: 25 }] },
      { startTime: 1080, enemies: [{ id: 'dragon_hatchling', weight: 60 }, { id: 'drake', weight: 40 }] },
    ],
  },
  sky_tower: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'wind_spirit', weight: 50 }, { id: 'thunder_hawk', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'thunder_hawk', weight: 30 }, { id: 'sky_knight', weight: 40 }, { id: 'wind_spirit', weight: 30 }] },
      { startTime: 300, enemies: [{ id: 'sky_knight', weight: 40 }, { id: 'cloud_golem', weight: 30 }, { id: 'thunder_hawk', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'cloud_golem', weight: 40 }, { id: 'sky_knight', weight: 30 }, { id: 'wind_spirit', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'cloud_golem', weight: 50 }, { id: 'sky_knight', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'cloud_golem', weight: 50 }, { id: 'thunder_hawk', weight: 25 }, { id: 'sky_knight', weight: 25 }] },
      { startTime: 1080, enemies: [{ id: 'cloud_golem', weight: 60 }, { id: 'sky_knight', weight: 40 }] },
    ],
  },
  time_corridor: {
    waves: [
      { startTime: 0,   enemies: [{ id: 'paradox_wisp', weight: 50 }, { id: 'time_phantom', weight: 50 }] },
      { startTime: 120, enemies: [{ id: 'time_phantom', weight: 30 }, { id: 'void_walker', weight: 40 }, { id: 'paradox_wisp', weight: 30 }] },
      { startTime: 300, enemies: [{ id: 'void_walker', weight: 40 }, { id: 'chrono_golem', weight: 30 }, { id: 'time_phantom', weight: 30 }] },
      { startTime: 480, enemies: [{ id: 'chrono_golem', weight: 40 }, { id: 'void_walker', weight: 30 }, { id: 'paradox_wisp', weight: 30 }] },
      { startTime: 720, enemies: [{ id: 'chrono_golem', weight: 50 }, { id: 'void_walker', weight: 50 }] },
      { startTime: 900, enemies: [{ id: 'chrono_golem', weight: 50 }, { id: 'time_phantom', weight: 25 }, { id: 'void_walker', weight: 25 }] },
      { startTime: 1080, enemies: [{ id: 'chrono_golem', weight: 60 }, { id: 'void_walker', weight: 40 }] },
    ],
  },
};
