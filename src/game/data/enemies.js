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
    ],
  },
};
