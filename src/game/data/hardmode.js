/**
 * 難易度修飾パラメータ
 *
 *  - normal      : modifier 無し（既定）
 *  - hard        : 通常モードクリア済エリアでのみ選択可能
 *  - challenge   : ハードモードクリア済エリアでのみ選択可能
 *  - nightmare   : チャレンジモードクリア済エリアでのみ選択可能
 *
 * 倍率は Hard×2 / Challenge×5 / Nightmare×12 (敵HP基準) の極端カーブ。
 * その代わり素材品質ボーナス・ドロップ率も飛躍的に伸ばし、難易度別 traitPool で
 * 上位レアリティ特性が出やすくなる。
 */

export const HardModeModifiers = {
  enemyHpMultiplier: 2.0,
  enemyDamageMultiplier: 1.5,
  enemySpeedMultiplier: 1.2,
  spawnRateMultiplier: 1.5,
  bossHpMultiplier: 2.5,
  bossDamageMultiplier: 1.5,
  dropRateMultiplier: 1.3,
  goldMultiplier: 2.0,
  qualityBonusMin: 10,
  qualityBonusMax: 20,
  maxEnemies: 500,
};

export const ChallengeModeModifiers = {
  enemyHpMultiplier: 5.0,
  enemyDamageMultiplier: 3.0,
  enemySpeedMultiplier: 1.4,
  spawnRateMultiplier: 2.0,
  bossHpMultiplier: 6.0,
  bossDamageMultiplier: 3.0,
  dropRateMultiplier: 1.7,
  goldMultiplier: 3.5,
  qualityBonusMin: 25,
  qualityBonusMax: 35,
  maxEnemies: 700,
};

export const NightmareModeModifiers = {
  enemyHpMultiplier: 12.0,
  enemyDamageMultiplier: 6.0,
  enemySpeedMultiplier: 1.6,
  spawnRateMultiplier: 3.0,
  bossHpMultiplier: 15.0,
  bossDamageMultiplier: 6.0,
  dropRateMultiplier: 2.5,
  goldMultiplier: 6.0,
  qualityBonusMin: 45,
  qualityBonusMax: 60,
  maxEnemies: 1000,
};

/**
 * 難易度ID → modifier のマップ。null は通常モード。
 * difficulty 文字列を直接受け取る箇所はここから取得して runtime に流す。
 */
export const DifficultyModifiers = {
  normal:    null,
  hard:      HardModeModifiers,
  challenge: ChallengeModeModifiers,
  nightmare: NightmareModeModifiers,
};

/** UI 用メタ情報 */
export const DifficultyMeta = {
  normal:    { id: 'normal',    label: 'ノーマル',     icon: '🌱', shortDesc: '通常難易度' },
  hard:      { id: 'hard',      label: 'ハード',       icon: '🔥', shortDesc: '敵HP×2 / 攻撃×1.5 / 品質+10〜20' },
  challenge: { id: 'challenge', label: 'チャレンジ',   icon: '⚔️', shortDesc: '敵HP×5 / 攻撃×3 / 品質+25〜35' },
  nightmare: { id: 'nightmare', label: 'ナイトメア',   icon: '💀', shortDesc: '敵HP×12 / 攻撃×6 / 品質+45〜60' },
};

/** 順序リスト（UI のラジオ表示順） */
export const DIFFICULTY_ORDER = ['normal', 'hard', 'challenge', 'nightmare'];
