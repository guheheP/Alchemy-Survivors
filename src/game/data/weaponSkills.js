/**
 * 武器固有スキル定義
 * blueprintId → スキル定義のマッピング
 */

export const WeaponSkillDefs = {
  // ========================
  //  SWORD (12本)
  // ========================
  stone_axe: {
    name: '岩砕き',
    description: '足元に衝撃波を放ち、周囲の敵を吹き飛ばす',
    cooldown: 13,
    type: 'shockwave',
    params: { radius: 120, dmgMult: 1.5, waves: 1, knockback: 70 },
    color: '#aa8',
    tiers: [
      { minQuality: 0,   params: { knockback: 20 } },
      { minQuality: 70,  params: { radius: 20, dmgMult: 0.3 } },
      { minQuality: 100, params: { waves: 1 } },
      { minQuality: 150, params: { radius: 30, dmgMult: 0.5, waves: 1, knockback: 30 }, flags: { aftershock: true } },
    ],
  },
  sword: {
    name: '鉄の旋風',
    description: '剣を回転させ、周囲に切り裂く風を放つ',
    cooldown: 12,
    type: 'blade_storm',
    params: { bladeCount: 4, radius: 130, duration: 2.0, dmgMult: 0.8 },
    color: '#ccc',
    tiers: [
      { minQuality: 0,   params: { duration: 0.3, dmgMult: 0.1 } },
      { minQuality: 70,  params: { bladeCount: 1, radius: 15 } },
      { minQuality: 100, params: { dmgMult: 0.2, duration: 0.5 } },
      { minQuality: 150, params: { bladeCount: 1, radius: 25, dmgMult: 0.3 }, flags: { aftershock: true } },
    ],
  },
  fire_sword: {
    name: '焔旋斬',
    description: '炎を纏った大回転斬りで周囲を焼き尽くす',
    cooldown: 11,
    type: 'spin_blade',
    params: { radius: 160, dmgMult: 2.0, spins: 2 },
    color: '#f62',
    // Rank 2: 20/85/120/170
    tiers: [
      { minQuality: 20,  params: { dmgMult: 0.2 } },
      { minQuality: 85,  params: { radius: 20 } },
      { minQuality: 120, params: { spins: 1 } },
      { minQuality: 170, params: { radius: 30, dmgMult: 0.5, spins: 1 }, flags: { aftershock: true } },
    ],
  },
  dark_blade: {
    name: '毒刃の瘴気',
    description: '毒を帯びた闇の斬撃を放ち、通った地面を毒霧で蝕む',
    cooldown: 11,
    type: 'multi_thrust_poison',
    params: { lineCount: 3, lineRange: 200, dmgMult: 2.0, width: 25, poisonDps: 3, poisonDuration: 4 },
    color: '#6a4',
    // Rank 3: 35/100/140/190
    tiers: [
      { minQuality: 35,  params: { poisonDps: 1 } },
      { minQuality: 100, params: { lineRange: 30 } },
      { minQuality: 140, params: { lineCount: 1, dmgMult: 0.3 } },
      { minQuality: 190, params: { lineCount: 1, poisonDps: 2, poisonDuration: 2 }, flags: { aftershock: true } },
    ],
  },
  holy_sword: {
    name: '聖なる裁き',
    description: '天より聖なる光の柱を降ろし、広範囲を浄化する',
    cooldown: 9,
    type: 'meteor',
    params: { radius: 140, dmgMult: 3.0 },
    color: '#ff8',
    // Rank 4: 50/115/160/215
    tiers: [
      { minQuality: 50,  params: { dmgMult: 0.3 } },
      { minQuality: 115, params: { radius: 20 } },
      { minQuality: 160, params: { dmgMult: 0.5 } },
      { minQuality: 215, params: { radius: 40, dmgMult: 0.8 } },
    ],
  },
  mithril_sword: {
    name: 'ミスリルの輝斬',
    description: 'ミスリルの輝きで周囲の敵を切り裂く連続斬撃',
    cooldown: 9,
    type: 'flurry',
    params: { hitCount: 8, radius: 150, dmgMult: 0.92 },
    color: '#8cf',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { dmgMult: 0.08 } },
      { minQuality: 135, params: { hitCount: 2 } },
      { minQuality: 180, params: { radius: 20 } },
      { minQuality: 235, params: { hitCount: 3, dmgMult: 0.2 } },
    ],
  },
  frost_blade: {
    name: '氷結領域',
    description: '周囲に極寒の領域を展開し、敵を凍結させる',
    cooldown: 10,
    type: 'freeze_zone',
    params: { radius: 160, slowAmount: -50, duration: 4 },
    color: '#8ef',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { duration: 1 } },
      { minQuality: 135, params: { radius: 20 } },
      { minQuality: 180, params: { slowAmount: -10 } },
      { minQuality: 235, params: { radius: 40, duration: 2 } },
    ],
  },
  dragon_slayer: {
    name: '竜殺しの一閃',
    description: '全力の一撃を放ち、前方の敵を一掃する',
    cooldown: 8,
    type: 'piercing_shot',
    params: { range: 300, dmgMult: 4.0, width: 40 },
    color: '#f44',
    // Rank 6: 85/150/200/260
    tiers: [
      { minQuality: 85,  params: { dmgMult: 0.5 } },
      { minQuality: 150, params: { range: 50 } },
      { minQuality: 200, params: { width: 15 } },
      { minQuality: 260, params: { range: 100, dmgMult: 1.0 } },
    ],
  },
  void_blade: {
    name: '虚無の毒爆',
    description: '虚無に満ちた毒の衝撃波が周囲を蝕む',
    cooldown: 8,
    type: 'shockwave',
    params: { radius: 200, dmgMult: 2.8, waves: 3 },
    color: '#7a6',
    // Rank 6: 85/150/200/260
    tiers: [
      { minQuality: 85,  params: { dmgMult: 0.3 } },
      { minQuality: 150, params: { radius: 20 } },
      { minQuality: 200, params: { waves: 1 } },
      { minQuality: 260, params: { radius: 40, dmgMult: 0.7, waves: 1 } },
    ],
  },
  sky_sword: {
    name: '天空裂斬',
    description: '天の力を纏い、全方位に稲妻の刃を放射する',
    cooldown: 7,
    type: 'lightning_storm',
    params: { radius: 260, dmgMult: 2.4, rays: 12 },
    color: '#ff4',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { rays: 2 } },
      { minQuality: 165, params: { dmgMult: 0.3 } },
      { minQuality: 220, params: { radius: 30 } },
      { minQuality: 280, params: { rays: 6, dmgMult: 0.6 } },
    ],
  },
  legendary_blade: {
    name: '伝説の極光斬',
    description: '伝説の力が覚醒し、画面全体に光の刃が降り注ぐ',
    cooldown: 7,
    type: 'blade_rain',
    params: { radius: 350, dmgMult: 3.5, blades: 50 },
    color: '#ffa',
    // Rank 8: 120/180/240/300
    tiers: [
      { minQuality: 120, params: { blades: 10 } },
      { minQuality: 180, params: { radius: 30 } },
      { minQuality: 240, params: { dmgMult: 0.5 } },
      { minQuality: 300, params: { blades: 30, dmgMult: 1.0 } },
    ],
  },
  time_blade: {
    name: '時空断絶',
    description: '時を止め、周囲の全ての敵に連続攻撃を叩き込む',
    cooldown: 7,
    type: 'flurry',
    params: { hitCount: 15, radius: 200, dmgMult: 1.0 },
    color: '#c8f',
    // Rank 8: 120/180/240/300
    tiers: [
      { minQuality: 120, params: { hitCount: 2 } },
      { minQuality: 180, params: { radius: 20 } },
      { minQuality: 240, params: { dmgMult: 0.2 } },
      { minQuality: 300, params: { hitCount: 5, dmgMult: 0.4 } },
    ],
  },

  // ========================
  //  SPEAR (7本)
  // ========================
  iron_spear: {
    name: '鉄槍突進',
    description: '前方に力強い突きを2方向に放つ',
    cooldown: 12,
    type: 'multi_thrust',
    params: { lineCount: 2, lineRange: 200, dmgMult: 2.3, width: 20 },
    color: '#ccc',
    // Rank 2: 20/85/120/170
    tiers: [
      { minQuality: 20,  params: { lineRange: 20 } },
      { minQuality: 85,  params: { lineCount: 1, width: 5 } },
      { minQuality: 120, params: { dmgMult: 0.4 } },
      { minQuality: 170, params: { lineCount: 1, lineRange: 60, dmgMult: 0.6 }, flags: { aftershock: true } },
    ],
  },
  flame_lance: {
    name: '炎槍乱舞',
    description: '炎の槍を3方向に放ち、通過した地面を燃やす',
    cooldown: 10,
    type: 'multi_thrust_burn',
    params: { lineCount: 3, lineRange: 250, dmgMult: 2.5, width: 25 },
    color: '#f62',
    // Rank 4: 50/115/160/215
    tiers: [
      { minQuality: 50,  params: { dmgMult: 0.3 } },
      { minQuality: 115, params: { lineRange: 30 } },
      { minQuality: 160, params: { lineCount: 1 } },
      { minQuality: 215, params: { lineCount: 1, dmgMult: 0.5, lineRange: 50 } },
    ],
  },
  thunder_hammer: {
    name: '雷神の鉄槌',
    description: '雷を纏ったハンマーを叩きつけ、周囲に雷撃を放つ',
    cooldown: 10,
    type: 'shockwave',
    params: { radius: 150, dmgMult: 3.0, waves: 2 },
    color: '#ff4',
    // Rank 4: 50/115/160/215
    tiers: [
      { minQuality: 50,  params: { dmgMult: 0.3 } },
      { minQuality: 115, params: { radius: 20 } },
      { minQuality: 160, params: { waves: 1 } },
      { minQuality: 215, params: { radius: 40, dmgMult: 0.7, waves: 1 } },
    ],
  },
  trident: {
    name: '海神の怒濤',
    description: '三叉の水流を放射し、広範囲の敵を貫く',
    cooldown: 9,
    type: 'multi_thrust',
    params: { lineCount: 3, lineRange: 280, dmgMult: 3.0, width: 30 },
    color: '#4af',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { dmgMult: 0.3 } },
      { minQuality: 135, params: { lineRange: 30 } },
      { minQuality: 180, params: { lineCount: 1 } },
      { minQuality: 235, params: { lineCount: 1, dmgMult: 0.6, width: 10 } },
    ],
  },
  thunder_spear: {
    name: '雷光連槍',
    description: '雷速の突きを5方向に放ち、稲妻で連鎖する',
    cooldown: 8,
    type: 'multi_chain',
    params: { lineCount: 5, lineRange: 220, dmgMult: 2.5, width: 22, bounces: 3, bounceRange: 140 },
    color: '#ff8',
    // Rank 6: 85/150/200/260
    tiers: [
      { minQuality: 85,  params: { bounces: 1 } },
      { minQuality: 150, params: { lineRange: 30 } },
      { minQuality: 200, params: { lineCount: 1, dmgMult: 0.3 } },
      { minQuality: 260, params: { bounces: 2, dmgMult: 0.5, bounceRange: 40 } },
    ],
  },
  wind_lance: {
    name: '疾風突貫',
    description: '風を纏った超長射程の突きを全方位に放射',
    cooldown: 7,
    type: 'multi_thrust',
    params: { lineCount: 6, lineRange: 300, dmgMult: 2.5, width: 20 },
    color: '#afa',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { lineRange: 30 } },
      { minQuality: 165, params: { dmgMult: 0.3 } },
      { minQuality: 220, params: { lineCount: 2 } },
      { minQuality: 280, params: { lineCount: 2, dmgMult: 0.5, lineRange: 60 } },
    ],
  },

  // ========================
  //  BOW (7本)
  // ========================
  wooden_bow: {
    name: '散弾射撃',
    description: '前方に扇状に矢を放つ',
    cooldown: 13,
    type: 'arrow_fan',
    params: { arrowCount: 7, range: 260, arcWidth: 0.9, dmgMult: 1.8, width: 14 },
    color: '#aa8',
    tiers: [
      { minQuality: 0,   params: { arrowCount: 1, range: 20 } },
      { minQuality: 70,  params: { dmgMult: 0.3, width: 2 } },
      { minQuality: 100, params: { arrowCount: 2, range: 40 } },
      { minQuality: 150, params: { arrowCount: 3, dmgMult: 0.5, range: 60 }, flags: { aftershock: true } },
    ],
  },
  wind_bow: {
    name: '風切りの矢',
    description: '風の力で全方位に矢を放つ',
    cooldown: 11,
    type: 'arrow_rain',
    params: { arrowCount: 14 },
    color: '#afa',
    // Rank 3: 35/100/140/190
    tiers: [
      { minQuality: 35,  params: { arrowCount: 2 } },
      { minQuality: 100, params: { arrowCount: 3 } },
      { minQuality: 140, params: { arrowCount: 5 } },
      { minQuality: 190, params: { arrowCount: 8 }, flags: { aftershock: true } },
    ],
  },
  tidal_bow: {
    name: '潮流の奔流',
    description: '水流を纏った矢の豪雨を降らせる',
    cooldown: 9,
    type: 'arrow_rain',
    params: { arrowCount: 20 },
    color: '#4af',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { arrowCount: 2 } },
      { minQuality: 135, params: { arrowCount: 4 } },
      { minQuality: 180, params: { arrowCount: 6 } },
      { minQuality: 235, params: { arrowCount: 10 } },
    ],
  },
  dragon_bow: {
    name: '竜炎弾',
    description: '竜の炎を纏った矢を敵密集地に着弾させる',
    cooldown: 8,
    type: 'meteor',
    params: { radius: 120, dmgMult: 3.5 },
    color: '#f62',
    // Rank 6: 85/150/200/260
    tiers: [
      { minQuality: 85,  params: { dmgMult: 0.3 } },
      { minQuality: 150, params: { radius: 20 } },
      { minQuality: 200, params: { dmgMult: 0.5 } },
      { minQuality: 260, params: { radius: 40, dmgMult: 1.0 } },
    ],
  },
  sky_bow: {
    name: '天翔流星群',
    description: '天空から無数の光の矢を降り注がせる',
    cooldown: 7,
    type: 'arrow_rain',
    params: { arrowCount: 32 },
    color: '#ff8',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { arrowCount: 4 } },
      { minQuality: 165, params: { arrowCount: 6 } },
      { minQuality: 220, params: { arrowCount: 8 } },
      { minQuality: 280, params: { arrowCount: 12 } },
    ],
  },
  phoenix_bow: {
    name: '不死鳥の矢',
    description: '不死鳥の炎が着弾点に燃焼エリアを生成する',
    cooldown: 7,
    type: 'burn_zone_at',
    params: { radius: 110, dmgPerSec: 3.0, duration: 5 },
    color: '#f84',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { dmgPerSec: 0.5 } },
      { minQuality: 165, params: { radius: 20 } },
      { minQuality: 220, params: { duration: 2 } },
      { minQuality: 280, params: { radius: 40, dmgPerSec: 1.5, duration: 3 } },
    ],
  },
  cosmos_bow: {
    name: '星界崩壊',
    description: '星々の力を束ね、超広範囲に星の矢を撃ち込む',
    cooldown: 7,
    type: 'arrow_rain',
    params: { arrowCount: 41 },
    color: '#faf',
    // Rank 8: 120/180/240/300
    tiers: [
      { minQuality: 120, params: { arrowCount: 5 } },
      { minQuality: 180, params: { arrowCount: 8 } },
      { minQuality: 240, params: { arrowCount: 12 } },
      { minQuality: 300, params: { arrowCount: 18 } },
    ],
  },

  // ========================
  //  STAFF (5本)
  // ========================
  mage_staff: {
    name: 'マジックバースト',
    description: '敵が密集した地点に魔力弾を着弾させる',
    cooldown: 11,
    type: 'meteor',
    params: { radius: 90, dmgMult: 3.45 },
    color: '#a6f',
    // Rank 3: 35/100/140/190
    tiers: [
      { minQuality: 35,  params: { dmgMult: 0.3 } },
      { minQuality: 100, params: { radius: 15 } },
      { minQuality: 140, params: { dmgMult: 0.5 } },
      { minQuality: 190, params: { radius: 30, dmgMult: 0.8 }, flags: { aftershock: true } },
    ],
  },
  moonlight_staff: {
    name: '月光の雨',
    description: '月の光が降り注ぎ、周囲を浄化する',
    cooldown: 10,
    type: 'meteor',
    params: { radius: 110, dmgMult: 4.0 },
    color: '#ccf',
    // Rank 4: 50/115/160/215
    tiers: [
      { minQuality: 50,  params: { dmgMult: 0.3 } },
      { minQuality: 115, params: { radius: 15 } },
      { minQuality: 160, params: { dmgMult: 0.5 } },
      { minQuality: 215, params: { radius: 35, dmgMult: 0.9 } },
    ],
  },
  elder_staff: {
    name: '大樹の祝福',
    description: '足元に癒しのエリアを展開。エリア内にいる間HPが継続回復する',
    cooldown: 13,
    type: 'regen_zone',
    // regenPerSec: 毎秒HPの何%回復するか。radius: 癒しのエリア半径。duration: 持続秒数。
    params: { radius: 120, duration: 6, regenPerSec: 0.02, dmgMult: 0.8, knockback: 40 },
    color: '#6c6',
    // Rank 5: 70/135/180/235  (ヒーラー軸: 回復量と持続を伸ばす)
    tiers: [
      { minQuality: 70,  params: { regenPerSec: 0.005 } },
      { minQuality: 135, params: { radius: 20 } },
      { minQuality: 180, params: { duration: 2 } },
      { minQuality: 235, params: { radius: 40, regenPerSec: 0.01, duration: 3 } },
    ],
  },
  aether_staff: {
    name: 'エーテル崩壊',
    description: 'エーテルの暴走で広範囲に連鎖爆発を起こす',
    cooldown: 8,
    type: 'chain_lightning',
    params: { bounces: 10, dmgMult: 4.0, bounceRange: 140 },
    color: '#8ff',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { bounces: 2 } },
      { minQuality: 165, params: { dmgMult: 0.4 } },
      { minQuality: 220, params: { bounceRange: 30 } },
      { minQuality: 280, params: { bounces: 5, dmgMult: 0.8, bounceRange: 50 } },
    ],
  },
  world_tree_staff: {
    name: '世界樹の裁き',
    description: '世界樹の根が地を割り、全敵に大ダメージを与える',
    cooldown: 7,
    type: 'world_break',
    params: { dmgMult: 5.5 },
    color: '#4f4',
    // Rank 8: 120/180/240/300  (純火力軸: dmgMult のみ)
    tiers: [
      { minQuality: 120, params: { dmgMult: 0.5 } },
      { minQuality: 180, params: { dmgMult: 1.0 } },
      { minQuality: 240, params: { dmgMult: 1.5 } },
      { minQuality: 300, params: { dmgMult: 2.5 } },
    ],
  },

  // ========================
  //  DAGGER (3本)
  // ========================
  silver_dagger: {
    name: '銀光乱舞',
    description: '高速の連続斬りで周囲の敵を切り刻む',
    cooldown: 11,
    type: 'flurry',
    params: { hitCount: 6, radius: 80, dmgMult: 0.8 },
    color: '#ccc',
    // Rank 2: 20/85/120/170
    tiers: [
      { minQuality: 20,  params: { dmgMult: 0.1 } },
      { minQuality: 85,  params: { hitCount: 2 } },
      { minQuality: 120, params: { radius: 15 } },
      { minQuality: 170, params: { hitCount: 3, dmgMult: 0.2, radius: 20 }, flags: { aftershock: true } },
    ],
  },
  poison_dagger: {
    name: '猛毒散布',
    description: '毒の霧を展開し、範囲内の敵を蝕む',
    cooldown: 10,
    type: 'burn_zone',
    params: { radius: 100, dmgPerSec: 2.0, duration: 5 },
    color: '#6a4',
    // Rank 3: 35/100/140/190
    tiers: [
      { minQuality: 35,  params: { dmgPerSec: 0.5 } },
      { minQuality: 100, params: { radius: 15 } },
      { minQuality: 140, params: { duration: 2 } },
      { minQuality: 190, params: { radius: 30, dmgPerSec: 1.5, duration: 3 }, flags: { aftershock: true } },
    ],
  },
  sea_serpent_whip: {
    name: '海竜の咆哮',
    description: '海竜の力で周囲に水流の渦を巻き起こす',
    cooldown: 8,
    type: 'flurry',
    params: { hitCount: 12, radius: 130, dmgMult: 1.0 },
    color: '#4af',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { dmgMult: 0.1 } },
      { minQuality: 135, params: { hitCount: 2 } },
      { minQuality: 180, params: { radius: 20 } },
      { minQuality: 235, params: { hitCount: 4, dmgMult: 0.3 } },
    ],
  },

  // ========================
  //  SHIELD (7本)
  // ========================
  shield: {
    name: '木盾の壁',
    description: 'バリアを展開し、周囲の敵を押し返す',
    cooldown: 13,
    type: 'barrier',
    params: { radius: 100, knockback: 80, dmgMult: 0.5, invincDuration: 1.0 },
    color: '#aa8',
    tiers: [
      { minQuality: 0,   params: { radius: 10 } },
      { minQuality: 70,  params: { knockback: 20, invincDuration: 0.3 } },
      { minQuality: 100, params: { dmgMult: 0.3, radius: 20 } },
      { minQuality: 150, params: { knockback: 50, invincDuration: 0.5, dmgMult: 0.5 }, flags: { aftershock: true } },
    ],
  },
  ice_shield: {
    name: '氷結の盾',
    description: '氷のバリアで敵を凍結し、動きを封じる',
    cooldown: 11,
    type: 'freeze_barrier',
    params: { radius: 130, knockback: 40, dmgMult: 0.8, invincDuration: 1.2, slowAmount: -40, duration: 3 },
    color: '#8ef',
    // Rank 2: 20/85/120/170
    tiers: [
      { minQuality: 20,  params: { invincDuration: 0.3 } },
      { minQuality: 85,  params: { radius: 15 } },
      { minQuality: 120, params: { dmgMult: 0.3, knockback: 20 } },
      { minQuality: 170, params: { radius: 30, slowAmount: -20, duration: 2, invincDuration: 0.4 }, flags: { aftershock: true } },
    ],
  },
  lava_shield: {
    name: '溶岩の壁',
    description: '溶岩のバリアで敵を焼き、大きく弾き飛ばす',
    cooldown: 10,
    type: 'barrier',
    params: { radius: 140, knockback: 100, dmgMult: 1.5, invincDuration: 1.5 },
    color: '#f62',
    // Rank 4: 50/115/160/215
    tiers: [
      { minQuality: 50,  params: { dmgMult: 0.2 } },
      { minQuality: 115, params: { radius: 15 } },
      { minQuality: 160, params: { knockback: 30, invincDuration: 0.3 } },
      { minQuality: 215, params: { radius: 30, dmgMult: 0.5, knockback: 50 } },
    ],
  },
  mithril_shield: {
    name: 'ミスリルの輝盾',
    description: 'ミスリルの輝きで敵を弾き、長時間の無敵を得る',
    cooldown: 9,
    type: 'barrier',
    params: { radius: 150, knockback: 90, dmgMult: 1.15, invincDuration: 2.5 },
    color: '#8cf',
    // Rank 5: 70/135/180/235
    tiers: [
      { minQuality: 70,  params: { invincDuration: 0.3 } },
      { minQuality: 135, params: { radius: 15 } },
      { minQuality: 180, params: { dmgMult: 0.3, knockback: 20 } },
      { minQuality: 235, params: { radius: 25, dmgMult: 0.5, invincDuration: 0.5 } },
    ],
  },
  scale_shield: {
    name: '竜鱗の守護',
    description: '竜鱗のバリアで超広範囲をカバーし、反撃する',
    cooldown: 8,
    type: 'barrier',
    params: { radius: 180, knockback: 120, dmgMult: 2.3, invincDuration: 2.0 },
    color: '#f84',
    // Rank 6: 85/150/200/260
    tiers: [
      { minQuality: 85,  params: { dmgMult: 0.3 } },
      { minQuality: 150, params: { radius: 15 } },
      { minQuality: 200, params: { knockback: 30, invincDuration: 0.3 } },
      { minQuality: 260, params: { radius: 30, dmgMult: 0.6, invincDuration: 0.5 } },
    ],
  },
  star_shield: {
    name: '星光結界',
    description: '星の力で結界を展開し、全方位に衝撃波を放つ',
    cooldown: 7,
    type: 'barrier_shockwave',
    params: { radius: 220, knockback: 100, dmgMult: 4.0, waves: 3, invincDuration: 1.5 },
    color: '#ff8',
    // Rank 7: 105/165/220/280
    tiers: [
      { minQuality: 105, params: { dmgMult: 0.3 } },
      { minQuality: 165, params: { radius: 15 } },
      { minQuality: 220, params: { waves: 1 } },
      { minQuality: 280, params: { radius: 30, dmgMult: 0.7, waves: 1 } },
    ],
  },
  oblivion_shield: {
    name: '忘却の結界',
    description: '全てを忘却に帰す結界。長時間無敵+超ノックバック',
    cooldown: 7,
    type: 'barrier',
    params: { radius: 250, knockback: 200, dmgMult: 2.9, invincDuration: 3.0 },
    color: '#a6f',
    // Rank 8: 120/180/240/300 (oblivion_shield は WEAPON_RANK_MAP 未登録のためデフォルト 8)
    tiers: [
      { minQuality: 120, params: { invincDuration: 0.3 } },
      { minQuality: 180, params: { radius: 15 } },
      { minQuality: 240, params: { knockback: 30, dmgMult: 0.3 } },
      { minQuality: 300, params: { radius: 30, dmgMult: 0.7, invincDuration: 0.5, knockback: 50 } },
    ],
  },
};
