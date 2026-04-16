/**
 * 属性コンボ定義 — 複数の状態異常が同時にかかった敵に発動する特別効果
 *
 * キー形式: ソート済み状態異常名を '+' で連結 (例: 'burn+poison')
 * 必ず `Object.freeze` された状態で export。
 *
 * ## フィールド
 * - id: アチーブメント/ログ用の一意キー
 * - name: 日本語表示名
 * - icon: アイコン文字列 (絵文字連結可)
 * - color: 演出色
 * - requires: 必須状態異常 (型) 配列
 * - effect.kind: 'aoe_damage' | 'debuff' | 'chain' | 'slow_field'
 * - effect.damageBase: 'hitDamage' | 'burnDps' | 'poisonDps' | 'fixed' (kind=aoe_damage/chain時)
 * - effect.damageMult: ダメージ倍率
 * - effect.radius: 効果半径 (px)
 * - effect.appliesStatus?: { type, params } (新規付与する状態異常)
 * - consume: 発動後に消費する状態異常配列
 * - cooldown: 同一敵での次回発動までの秒数
 * - fx: { shockwave?, burst?, shake?, flash? } 演出設定
 */

/**
 * 発動キーを正規化 (ソート済み + ソート)
 * @param {string[]} types
 */
export function makeComboKey(types) {
  return [...types].sort().join('+');
}

export const ElementCombos = {
  // 炎 + 毒 = 毒炎爆発 (周囲に炎ダメージ + 毒拡散)
  'burn+poison': {
    id: 'wildfire',
    name: '毒炎爆発',
    displayName: 'WILDFIRE',
    icon: '🔥☣',
    color: '#fa4',
    requires: ['burn', 'poison'],
    effect: {
      kind: 'aoe_damage',
      damageBase: 'hitDamage',
      damageMult: 1.0,
      radius: 90,
      // 毒を周囲に拡散 (半減)
      appliesStatus: { type: 'poison', params: { duration: 2.0, dpsMult: 0.5 } },
    },
    consume: ['burn'], // 炎は消費、毒は残す
    cooldown: 1.5,
    fx: { shockwave: true, burst: 20, shake: 4, flash: true },
  },

  // 氷 + 雷 = 粉砕 (凍結した敵を破壊、大ダメージ)
  'freeze+shock': {
    id: 'shatter',
    name: '粉砕',
    displayName: 'SHATTER',
    icon: '❄⚡',
    color: '#cff',
    requires: ['freeze', 'shock'],
    effect: {
      kind: 'aoe_damage',
      damageBase: 'hitDamage',
      damageMult: 1.2,
      radius: 60,
    },
    consume: ['freeze', 'shock'], // 両方消費
    cooldown: 2.0,
    fx: { shockwave: true, burst: 30, shake: 6, flash: true },
  },

  // 水 + 雷 = 感電爆 (連鎖雷撃)
  'shock+vulnerable': {
    id: 'electrocute',
    name: '感電爆',
    displayName: 'ELECTROCUTE',
    icon: '💧⚡',
    color: '#8cf',
    requires: ['shock', 'vulnerable'],
    effect: {
      kind: 'chain',
      damageBase: 'hitDamage',
      damageMult: 0.4, // chainCount 4 体への分散を考慮して 1 発あたりは小さめ
      radius: 160, // 連鎖範囲
      chainCount: 4,
      appliesStatus: { type: 'shock', params: { duration: 0.3 } },
    },
    consume: [], // 残す (連鎖を誘発し続ける)
    cooldown: 1.8,
    fx: { burst: 15, shake: 3 },
  },

  // 氷 + 水 = 凍結地帯 (周囲の敵を大幅スロー)
  'freeze+vulnerable': {
    id: 'frozen_ground',
    name: '凍結地帯',
    displayName: 'FROZEN GROUND',
    icon: '❄💧',
    color: '#acf',
    requires: ['freeze', 'vulnerable'],
    effect: {
      kind: 'slow_field',
      radius: 100,
      appliesStatus: { type: 'freeze', params: { duration: 1.5, speedMod: -60 } },
    },
    consume: [], // 両方残す (氷水ビルドが続く)
    cooldown: 2.5,
    fx: { shockwave: true, burst: 12, shake: 2 },
  },

  // 炎 + 氷 = 蒸気 (視界/防御ダウン・脆弱付与)
  'burn+freeze': {
    id: 'steam',
    name: '蒸気',
    displayName: 'STEAM',
    icon: '🔥❄',
    color: '#fff',
    requires: ['burn', 'freeze'],
    effect: {
      kind: 'debuff',
      radius: 80,
      appliesStatus: { type: 'vulnerable', params: { duration: 4.0, damageMultiplier: 0.25 } },
    },
    consume: ['freeze'], // 氷が溶ける
    cooldown: 2.0,
    fx: { shockwave: true, burst: 18, shake: 2 },
  },

  // 炎 + 雷 = 爆発 (強力な範囲ダメージ)
  'burn+shock': {
    id: 'explosion',
    name: '爆発',
    displayName: 'EXPLOSION',
    icon: '🔥⚡',
    color: '#f94',
    requires: ['burn', 'shock'],
    effect: {
      kind: 'aoe_damage',
      damageBase: 'burnDps', // burnDps×3 ≈ hitDamage×0.75 なので mult 1.3 で ~1.0× hitDamage 相当
      damageMult: 1.3,
      radius: 110,
    },
    consume: ['burn', 'shock'], // 両方消費
    cooldown: 2.5,
    fx: { shockwave: true, burst: 35, shake: 7, flash: true },
  },

  // 毒 + 雷 = 腐食感電 (防御力大幅低下、持続脆弱化)
  'poison+shock': {
    id: 'corrosive_shock',
    name: '腐食感電',
    displayName: 'CORROSIVE SHOCK',
    icon: '☣⚡',
    color: '#af6',
    requires: ['poison', 'shock'],
    effect: {
      kind: 'debuff',
      appliesStatus: { type: 'vulnerable', params: { duration: 5.0, damageMultiplier: 0.30 } },
    },
    consume: ['shock'], // 感電消費、毒残す
    cooldown: 2.0,
    fx: { burst: 16, shake: 2 },
  },

  // 毒 + 氷 = 凍結毒 (毒DoT増幅、氷持続)
  'freeze+poison': {
    id: 'frozen_toxin',
    name: '凍結毒',
    displayName: 'FROZEN TOXIN',
    icon: '❄☣',
    color: '#8cf',
    requires: ['freeze', 'poison'],
    effect: {
      kind: 'aoe_damage',
      damageBase: 'poisonDps', // poisonDps×3 ≈ hitDamage×0.36 と基準自体が小さいので、追加効果として控えめに
      damageMult: 1.2,
      radius: 70,
      // 周囲の敵に毒拡散
      appliesStatus: { type: 'poison', params: { duration: 3.0, dpsMult: 0.6 } },
    },
    consume: [], // 両方残す (毒結晶化)
    cooldown: 2.2,
    fx: { shockwave: true, burst: 14, shake: 3 },
  },
};

Object.freeze(ElementCombos);

/** 状態異常タイプの組み合わせからコンボ定義を引く。なければ null */
export function findCombo(type1, type2) {
  const key = makeComboKey([type1, type2]);
  return ElementCombos[key] || null;
}
