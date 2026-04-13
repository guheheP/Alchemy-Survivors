/**
 * ゲーム全体の定数・設定値
 * Alchemy Survivors用に調整
 */

export const GameConfig = {
  // --- インベントリ ---
  initialInventoryCapacity: 60,
  initialGold: 100,

  // --- クラフト ---
  maxTraitSlots: 3,

  // --- 装備スロット ---
  equipmentSlots: ['weapon', 'armor', 'accessory'],

  // --- ラン設定 ---
  run: {
    duration: 1200,             // 20分（秒）
    playerBaseHp: 100,
    playerBaseSpeed: 150,       // px/sec
    playerBaseDamage: 10,
    playerRadius: 12,
    dashSpeed: 400,
    dashDuration: 0.15,
    dashCooldown: 1.5,
    invincibilityDuration: 0.5, // 被弾後の無敵フレーム（秒）
    magnetRange: 60,            // 経験値ジェム吸引範囲
    expScale: 1.5,              // レベルアップ経験値曲線指数
    expBase: 10,                // Lv1→2に必要な経験値
    maxEnemies: 300,
    spawnRateStart: 1.0,        // 敵/秒（開始時）
    spawnRateEnd: 6.0,          // 敵/秒（20分時点）
    dropChance: 0.05,           // 素材ドロップ確率
    traitChance: 0.25,          // ドロップ素材に特性が付く確率
    bossSpawnTimes: [300, 600, 900],  // 5/10/15分にボス出現（Phase 2-D用）
    reaperSpawnTime: 1200,             // 20分に死神出現
  },

  // --- ゴールド ---
  gold: {
    perKill: 1,           // 通常敵1体あたり
    bossBonus: 200,       // ボス撃破ボーナス
    survivalBonus: 50,    // 5分生存ごとのボーナス
    survivalInterval: 300, // 5分
  },

  // --- 武器ステータス計算（企画書 Section 4.1） ---
  weapon: {
    // 攻撃力 = baseValue / 10 + quality / 5
    damageBaseDivisor: 10,
    damageQualityDivisor: 5,
    // 攻撃速度 = 1.0 + quality / 500 (最大約3.0倍)
    speedBase: 1.0,
    speedQualityDivisor: 500,
    // 攻撃範囲 = baseRange * (1 + quality / 1000)
    rangeQualityDivisor: 1000,
  },

  // --- 武器種別デフォルト ---
  weaponTypes: {
    sword:  { baseRange: 100, baseCooldown: 1.0, arc: Math.PI * 0.7, pattern: 'cleave' },
    spear:  { baseRange: 150, baseCooldown: 1.2, arc: Math.PI / 8, pattern: 'thrust' },
    bow:    { baseRange: 250, baseCooldown: 0.7, arc: 0, pattern: 'projectile' },
    staff:  { baseRange: 130, baseCooldown: 0.9, arc: Math.PI * 2, pattern: 'orbit' },
    dagger: { baseRange: 60, baseCooldown: 0.25, arc: Math.PI / 3, pattern: 'flurry' },
    shield: { baseRange: 90, baseCooldown: 1.8, arc: Math.PI * 2, pattern: 'pulse' },
  },

  // --- 初期インベントリ（初期装備の石斧のみ） ---
  initialItems: [
    { blueprintId: 'stone_axe', quality: 20, traits: [] },
  ],
};
