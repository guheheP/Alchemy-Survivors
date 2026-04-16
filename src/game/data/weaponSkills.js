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
  },
  sword: {
    name: '鉄の旋風',
    description: '剣を回転させ、周囲に切り裂く風を放つ',
    cooldown: 12,
    type: 'blade_storm',
    params: { bladeCount: 4, radius: 130, duration: 2.0, dmgMult: 0.8 },
    color: '#ccc',
  },
  fire_sword: {
    name: '焔旋斬',
    description: '炎を纏った大回転斬りで周囲を焼き尽くす',
    cooldown: 11,
    type: 'spin_blade',
    params: { radius: 160, dmgMult: 2.5, spins: 2 },
    color: '#f62',
  },
  dark_blade: {
    name: '暗黒波動',
    description: '暗黒の力を解放し、前方に闇の斬撃波を放つ',
    cooldown: 11,
    type: 'multi_thrust',
    params: { lineCount: 3, lineRange: 200, dmgMult: 2.3, width: 25 },
    color: '#639',
  },
  holy_sword: {
    name: '聖なる裁き',
    description: '天より聖なる光の柱を降ろし、広範囲を浄化する',
    cooldown: 9,
    type: 'meteor',
    params: { radius: 140, dmgMult: 4.6 },
    color: '#ff8',
  },
  mithril_sword: {
    name: 'ミスリルの輝斬',
    description: 'ミスリルの輝きで周囲の敵を切り裂く連続斬撃',
    cooldown: 9,
    type: 'flurry',
    params: { hitCount: 8, radius: 150, dmgMult: 0.92 },
    color: '#8cf',
  },
  frost_blade: {
    name: '氷結領域',
    description: '周囲に極寒の領域を展開し、敵を凍結させる',
    cooldown: 10,
    type: 'freeze_zone',
    params: { radius: 160, slowAmount: -50, duration: 4 },
    color: '#8ef',
  },
  dragon_slayer: {
    name: '竜殺しの一閃',
    description: '全力の一撃を放ち、前方の敵を一掃する',
    cooldown: 8,
    type: 'piercing_shot',
    params: { range: 300, dmgMult: 6.9, width: 40 },
    color: '#f44',
  },
  void_blade: {
    name: '虚無崩壊',
    description: '虚無の力が暴走し、周囲の時空を歪める',
    cooldown: 8,
    type: 'shockwave',
    params: { radius: 200, dmgMult: 4.6, waves: 3 },
    color: '#a4f',
  },
  sky_sword: {
    name: '天空裂斬',
    description: '天の力を纏い、全方位に稲妻の刃を放射する',
    cooldown: 7,
    type: 'lightning_storm',
    params: { radius: 260, dmgMult: 3.0, rays: 12 },
    color: '#ff4',
  },
  legendary_blade: {
    name: '伝説の極光斬',
    description: '伝説の力が覚醒し、画面全体に光の刃が降り注ぐ',
    cooldown: 7,
    type: 'blade_rain',
    params: { radius: 350, dmgMult: 5.75, blades: 50 },
    color: '#ffa',
  },
  time_blade: {
    name: '時空断絶',
    description: '時を止め、周囲の全ての敵に連続攻撃を叩き込む',
    cooldown: 7,
    type: 'flurry',
    params: { hitCount: 15, radius: 200, dmgMult: 1.15 },
    color: '#c8f',
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
  },
  flame_lance: {
    name: '炎槍乱舞',
    description: '炎の槍を3方向に放ち、通過した地面を燃やす',
    cooldown: 10,
    type: 'multi_thrust_burn',
    params: { lineCount: 3, lineRange: 250, dmgMult: 2.5, width: 25 },
    color: '#f62',
  },
  thunder_hammer: {
    name: '雷神の鉄槌',
    description: '雷を纏ったハンマーを叩きつけ、周囲に雷撃を放つ',
    cooldown: 10,
    type: 'shockwave',
    params: { radius: 150, dmgMult: 3.0, waves: 2 },
    color: '#ff4',
  },
  trident: {
    name: '海神の怒濤',
    description: '三叉の水流を放射し、広範囲の敵を貫く',
    cooldown: 9,
    type: 'multi_thrust',
    params: { lineCount: 3, lineRange: 280, dmgMult: 3.0, width: 30 },
    color: '#4af',
  },
  thunder_spear: {
    name: '雷光連槍',
    description: '雷速の突きを5方向に放ち、稲妻で連鎖する',
    cooldown: 8,
    type: 'multi_chain',
    params: { lineCount: 5, lineRange: 220, dmgMult: 2.5, width: 22, bounces: 3, bounceRange: 140 },
    color: '#ff8',
  },
  wind_lance: {
    name: '疾風突貫',
    description: '風を纏った超長射程の突きを全方位に放射',
    cooldown: 7,
    type: 'multi_thrust',
    params: { lineCount: 6, lineRange: 300, dmgMult: 2.5, width: 20 },
    color: '#afa',
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
  },
  wind_bow: {
    name: '風切りの矢',
    description: '風の力で全方位に矢を放つ',
    cooldown: 11,
    type: 'arrow_rain',
    params: { arrowCount: 14 },
    color: '#afa',
  },
  tidal_bow: {
    name: '潮流の奔流',
    description: '水流を纏った矢の豪雨を降らせる',
    cooldown: 9,
    type: 'arrow_rain',
    params: { arrowCount: 20 },
    color: '#4af',
  },
  dragon_bow: {
    name: '竜炎弾',
    description: '竜の炎を纏った矢を敵密集地に着弾させる',
    cooldown: 8,
    type: 'meteor',
    params: { radius: 120, dmgMult: 4.0 },
    color: '#f62',
  },
  sky_bow: {
    name: '天翔流星群',
    description: '天空から無数の光の矢を降り注がせる',
    cooldown: 7,
    type: 'arrow_rain',
    params: { arrowCount: 32 },
    color: '#ff8',
  },
  phoenix_bow: {
    name: '不死鳥の矢',
    description: '不死鳥の炎が着弾点に燃焼エリアを生成する',
    cooldown: 7,
    type: 'burn_zone_at',
    params: { radius: 110, dmgPerSec: 3.0, duration: 5 },
    color: '#f84',
  },
  cosmos_bow: {
    name: '星界崩壊',
    description: '星々の力を束ね、超広範囲に星の矢を撃ち込む',
    cooldown: 7,
    type: 'arrow_rain',
    params: { arrowCount: 41 },
    color: '#faf',
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
  },
  moonlight_staff: {
    name: '月光の雨',
    description: '月の光が降り注ぎ、周囲を浄化する',
    cooldown: 10,
    type: 'meteor',
    params: { radius: 110, dmgMult: 4.6 },
    color: '#ccf',
  },
  elder_staff: {
    name: '大樹の祝福',
    description: '足元に癒しのエリアを展開。エリア内にいる間HPが継続回復する',
    cooldown: 13,
    type: 'regen_zone',
    // regenPerSec: 毎秒HPの何%回復するか。radius: 癒しのエリア半径。duration: 持続秒数。
    params: { radius: 120, duration: 6, regenPerSec: 0.02, dmgMult: 0.8, knockback: 40 },
    color: '#6c6',
  },
  aether_staff: {
    name: 'エーテル崩壊',
    description: 'エーテルの暴走で広範囲に連鎖爆発を起こす',
    cooldown: 8,
    type: 'chain_lightning',
    params: { bounces: 10, dmgMult: 4.0, bounceRange: 140 },
    color: '#8ff',
  },
  world_tree_staff: {
    name: '世界樹の裁き',
    description: '世界樹の根が地を割り、全敵に大ダメージを与える',
    cooldown: 7,
    type: 'world_break',
    params: { dmgMult: 6.9 },
    color: '#4f4',
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
  },
  poison_dagger: {
    name: '猛毒散布',
    description: '毒の霧を展開し、範囲内の敵を蝕む',
    cooldown: 10,
    type: 'burn_zone',
    params: { radius: 100, dmgPerSec: 2.0, duration: 5 },
    color: '#6a4',
  },
  sea_serpent_whip: {
    name: '海竜の咆哮',
    description: '海竜の力で周囲に水流の渦を巻き起こす',
    cooldown: 8,
    type: 'flurry',
    params: { hitCount: 12, radius: 130, dmgMult: 1.0 },
    color: '#4af',
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
  },
  ice_shield: {
    name: '氷結の盾',
    description: '氷のバリアで敵を凍結し、動きを封じる',
    cooldown: 11,
    type: 'freeze_barrier',
    params: { radius: 130, knockback: 40, dmgMult: 0.8, invincDuration: 1.2, slowAmount: -40, duration: 3 },
    color: '#8ef',
  },
  lava_shield: {
    name: '溶岩の壁',
    description: '溶岩のバリアで敵を焼き、大きく弾き飛ばす',
    cooldown: 10,
    type: 'barrier',
    params: { radius: 140, knockback: 100, dmgMult: 1.5, invincDuration: 1.5 },
    color: '#f62',
  },
  mithril_shield: {
    name: 'ミスリルの輝盾',
    description: 'ミスリルの輝きで敵を弾き、長時間の無敵を得る',
    cooldown: 9,
    type: 'barrier',
    params: { radius: 150, knockback: 90, dmgMult: 1.15, invincDuration: 2.5 },
    color: '#8cf',
  },
  scale_shield: {
    name: '竜鱗の守護',
    description: '竜鱗のバリアで超広範囲をカバーし、反撃する',
    cooldown: 8,
    type: 'barrier',
    params: { radius: 180, knockback: 120, dmgMult: 2.3, invincDuration: 2.0 },
    color: '#f84',
  },
  star_shield: {
    name: '星光結界',
    description: '星の力で結界を展開し、全方位に衝撃波を放つ',
    cooldown: 7,
    type: 'barrier_shockwave',
    params: { radius: 220, knockback: 100, dmgMult: 4.0, waves: 3, invincDuration: 1.5 },
    color: '#ff8',
  },
  oblivion_shield: {
    name: '忘却の結界',
    description: '全てを忘却に帰す結界。長時間無敵+超ノックバック',
    cooldown: 7,
    type: 'barrier',
    params: { radius: 250, knockback: 200, dmgMult: 2.9, invincDuration: 3.0 },
    color: '#a6f',
  },
};
