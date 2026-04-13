/**
 * ゲーム全体の定数・設定値
 * Alchemy Survivors用に調整
 */

export const GameConfig = {
  // --- インベントリ ---
  initialInventoryCapacity: 60,
  initialGold: 0,

  // --- クラフト ---
  maxTraitSlots: 3,

  // --- 装備スロット ---
  equipmentSlots: ['weapon', 'armor', 'accessory'],

  // --- ラン設定 ---
  run: {
    duration: 300,              // 5分（秒）
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
    maxEnemies: 200,
    spawnRateStart: 1.0,        // 敵/秒（開始時）
    spawnRateEnd: 5.0,          // 敵/秒（5分時点）
    dropChance: 0.15,           // 素材ドロップ確率
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
    sword: { baseRange: 60, baseCooldown: 1.2, arc: Math.PI / 2, pattern: 'fan' },
    spear: { baseRange: 90, baseCooldown: 1.4, arc: Math.PI / 6, pattern: 'thrust' },
    bow:   { baseRange: 200, baseCooldown: 0.8, arc: 0, pattern: 'projectile' },
    staff: { baseRange: 120, baseCooldown: 1.0, arc: Math.PI * 2, pattern: 'orbit' },
    dagger:{ baseRange: 35, baseCooldown: 0.4, arc: Math.PI / 3, pattern: 'fan' },
    shield:{ baseRange: 50, baseCooldown: 2.0, arc: Math.PI * 2, pattern: 'pulse' },
  },

  // --- 初期インベントリ（ラン無しでも剣が作れる素材） ---
  initialItems: [
    { blueprintId: 'stone', quality: 15, traits: [] },
    { blueprintId: 'wood', quality: 20, traits: [] },
    { blueprintId: 'wood', quality: 18, traits: [] },
    { blueprintId: 'herb', quality: 18, traits: [] },
    { blueprintId: 'clay', quality: 10, traits: [] },
    { blueprintId: 'sand', quality: 25, traits: [] },
    { blueprintId: 'slime_jelly', quality: 12, traits: [] },
    { blueprintId: 'flower_petal', quality: 15, traits: [] },
    { blueprintId: 'bug_shell', quality: 14, traits: [] },
    { blueprintId: 'feather_small', quality: 16, traits: [] },
    { blueprintId: 'mushroom', quality: 13, traits: [] },
  ],
};
