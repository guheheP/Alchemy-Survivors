/**
 * ゲーム全体の定数・設定値
 * Alchemy Survivors用に調整
 */

export const GameConfig = {
  // --- インベントリ ---
  initialInventoryCapacity: 100,
  warehouseExpansionPerLevel: 20,
  warehouseMaxLevel: 20,
  initialGold: 100,

  // --- クラフト ---
  maxTraitSlots: 3,

  // --- 装備スロット ---
  equipmentSlots: ['weapon', 'armor', 'accessory'],

  // --- ラン設定 ---
  run: {
    duration: 300,              // 5分: ボス出現タイミング & スポーン率上昇カーブの上限
    playerBaseHp: 100,
    playerBaseSpeed: 150,       // px/sec
    playerBaseDamage: 10,
    playerRadius: 12,
    dashSpeed: 400,
    dashDuration: 0.15,
    dashCooldown: 5.0,
    invincibilityDuration: 0.5, // 被弾後の無敵フレーム（秒）
    magnetRange: 60,            // 経験値ジェム吸引範囲
    expScale: 1.5,              // レベルアップ経験値曲線指数
    expBase: 10,                // Lv1→2に必要な経験値
    get maxEnemies() {
      // import 時評価を避けるため getter 化（SSR/テスト互換）
      if (typeof window === 'undefined') return 300;
      const hasTouch = ('ontouchstart' in window)
        || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
      if (!hasTouch) return 300;
      const mql = window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse)') : null;
      const isMobile = (mql && mql.matches) || window.innerWidth <= 900;
      return isMobile ? 150 : 300;
    },
    spawnRateStart: 1.0,        // 敵/秒（開始時）
    spawnRateEnd: 6.0,          // 敵/秒（10分時点）
    dropChance: 0.03,           // 素材ドロップ確率
    traitChance: 0.25,          // ドロップ素材に特性が付く確率
    bossSpawnTimes: [300],            // 5分にエリアボス出現（撃破でクリア）
    reaperSpawnTime: 999999,          // 死神は無効化
  },

  // --- ゴールド ---
  gold: {
    perKill: 1,           // 通常敵1体あたり
    bossBonus: 150,       // ボス撃破ボーナス
    survivalBonus: 60,    // 2.5分生存ごとのボーナス
    survivalInterval: 150, // 2.5分
  },

  // --- 武器ステータス計算（企画書 Section 4.1） ---
  weapon: {
    // 攻撃力 = baseValue / 10 + quality / 2.5
    damageBaseDivisor: 10,
    damageQualityDivisor: 2.5,
    // 攻撃速度 = 1.0 + quality / 500 (最大約3.0倍)
    speedBase: 1.0,
    speedQualityDivisor: 500,
    // 攻撃範囲 = baseRange * (1 + quality / 1000)
    rangeQualityDivisor: 1000,
  },

  // --- 武器種別デフォルト ---
  weaponTypes: {
    sword:  { baseRange: 100, baseCooldown: 0.95, arc: Math.PI * 5 / 4, pattern: 'cleave' },
    spear:  { baseRange: 150, baseCooldown: 0.9, arc: Math.PI / 8, pattern: 'thrust' },
    bow:    { baseRange: 180, baseCooldown: 0.65, arc: 0, pattern: 'projectile' },
    staff:  { baseRange: 130, baseCooldown: 0.85, arc: Math.PI * 2, pattern: 'orbit' },
    dagger: { baseRange: 60, baseCooldown: 0.30, arc: Math.PI / 3, pattern: 'orbit' },
    shield: { baseRange: 90, baseCooldown: 1.5, arc: Math.PI * 2, pattern: 'pulse' },
  },

  // --- 武器スキル説明（UI表示用） ---
  weaponSkills: {
    sword:  { name: ['衝撃波', '衝撃波', '烈風斬', '烈風斬'], desc: '周囲に衝撃波を放つ' },
    spear:  { name: ['連貫突き', '連貫突き', '天槍乱舞', '天槍乱舞'], desc: '複数方向に貫通突き' },
    bow:    { name: ['矢の雨', '矢の雨', '星雨', '星雨'], desc: '全方位に矢を放射' },
    staff:  { name: ['マジックバースト', 'マジックバースト', 'メテオ', 'メテオ'], desc: '敵密集地点に大魔法' },
    dagger: { name: ['旋風斬', '旋風斬', '影縫い', '影縫い'], desc: '範囲内に超高速連斬' },
    shield: { name: ['バリア展開', 'バリア展開', '鉄壁結界', '鉄壁結界'], desc: '無敵+全方位ノックバック' },
  },

  // --- 初期インベントリ（初期装備の石斧のみ） ---
  initialItems: [
    { blueprintId: 'stone_axe', quality: 20, traits: [] },
  ],
};
