/**
 * アイテム・レシピのマスターデータ定義
 *
 * type: 'material' | 'equipment' | 'consumable' | 'accessory'
 * tier: 1〜5 (素材の希少度。高いほどレア)
 * category: 素材カテゴリ（カテゴリ指定レシピで使用）
 */

// equipType → 装備スロット のマッピング
const WEAPON_TYPES = new Set(['sword', 'bow', 'staff', 'dagger', 'spear']);
const ARMOR_TYPES = new Set(['shield', 'armor', 'robe']);

/** アイテム（またはBlueprint）の装備スロットを返す ('weapon' | 'armor' | 'accessory' | null) */
export function getEquipSlot(item) {
  if (!item) return null;
  // blueprintId からブループリントを引く（item自体がBPの場合もある）
  const bp = item.blueprintId ? (ItemBlueprints[item.blueprintId] || item) : item;
  if (bp.type === 'accessory') return 'accessory';
  if (bp.type === 'equipment' && bp.equipType) {
    if (WEAPON_TYPES.has(bp.equipType)) return 'weapon';
    if (ARMOR_TYPES.has(bp.equipType)) return 'armor';
  }
  return null;
}

// =====================================================================
//  素材カテゴリ定義
// =====================================================================
export const MaterialCategories = {
  wood_type: { id: 'wood_type', name: '木材系', icon: '🪵' },
  stone_type: { id: 'stone_type', name: '石材系', icon: '🪨' },
  ore_type: { id: 'ore_type', name: '鉱石系', icon: '⛏️' },
  herb_type: { id: 'herb_type', name: '薬草系', icon: '🌿' },
  cloth_type: { id: 'cloth_type', name: '布素材系', icon: '🧵' },
  crystal_type: { id: 'crystal_type', name: '結晶系', icon: '💎' },
  monster_type: { id: 'monster_type', name: 'モンスター素材系', icon: '👹' },
  gem_type: { id: 'gem_type', name: '宝石系', icon: '💠' },
  essence_type: { id: 'essence_type', name: 'エッセンス系', icon: '✨' },
};

export const ItemBlueprints = {
  // =====================================================================
  //  素 材 (50種)
  // =====================================================================

  // --- Tier 1: 草原・基本 (10種) ---
  wood: { id: 'wood', name: '木材', type: 'material', tier: 1, baseValue: 4, category: 'wood_type', image: '/art/items/wood.png' },
  stone: { id: 'stone', name: '石材', type: 'material', tier: 1, baseValue: 4, category: 'stone_type', image: '/art/items/stone.png' },
  herb: { id: 'herb', name: '薬草', type: 'material', tier: 1, baseValue: 6, category: 'herb_type', image: '/art/items/herb.png' },
  slime_jelly: { id: 'slime_jelly', name: 'スライムゼリー', type: 'material', tier: 1, baseValue: 8, category: 'monster_type', image: '/art/items/slime_jelly.png' },
  clay: { id: 'clay', name: '粘土', type: 'material', tier: 1, baseValue: 3, image: '/art/items/clay.png' },
  flower_petal: { id: 'flower_petal', name: '花びら', type: 'material', tier: 1, baseValue: 5, category: 'herb_type', image: '/art/items/flower_petal.png' },
  bug_shell: { id: 'bug_shell', name: '虫の殻', type: 'material', tier: 1, baseValue: 6, category: 'monster_type', image: '/art/items/bug_shell.png' },
  feather_small: { id: 'feather_small', name: '小さな羽根', type: 'material', tier: 1, baseValue: 5, image: '/art/items/feather_small.png' },
  sand: { id: 'sand', name: '砂', type: 'material', tier: 1, baseValue: 3, image: '/art/items/sand.png' },
  mushroom: { id: 'mushroom', name: 'キノコ', type: 'material', tier: 1, baseValue: 7, category: 'herb_type', image: '/art/items/mushroom.png' },

  // --- Tier 2: 洞窟・丘陵 (10種) ---
  iron_ore: { id: 'iron_ore', name: '鉄鉱石', type: 'material', tier: 2, baseValue: 12, category: 'ore_type', image: '/art/items/iron_ore.png' },
  cloth: { id: 'cloth', name: '魔法の布', type: 'material', tier: 2, baseValue: 10, category: 'cloth_type', image: '/art/items/cloth.png' },
  crystal: { id: 'crystal', name: '水晶', type: 'material', tier: 2, baseValue: 15, category: 'crystal_type', image: '/art/items/crystal.png' },
  poison_herb: { id: 'poison_herb', name: '毒草', type: 'material', tier: 2, baseValue: 14, category: 'herb_type', image: '/art/items/poison_herb.png' },
  silver_ore: { id: 'silver_ore', name: '銀鉱石', type: 'material', tier: 2, baseValue: 16, category: 'ore_type', image: '/art/items/silver_ore.png' },
  moss_stone: { id: 'moss_stone', name: '苔石', type: 'material', tier: 2, baseValue: 11, category: 'stone_type', image: '/art/items/moss_stone.png' },
  spider_silk: { id: 'spider_silk', name: '蜘蛛の糸', type: 'material', tier: 2, baseValue: 13, category: 'cloth_type', image: '/art/items/spider_silk.png' },
  dark_stone: { id: 'dark_stone', name: '暗黒石', type: 'material', tier: 2, baseValue: 15, category: 'stone_type', image: '/art/items/dark_stone.png' },
  bone: { id: 'bone', name: '古びた骨', type: 'material', tier: 2, baseValue: 10, category: 'monster_type', image: '/art/items/bone.png' },
  amber: { id: 'amber', name: '琥珀', type: 'material', tier: 2, baseValue: 14, category: 'gem_type', image: '/art/items/amber.png' },

  // --- Tier 3: 妖精の森・火山 (10種) ---
  fire_stone: { id: 'fire_stone', name: '火石', type: 'material', tier: 3, baseValue: 25, image: '/art/items/fire_stone.png' },
  ice_shard: { id: 'ice_shard', name: '氷片', type: 'material', tier: 3, baseValue: 25, category: 'crystal_type', image: '/art/items/ice_shard.png' },
  feather: { id: 'feather', name: '不死鳥の羽', type: 'material', tier: 3, baseValue: 40, image: '/art/items/feather.png' },
  dragon_scale: { id: 'dragon_scale', name: '竜の鱗', type: 'material', tier: 3, baseValue: 50, category: 'monster_type', image: '/art/items/dragon_scale.png' },
  fairy_dust: { id: 'fairy_dust', name: '妖精の粉', type: 'material', tier: 3, baseValue: 30, category: 'essence_type', image: '/art/items/fairy_dust.png' },
  lava_core: { id: 'lava_core', name: '溶岩核', type: 'material', tier: 3, baseValue: 28, image: '/art/items/lava_core.png' },
  spirit_essence: { id: 'spirit_essence', name: '精霊のエッセンス', type: 'material', tier: 3, baseValue: 35, category: 'essence_type', image: '/art/items/spirit_essence.png' },
  enchanted_wood: { id: 'enchanted_wood', name: '霊樹の枝', type: 'material', tier: 3, baseValue: 22, category: 'wood_type', image: '/art/items/enchanted_wood.png' },
  thunder_stone: { id: 'thunder_stone', name: '雷石', type: 'material', tier: 3, baseValue: 30, image: '/art/items/thunder_stone.png' },
  cursed_gem: { id: 'cursed_gem', name: '呪いの宝石', type: 'material', tier: 3, baseValue: 32, category: 'gem_type', image: '/art/items/cursed_gem.png' },

  // --- Tier 4: 深海・竜の巣 (10種) ---
  deep_pearl: { id: 'deep_pearl', name: '深海の真珠', type: 'material', tier: 4, baseValue: 55, category: 'gem_type', image: '/art/items/deep_pearl.png' },
  moonstone: { id: 'moonstone', name: '月光石', type: 'material', tier: 4, baseValue: 60, category: 'gem_type', image: '/art/items/moonstone.png' },
  wind_crystal: { id: 'wind_crystal', name: '風の結晶', type: 'material', tier: 4, baseValue: 50, category: 'crystal_type', image: '/art/items/wind_crystal.png' },
  coral_fragment: { id: 'coral_fragment', name: '古代珊瑚', type: 'material', tier: 4, baseValue: 45, image: '/art/items/coral_fragment.png' },
  mithril_ore: { id: 'mithril_ore', name: 'ミスリル鉱', type: 'material', tier: 4, baseValue: 65, category: 'ore_type', image: '/art/items/mithril_ore.png' },
  void_shard: { id: 'void_shard', name: '虚空の欠片', type: 'material', tier: 4, baseValue: 55, category: 'essence_type', image: '/art/items/void_shard.png' },
  elder_bark: { id: 'elder_bark', name: '長老樹の樹皮', type: 'material', tier: 4, baseValue: 48, category: 'wood_type', image: '/art/items/elder_bark.png' },
  sea_serpent_fin: { id: 'sea_serpent_fin', name: '海竜のヒレ', type: 'material', tier: 4, baseValue: 58, category: 'monster_type', image: '/art/items/sea_serpent_fin.png' },
  frozen_tear: { id: 'frozen_tear', name: '凍れる涙', type: 'material', tier: 4, baseValue: 52, category: 'crystal_type', image: '/art/items/frozen_tear.png' },
  black_lotus: { id: 'black_lotus', name: '黒蓮華', type: 'material', tier: 4, baseValue: 62, category: 'herb_type', image: '/art/items/black_lotus.png' },

  // --- Tier 5: 天空・時の回廊 (10種) ---
  sky_fragment: { id: 'sky_fragment', name: '天空の欠片', type: 'material', tier: 5, baseValue: 80, image: '/art/items/sky_fragment.png' },
  time_sand: { id: 'time_sand', name: '時の砂', type: 'material', tier: 5, baseValue: 90, image: '/art/items/time_sand.png' },
  rainbow_scale: { id: 'rainbow_scale', name: '虹色の鱗', type: 'material', tier: 5, baseValue: 85, category: 'monster_type', image: '/art/items/rainbow_scale.png' },
  star_dust: { id: 'star_dust', name: '星屑', type: 'material', tier: 5, baseValue: 75, category: 'essence_type', image: '/art/items/star_dust.png' },
  world_tree_sap: { id: 'world_tree_sap', name: '世界樹の樹液', type: 'material', tier: 5, baseValue: 100, category: 'essence_type', image: '/art/items/world_tree_sap.png' },
  divine_ore: { id: 'divine_ore', name: '神鉄鉱', type: 'material', tier: 5, baseValue: 95, category: 'ore_type', image: '/art/items/divine_ore.png' },
  chaos_crystal: { id: 'chaos_crystal', name: '混沌の結晶', type: 'material', tier: 5, baseValue: 88, category: 'crystal_type', image: '/art/items/chaos_crystal.png' },
  phoenix_ash: { id: 'phoenix_ash', name: '不死鳥の灰', type: 'material', tier: 5, baseValue: 92, image: '/art/items/phoenix_ash.png' },
  aether_essence: { id: 'aether_essence', name: 'エーテルの精', type: 'material', tier: 5, baseValue: 110, category: 'essence_type', image: '/art/items/aether_essence.png' },
  primordial_gem: { id: 'primordial_gem', name: '始原の宝玉', type: 'material', tier: 5, baseValue: 120, category: 'gem_type', image: '/art/items/primordial_gem.png' },

  // =====================================================================
  //  ク ラ フ ト 品 (100種)
  // =====================================================================

  // ===== Rank 1: 初期レシピ (8種) =====
  sword: { id: 'sword', name: '鉄の剣', type: 'equipment', equipType: 'sword', baseValue: 35, image: '/art/items/sword.png' },
  shield: { id: 'shield', name: '木の盾', type: 'equipment', equipType: 'shield', baseValue: 25, image: '/art/items/shield.png' },
  potion: { id: 'potion', name: '回復薬', type: 'consumable', baseValue: 18, image: '/art/items/potion.png', battleEffect: { type: 'heal', target: 'ally', value: 40 } },
  wooden_bow: { id: 'wooden_bow', name: '木の弓', type: 'equipment', equipType: 'bow', baseValue: 30, image: '/art/items/wooden_bow.png' },
  herb_tea: { id: 'herb_tea', name: 'ハーブティー', type: 'consumable', baseValue: 12, image: '/art/items/herb_tea.png', battleEffect: { type: 'heal', target: 'ally', value: 20 } },
  stone_axe: { id: 'stone_axe', name: '石斧', type: 'equipment', equipType: 'sword', baseValue: 28, image: '/art/items/stone_axe.png' },
  clay_pot: { id: 'clay_pot', name: '粘土の壺', type: 'accessory', baseValue: 22, image: '/art/items/clay_pot.png' },
  antidote_basic: { id: 'antidote_basic', name: '毒消し薬', type: 'consumable', baseValue: 20, image: '/art/items/antidote.png', battleEffect: { type: 'buff', target: 'ally', stat: 'def', amount: 5, duration: 15 } },
  mud_ball: { id: 'mud_ball', name: '泥団子', type: 'consumable', baseValue: 8, image: '/art/items/mud_ball.png', battleEffect: { type: 'debuff', target: 'enemy', stat: 'spd', amount: -10, duration: 10 } },

  // ===== Rank 2: 洞窟解放 (10種) =====
  fire_sword: { id: 'fire_sword', name: '炎の剣', type: 'equipment', equipType: 'sword', baseValue: 80, image: '/art/items/fire_sword.png' },
  ice_shield: { id: 'ice_shield', name: '氷の盾', type: 'equipment', equipType: 'shield', baseValue: 65, image: '/art/items/ice_shield.png' },
  antidote: { id: 'antidote', name: '解毒薬', type: 'consumable', baseValue: 30, image: '/art/items/antidote.png', battleEffect: { type: 'buff', target: 'ally', stat: 'def', amount: 10, duration: 20 } },
  silver_dagger: { id: 'silver_dagger', name: '銀の短剣', type: 'equipment', equipType: 'dagger', baseValue: 55, image: '/art/items/silver_dagger.png' },
  leather_armor: { id: 'leather_armor', name: '革鎧', type: 'equipment', equipType: 'armor', baseValue: 60, image: '/art/items/leather_armor.png' },
  iron_spear: { id: 'iron_spear', name: '鉄の槍', type: 'equipment', equipType: 'spear', baseValue: 50, image: '/art/items/iron_spear.png' },
  amber_ring: { id: 'amber_ring', name: '琥珀の指輪', type: 'accessory', baseValue: 65, image: '/art/items/amber_ring.png' },
  bone_charm: { id: 'bone_charm', name: '骨のお守り', type: 'accessory', baseValue: 50, image: '/art/items/bone_charm.png' },
  stamina_drink: { id: 'stamina_drink', name: 'スタミナドリンク', type: 'consumable', baseValue: 25, image: '/art/items/stamina_drink.png', battleEffect: { type: 'buff', target: 'ally', stat: 'spd', amount: 30, duration: 15 } },
  iron_helm: { id: 'iron_helm', name: '鉄兜', type: 'equipment', equipType: 'armor', baseValue: 48, image: '/art/items/iron_helm.png' },
  iron_spike: { id: 'iron_spike', name: '鉄の棘', type: 'consumable', baseValue: 22, image: '/art/items/iron_spike.png', battleEffect: { type: 'damage', target: 'enemy', value: 35 } },

  // ===== Rank 3: 森解放 (12種) =====
  mage_staff: { id: 'mage_staff', name: '魔法の杖', type: 'equipment', equipType: 'staff', baseValue: 120, image: '/art/items/mage_staff.png' },
  chainmail: { id: 'chainmail', name: '鎖帷子', type: 'equipment', equipType: 'armor', baseValue: 100, image: '/art/items/chainmail.png' },
  elixir: { id: 'elixir', name: '万能薬', type: 'consumable', baseValue: 75, image: '/art/items/elixir.png', battleEffect: { type: 'heal', target: 'ally', value: 90 } },
  wind_bow: { id: 'wind_bow', name: '風の弓', type: 'equipment', equipType: 'bow', baseValue: 95, image: '/art/items/wind_bow.png' },
  spirit_robe: { id: 'spirit_robe', name: '精霊のローブ', type: 'equipment', equipType: 'robe', baseValue: 110, image: '/art/items/spirit_robe.png' },
  strength_potion: { id: 'strength_potion', name: '力の薬', type: 'consumable', baseValue: 55, image: '/art/items/strength_potion.png', battleEffect: { type: 'buff', target: 'ally', stat: 'atk', amount: 20, duration: 20 } },
  spider_cloak: { id: 'spider_cloak', name: '蜘蛛糸のマント', type: 'equipment', equipType: 'robe', baseValue: 85, image: '/art/items/spider_cloak.png' },
  crystal_orb: { id: 'crystal_orb', name: '水晶の宝珠', type: 'accessory', baseValue: 130, image: '/art/items/crystal_orb.png' },
  dark_blade: { id: 'dark_blade', name: '暗黒の刃', type: 'equipment', equipType: 'sword', baseValue: 105, image: '/art/items/dark_blade.png' },
  fairy_necklace: { id: 'fairy_necklace', name: '妖精のネックレス', type: 'accessory', baseValue: 100, image: '/art/items/fairy_necklace.png' },
  poison_dagger: { id: 'poison_dagger', name: '毒塗りの短剣', type: 'equipment', equipType: 'dagger', baseValue: 88, image: '/art/items/poison_dagger.png' },
  magic_ink: { id: 'magic_ink', name: '魔法のインク', type: 'consumable', baseValue: 40, image: '/art/items/magic_ink.png', battleEffect: { type: 'debuff', target: 'enemy', stat: 'spd', amount: -15, duration: 15 } },
  weakness_draught: { id: 'weakness_draught', name: '弱体化の薬', type: 'consumable', baseValue: 60, image: '/art/items/weakness_draught.png', battleEffect: { type: 'debuff', target: 'enemy', stat: 'atk', amount: -20, duration: 20 } },

  // ===== Rank 4: 火山解放 (12種) =====
  holy_sword: { id: 'holy_sword', name: '聖剣', type: 'equipment', equipType: 'sword', baseValue: 250, image: '/art/items/holy_sword.png' },
  dragon_armor: { id: 'dragon_armor', name: '竜鱗の鎧', type: 'equipment', equipType: 'armor', baseValue: 220, image: '/art/items/dragon_armor.png' },
  phoenix_feather_acc: { id: 'phoenix_feather_acc', name: '不死鳥のお守り', type: 'accessory', baseValue: 260, image: '/art/items/phoenix_feather_acc.png' },
  flame_lance: { id: 'flame_lance', name: '炎の槍', type: 'equipment', equipType: 'spear', baseValue: 200, image: '/art/items/flame_lance.png' },
  moonlight_staff: { id: 'moonlight_staff', name: '月光の杖', type: 'equipment', equipType: 'staff', baseValue: 190, image: '/art/items/moonlight_staff.png' },
  silver_mail: { id: 'silver_mail', name: '銀糸の鎧', type: 'equipment', equipType: 'armor', baseValue: 210, image: '/art/items/silver_mail.png' },
  spirit_potion: { id: 'spirit_potion', name: '霊薬', type: 'consumable', baseValue: 120, image: '/art/items/spirit_potion.png', battleEffect: { type: 'buff', target: 'ally', stat: 'def', amount: 15, duration: 20 } },
  thunder_hammer: { id: 'thunder_hammer', name: '雷鳴のハンマー', type: 'equipment', equipType: 'spear', baseValue: 230, image: '/art/items/thunder_hammer.png' },
  cursed_ring: { id: 'cursed_ring', name: '呪いの指輪', type: 'accessory', baseValue: 230, image: '/art/items/cursed_ring.png' },
  lava_shield: { id: 'lava_shield', name: '溶岩の盾', type: 'equipment', equipType: 'shield', baseValue: 195, image: '/art/items/lava_shield.png' },
  fire_cloak: { id: 'fire_cloak', name: '焔纏いのマント', type: 'equipment', equipType: 'robe', baseValue: 175, image: '/art/items/fire_cloak.png' },
  enchant_scroll: { id: 'enchant_scroll', name: '付呪の巻物', type: 'consumable', baseValue: 140, image: '/art/items/enchant_scroll.png', battleEffect: { type: 'debuff', target: 'enemy', stat: 'def', amount: -15, duration: 20 } },
  thunder_bomb: { id: 'thunder_bomb', name: '雷鳴の爆弾', type: 'consumable', baseValue: 100, image: '/art/items/thunder_bomb.png', battleEffect: { type: 'stun', target: 'enemy', duration: 8 } },

  // ===== Rank 5: 深海解放 (12種) =====
  trident: { id: 'trident', name: '海神の三叉槍', type: 'equipment', equipType: 'spear', baseValue: 320, image: '/art/items/trident.png' },
  coral_armor: { id: 'coral_armor', name: '珊瑚の鎧', type: 'equipment', equipType: 'armor', baseValue: 280, image: '/art/items/coral_armor.png' },
  pearl_tiara: { id: 'pearl_tiara', name: '真珠のティアラ', type: 'accessory', baseValue: 360, image: '/art/items/pearl_tiara.png' },
  tidal_bow: { id: 'tidal_bow', name: '潮流の弓', type: 'equipment', equipType: 'bow', baseValue: 300, image: '/art/items/tidal_bow.png' },
  deep_elixir: { id: 'deep_elixir', name: '深海の霊薬', type: 'consumable', baseValue: 200, image: '/art/items/deep_elixir.png', battleEffect: { type: 'heal', target: 'all', value: 60 } },
  mithril_sword: { id: 'mithril_sword', name: 'ミスリルの剣', type: 'equipment', equipType: 'sword', baseValue: 350, image: '/art/items/mithril_sword.png' },
  mithril_shield: { id: 'mithril_shield', name: 'ミスリルの盾', type: 'equipment', equipType: 'shield', baseValue: 310, image: '/art/items/mithril_shield.png' },
  void_amulet: { id: 'void_amulet', name: '虚空のアミュレット', type: 'accessory', baseValue: 390, image: '/art/items/void_amulet.png' },
  frost_blade: { id: 'frost_blade', name: '凍てつく刃', type: 'equipment', equipType: 'sword', baseValue: 290, image: '/art/items/frost_blade.png' },
  elder_staff: { id: 'elder_staff', name: '長老樹の杖', type: 'equipment', equipType: 'staff', baseValue: 260, image: '/art/items/elder_staff.png' },
  sea_serpent_whip: { id: 'sea_serpent_whip', name: '海竜の鞭', type: 'equipment', equipType: 'dagger', baseValue: 330, image: '/art/items/sea_serpent_whip.png' },
  lotus_perfume: { id: 'lotus_perfume', name: '黒蓮の香水', type: 'consumable', baseValue: 180, image: '/art/items/lotus_perfume.png', battleEffect: { type: 'buff', target: 'all', stat: 'spd', amount: 25, duration: 20 } },
  revival_herb: { id: 'revival_herb', name: '蘇生草', type: 'consumable', baseValue: 250, image: '/art/items/revival_herb.png', battleEffect: { type: 'revive', target: 'ally', value: 60 } },

  // ===== Rank 6: 竜の巣解放 (12種) =====
  dragon_slayer: { id: 'dragon_slayer', name: '竜殺しの大剣', type: 'equipment', equipType: 'sword', baseValue: 450, image: '/art/items/dragon_slayer.png' },
  storm_cloak: { id: 'storm_cloak', name: '嵐のマント', type: 'equipment', equipType: 'robe', baseValue: 380, image: '/art/items/storm_cloak.png' },
  ancient_crown: { id: 'ancient_crown', name: '古代王の冠', type: 'accessory', baseValue: 600, image: '/art/items/ancient_crown.png' },
  sage_stone: { id: 'sage_stone', name: '賢者の石', type: 'consumable', baseValue: 350, image: '/art/items/sage_stone.png', battleEffect: { type: 'heal', target: 'all', value: 100 } },
  mystic_amulet: { id: 'mystic_amulet', name: '神秘のアミュレット', type: 'accessory', baseValue: 580, image: '/art/items/mystic_amulet.png' },
  dragon_bow: { id: 'dragon_bow', name: '竜骨の弓', type: 'equipment', equipType: 'bow', baseValue: 430, image: '/art/items/dragon_bow.png' },
  phoenix_robe: { id: 'phoenix_robe', name: '不死鳥のローブ', type: 'equipment', equipType: 'robe', baseValue: 410, image: '/art/items/phoenix_robe.png' },
  void_blade: { id: 'void_blade', name: '虚無の剣', type: 'equipment', equipType: 'sword', baseValue: 460, image: '/art/items/void_blade.png' },
  dragon_potion: { id: 'dragon_potion', name: '竜の血薬', type: 'consumable', baseValue: 300, image: '/art/items/dragon_potion.png', battleEffect: { type: 'buff', target: 'all', stat: 'atk', amount: 30, duration: 20 } },
  thunder_spear: { id: 'thunder_spear', name: '雷光の槍', type: 'equipment', equipType: 'spear', baseValue: 440, image: '/art/items/thunder_spear.png' },
  cursed_crown: { id: 'cursed_crown', name: '呪王の冠', type: 'accessory', baseValue: 520, image: '/art/items/cursed_crown.png' },
  scale_shield: { id: 'scale_shield', name: '竜鱗の大盾', type: 'equipment', equipType: 'shield', baseValue: 390, image: '/art/items/scale_shield.png' },

  // ===== Rank 7: 天空解放 (12種) =====
  sky_sword: { id: 'sky_sword', name: '天空の剣', type: 'equipment', equipType: 'sword', baseValue: 600, image: '/art/items/sky_sword.png' },
  time_hourglass: { id: 'time_hourglass', name: '時の砂時計', type: 'accessory', baseValue: 780, image: '/art/items/time_hourglass.png' },
  star_shield: { id: 'star_shield', name: '星盾', type: 'equipment', equipType: 'shield', baseValue: 520, image: '/art/items/star_shield.png' },
  divine_armor: { id: 'divine_armor', name: '神鉄の鎧', type: 'equipment', equipType: 'armor', baseValue: 580, image: '/art/items/divine_armor.png' },
  aether_staff: { id: 'aether_staff', name: 'エーテルの杖', type: 'equipment', equipType: 'staff', baseValue: 560, image: '/art/items/aether_staff.png' },
  sky_bow: { id: 'sky_bow', name: '天翔ける弓', type: 'equipment', equipType: 'bow', baseValue: 540, image: '/art/items/sky_bow.png' },
  rainbow_robe: { id: 'rainbow_robe', name: '虹のローブ', type: 'equipment', equipType: 'robe', baseValue: 530, image: '/art/items/rainbow_robe.png' },
  divine_elixir: { id: 'divine_elixir', name: '神酒', type: 'consumable', baseValue: 400, image: '/art/items/divine_elixir.png', battleEffect: { type: 'revive', target: 'ally', value: 50 } },
  chaos_ring: { id: 'chaos_ring', name: '混沌の指輪', type: 'accessory', baseValue: 680, image: '/art/items/chaos_ring.png' },
  star_pendant: { id: 'star_pendant', name: '星のペンダント', type: 'accessory', baseValue: 720, image: '/art/items/star_pendant.png' },
  wind_lance: { id: 'wind_lance', name: '疾風の槍', type: 'equipment', equipType: 'spear', baseValue: 570, image: '/art/items/wind_lance.png' },
  phoenix_bow: { id: 'phoenix_bow', name: '不死鳥の弓', type: 'equipment', equipType: 'bow', baseValue: 590, image: '/art/items/phoenix_bow.png' },

  // ===== Rank 8: 最終レシピ (10種) =====
  legendary_blade: { id: 'legendary_blade', name: '伝説の刃', type: 'equipment', equipType: 'sword', baseValue: 800, image: '/art/items/legendary_blade.png' },
  world_tree_staff: { id: 'world_tree_staff', name: '世界樹の杖', type: 'equipment', equipType: 'staff', baseValue: 850, image: '/art/items/world_tree_staff.png' },
  genesis_armor: { id: 'genesis_armor', name: '始原の鎧', type: 'equipment', equipType: 'armor', baseValue: 900, image: '/art/items/genesis_armor.png' },
  time_blade: { id: 'time_blade', name: '時渡りの剣', type: 'equipment', equipType: 'sword', baseValue: 820, image: '/art/items/time_blade.png' },
  primordial_crown: { id: 'primordial_crown', name: '始原の冠', type: 'accessory', baseValue: 1100, image: '/art/items/primordial_crown.png' },
  eternity_ring: { id: 'eternity_ring', name: '永遠の指輪', type: 'accessory', baseValue: 1050, image: '/art/items/eternity_ring.png' },
  cosmos_bow: { id: 'cosmos_bow', name: '星界弓コスモス', type: 'equipment', equipType: 'bow', baseValue: 830, image: '/art/items/cosmos_bow.png' },
  panacea: { id: 'panacea', name: '万象の霊薬', type: 'consumable', baseValue: 600, image: '/art/items/panacea.png', battleEffect: { type: 'healfull', target: 'all' } },
  oblivion_shield: { id: 'oblivion_shield', name: '忘却の盾', type: 'equipment', equipType: 'shield', baseValue: 770, image: '/art/items/oblivion_shield.png' },
  astral_robe: { id: 'astral_robe', name: '星衣アストラル', type: 'equipment', equipType: 'robe', baseValue: 860, image: '/art/items/astral_robe.png' },

  // =====================================================================
  //  中 間 素 材 (素材調合で作成)
  // =====================================================================
  plywood: { id: 'plywood', name: '合板', type: 'material', tier: 1, baseValue: 10, category: 'wood_type', image: '/art/items/plywood.png' },
  herbal_extract: { id: 'herbal_extract', name: '薬草エキス', type: 'material', tier: 1, baseValue: 14, category: 'herb_type', image: '/art/items/herbal_extract.png' },
  steel_ingot: { id: 'steel_ingot', name: '鋼のインゴット', type: 'material', tier: 2, baseValue: 28, category: 'ore_type', image: '/art/items/steel_ingot.png' },
  pure_crystal: { id: 'pure_crystal', name: '精製結晶', type: 'material', tier: 2, baseValue: 30, category: 'crystal_type', image: '/art/items/pure_crystal.png' },
  alloy_ore: { id: 'alloy_ore', name: '合金鉱', type: 'material', tier: 2, baseValue: 32, category: 'ore_type', image: '/art/items/alloy_ore.png' },
  magic_cloth: { id: 'magic_cloth', name: '魔法織物', type: 'material', tier: 3, baseValue: 38, category: 'cloth_type', image: '/art/items/magic_cloth.png' },
  spirit_thread: { id: 'spirit_thread', name: '精霊糸', type: 'material', tier: 3, baseValue: 42, category: 'cloth_type', image: '/art/items/spirit_thread.png' },
  dragon_alloy: { id: 'dragon_alloy', name: '竜鉄', type: 'material', tier: 4, baseValue: 70, category: 'ore_type', image: '/art/items/dragon_alloy.png' },
};

// ===================================================================
//  レ シ ピ マ ス タ
//  素材スロットに '@category_id' を指定するとカテゴリ内の任意素材で調合可能
// ===================================================================
export const Recipes = {
  // --- Rank 1: 初期解放 ---
  shield: { id: 'r_shield', targetId: 'shield', materials: ['@wood_type', '@wood_type'], unlocked: true },
  potion: { id: 'r_potion', targetId: 'potion', materials: ['@herb_type', 'slime_jelly'], unlocked: true },
  wooden_bow: { id: 'r_wooden_bow', targetId: 'wooden_bow', materials: ['wood', 'feather_small'], unlocked: true },
  herb_tea: { id: 'r_herb_tea', targetId: 'herb_tea', materials: ['@herb_type', 'flower_petal'], unlocked: true },
  stone_axe: { id: 'r_stone_axe', targetId: 'stone_axe', materials: ['@stone_type', 'wood'], unlocked: true },
  clay_pot: { id: 'r_clay_pot', targetId: 'clay_pot', materials: ['clay', 'sand'], unlocked: true },
  antidote_basic: { id: 'r_antidote_basic', targetId: 'antidote_basic', materials: ['bug_shell', 'slime_jelly'], unlocked: true },
  mud_ball: { id: 'r_mud_ball', targetId: 'mud_ball', materials: ['clay', 'slime_jelly'], unlocked: true },
  // 素材レシピ (Rank 1)
  plywood: { id: 'r_plywood', targetId: 'plywood', materials: ['wood', 'wood'], unlocked: true, isMaterialRecipe: true },
  herbal_extract: { id: 'r_herbal_extract', targetId: 'herbal_extract', materials: ['herb', 'herb'], unlocked: true, isMaterialRecipe: true },

  // --- Rank 2 解放 ---
  sword: { id: 'r_sword', targetId: 'sword', materials: ['@ore_type', '@wood_type'], unlocked: false },
  antidote: { id: 'r_antidote', targetId: 'antidote', materials: ['herb', 'poison_herb'], unlocked: false },
  silver_dagger: { id: 'r_silver_dagger', targetId: 'silver_dagger', materials: ['silver_ore', 'bone'], unlocked: false },
  leather_armor: { id: 'r_leather_armor', targetId: 'leather_armor', materials: ['@cloth_type', '@ore_type'], unlocked: false },
  iron_spear: { id: 'r_iron_spear', targetId: 'iron_spear', materials: ['iron_ore', '@wood_type'], unlocked: false },
  amber_ring: { id: 'r_amber_ring', targetId: 'amber_ring', materials: ['amber', 'silver_ore'], unlocked: false },
  bone_charm: { id: 'r_bone_charm', targetId: 'bone_charm', materials: ['bone', '@herb_type'], unlocked: false },
  stamina_drink: { id: 'r_stamina_drink', targetId: 'stamina_drink', materials: ['mushroom', 'slime_jelly'], unlocked: false },
  iron_helm: { id: 'r_iron_helm', targetId: 'iron_helm', materials: ['iron_ore', '@cloth_type'], unlocked: false },
  iron_spike: { id: 'r_iron_spike', targetId: 'iron_spike', materials: ['iron_ore', 'bone'], unlocked: false },
  // 素材レシピ (Rank 2)
  steel_ingot: { id: 'r_steel_ingot', targetId: 'steel_ingot', materials: ['iron_ore', 'iron_ore'], unlocked: false, isMaterialRecipe: true },
  alloy_ore: { id: 'r_alloy_ore', targetId: 'alloy_ore', materials: ['iron_ore', 'silver_ore'], unlocked: false, isMaterialRecipe: true },
  pure_crystal: { id: 'r_pure_crystal', targetId: 'pure_crystal', materials: ['crystal', 'crystal'], unlocked: false, isMaterialRecipe: true },

  // --- Rank 3 解放 ---
  mage_staff: { id: 'r_mage_staff', targetId: 'mage_staff', materials: ['@crystal_type', 'enchanted_wood'], unlocked: false },
  chainmail: { id: 'r_chainmail', targetId: 'chainmail', materials: ['@ore_type', '@ore_type', '@cloth_type'], unlocked: false },
  elixir: { id: 'r_elixir', targetId: 'elixir', materials: ['@herb_type', '@crystal_type', 'slime_jelly'], unlocked: false },
  wind_bow: { id: 'r_wind_bow', targetId: 'wind_bow', materials: ['enchanted_wood', 'spider_silk'], unlocked: false },
  spirit_robe: { id: 'r_spirit_robe', targetId: 'spirit_robe', materials: ['@cloth_type', 'spirit_essence'], unlocked: false },
  strength_potion: { id: 'r_strength_potion', targetId: 'strength_potion', materials: ['mushroom', 'fairy_dust'], unlocked: false },
  spider_cloak: { id: 'r_spider_cloak', targetId: 'spider_cloak', materials: ['spider_silk', '@cloth_type'], unlocked: false },
  crystal_orb: { id: 'r_crystal_orb', targetId: 'crystal_orb', materials: ['crystal', 'fairy_dust'], unlocked: false },
  dark_blade: { id: 'r_dark_blade', targetId: 'dark_blade', materials: ['dark_stone', '@ore_type'], unlocked: false },
  fairy_necklace: { id: 'r_fairy_necklace', targetId: 'fairy_necklace', materials: ['fairy_dust', 'silver_ore'], unlocked: false },
  poison_dagger: { id: 'r_poison_dagger', targetId: 'poison_dagger', materials: ['silver_ore', 'poison_herb'], unlocked: false },
  magic_ink: { id: 'r_magic_ink', targetId: 'magic_ink', materials: ['crystal', 'flower_petal'], unlocked: false },
  weakness_draught: { id: 'r_weakness_draught', targetId: 'weakness_draught', materials: ['poison_herb', 'mushroom', 'slime_jelly'], unlocked: false },
  // 素材レシピ (Rank 3)
  magic_cloth: { id: 'r_magic_cloth', targetId: 'magic_cloth', materials: ['cloth', 'fairy_dust'], unlocked: false, isMaterialRecipe: true },
  spirit_thread: { id: 'r_spirit_thread', targetId: 'spirit_thread', materials: ['spider_silk', 'spirit_essence'], unlocked: false, isMaterialRecipe: true },

  // --- Rank 4 解放 (fire_sword, ice_shield をここに移動) ---
  fire_sword: { id: 'r_fire_sword', targetId: 'fire_sword', materials: ['@ore_type', 'fire_stone'], unlocked: false },
  ice_shield: { id: 'r_ice_shield', targetId: 'ice_shield', materials: ['@wood_type', 'ice_shard'], unlocked: false },
  holy_sword: { id: 'r_holy_sword', targetId: 'holy_sword', materials: ['@ore_type', '@crystal_type', 'feather'], unlocked: false },
  dragon_armor: { id: 'r_dragon_armor', targetId: 'dragon_armor', materials: ['dragon_scale', '@ore_type', '@cloth_type'], unlocked: false },
  phoenix_feather_acc: { id: 'r_phoenix_feather_acc', targetId: 'phoenix_feather_acc', materials: ['feather', '@crystal_type'], unlocked: false },
  flame_lance: { id: 'r_flame_lance', targetId: 'flame_lance', materials: ['fire_stone', '@ore_type', '@wood_type'], unlocked: false },
  moonlight_staff: { id: 'r_moonlight_staff', targetId: 'moonlight_staff', materials: ['enchanted_wood', '@crystal_type', '@essence_type'], unlocked: false },
  silver_mail: { id: 'r_silver_mail', targetId: 'silver_mail', materials: ['silver_ore', 'silver_ore', '@cloth_type'], unlocked: false },
  spirit_potion: { id: 'r_spirit_potion', targetId: 'spirit_potion', materials: ['spirit_essence', '@herb_type', '@essence_type'], unlocked: false },
  thunder_hammer: { id: 'r_thunder_hammer', targetId: 'thunder_hammer', materials: ['thunder_stone', '@ore_type', 'lava_core'], unlocked: false },
  cursed_ring: { id: 'r_cursed_ring', targetId: 'cursed_ring', materials: ['cursed_gem', 'silver_ore'], unlocked: false },
  lava_shield: { id: 'r_lava_shield', targetId: 'lava_shield', materials: ['lava_core', '@ore_type', '@stone_type'], unlocked: false },
  fire_cloak: { id: 'r_fire_cloak', targetId: 'fire_cloak', materials: ['fire_stone', '@cloth_type', '@cloth_type'], unlocked: false },
  enchant_scroll: { id: 'r_enchant_scroll', targetId: 'enchant_scroll', materials: ['@crystal_type', '@essence_type', 'spirit_essence'], unlocked: false },
  thunder_bomb: { id: 'r_thunder_bomb', targetId: 'thunder_bomb', materials: ['thunder_stone', 'lava_core'], unlocked: false },

  // --- Rank 5 解放 ---
  trident: { id: 'r_trident', targetId: 'trident', materials: ['mithril_ore', 'deep_pearl', 'coral_fragment'], unlocked: false },
  coral_armor: { id: 'r_coral_armor', targetId: 'coral_armor', materials: ['coral_fragment', '@ore_type', '@cloth_type'], unlocked: false },
  pearl_tiara: { id: 'r_pearl_tiara', targetId: 'pearl_tiara', materials: ['deep_pearl', '@gem_type'], unlocked: false },
  tidal_bow: { id: 'r_tidal_bow', targetId: 'tidal_bow', materials: ['@wood_type', 'sea_serpent_fin'], unlocked: false },
  deep_elixir: { id: 'r_deep_elixir', targetId: 'deep_elixir', materials: ['deep_pearl', 'black_lotus', '@herb_type'], unlocked: false },
  mithril_sword: { id: 'r_mithril_sword', targetId: 'mithril_sword', materials: ['mithril_ore', 'mithril_ore', '@gem_type'], unlocked: false },
  mithril_shield: { id: 'r_mithril_shield', targetId: 'mithril_shield', materials: ['mithril_ore', 'coral_fragment'], unlocked: false },
  void_amulet: { id: 'r_void_amulet', targetId: 'void_amulet', materials: ['void_shard', '@gem_type'], unlocked: false },
  frost_blade: { id: 'r_frost_blade', targetId: 'frost_blade', materials: ['frozen_tear', 'mithril_ore'], unlocked: false },
  elder_staff: { id: 'r_elder_staff', targetId: 'elder_staff', materials: ['elder_bark', '@crystal_type', '@essence_type'], unlocked: false },
  sea_serpent_whip: { id: 'r_sea_serpent_whip', targetId: 'sea_serpent_whip', materials: ['sea_serpent_fin', '@cloth_type'], unlocked: false },
  lotus_perfume: { id: 'r_lotus_perfume', targetId: 'lotus_perfume', materials: ['black_lotus', 'flower_petal', '@essence_type'], unlocked: false },
  revival_herb: { id: 'r_revival_herb', targetId: 'revival_herb', materials: ['black_lotus', 'spirit_essence', '@herb_type'], unlocked: false },
  // 素材レシピ (Rank 5)
  dragon_alloy: { id: 'r_dragon_alloy', targetId: 'dragon_alloy', materials: ['mithril_ore', 'dragon_scale'], unlocked: false, isMaterialRecipe: true },

  // --- Rank 6 解放 ---
  dragon_slayer: { id: 'r_dragon_slayer', targetId: 'dragon_slayer', materials: ['dragon_scale', 'mithril_ore', 'fire_stone'], unlocked: false },
  storm_cloak: { id: 'r_storm_cloak', targetId: 'storm_cloak', materials: ['wind_crystal', '@cloth_type', 'thunder_stone'], unlocked: false },
  ancient_crown: { id: 'r_ancient_crown', targetId: 'ancient_crown', materials: ['@gem_type', 'deep_pearl', 'dragon_scale'], unlocked: false },
  sage_stone: { id: 'r_sage_stone', targetId: 'sage_stone', materials: ['@crystal_type', '@gem_type', 'spirit_essence'], unlocked: false },
  mystic_amulet: { id: 'r_mystic_amulet', targetId: 'mystic_amulet', materials: ['void_shard', 'deep_pearl', '@essence_type'], unlocked: false },
  dragon_bow: { id: 'r_dragon_bow', targetId: 'dragon_bow', materials: ['dragon_scale', '@wood_type', '@cloth_type'], unlocked: false },
  phoenix_robe: { id: 'r_phoenix_robe', targetId: 'phoenix_robe', materials: ['feather', '@cloth_type', 'spirit_essence'], unlocked: false },
  void_blade: { id: 'r_void_blade', targetId: 'void_blade', materials: ['void_shard', 'mithril_ore', '@stone_type'], unlocked: false },
  dragon_potion: { id: 'r_dragon_potion', targetId: 'dragon_potion', materials: ['dragon_scale', 'black_lotus', 'fire_stone'], unlocked: false },
  thunder_spear: { id: 'r_thunder_spear', targetId: 'thunder_spear', materials: ['thunder_stone', 'mithril_ore', 'wind_crystal'], unlocked: false },
  cursed_crown: { id: 'r_cursed_crown', targetId: 'cursed_crown', materials: ['cursed_gem', '@gem_type', '@stone_type'], unlocked: false },
  scale_shield: { id: 'r_scale_shield', targetId: 'scale_shield', materials: ['dragon_scale', 'dragon_scale', '@ore_type'], unlocked: false },

  // --- Rank 7 解放 (time_sand/world_tree_sap は天空で入手できないため素材変更) ---
  sky_sword: { id: 'r_sky_sword', targetId: 'sky_sword', materials: ['sky_fragment', 'divine_ore', 'star_dust'], unlocked: false },
  time_hourglass: { id: 'r_time_hourglass', targetId: 'time_hourglass', materials: ['star_dust', '@crystal_type', '@gem_type'], unlocked: false },
  star_shield: { id: 'r_star_shield', targetId: 'star_shield', materials: ['star_dust', 'mithril_ore', 'divine_ore'], unlocked: false },
  divine_armor: { id: 'r_divine_armor', targetId: 'divine_armor', materials: ['divine_ore', 'divine_ore', 'dragon_scale'], unlocked: false },
  aether_staff: { id: 'r_aether_staff', targetId: 'aether_staff', materials: ['aether_essence', '@wood_type', 'sky_fragment'], unlocked: false },
  sky_bow: { id: 'r_sky_bow', targetId: 'sky_bow', materials: ['sky_fragment', 'wind_crystal', 'feather'], unlocked: false },
  rainbow_robe: { id: 'r_rainbow_robe', targetId: 'rainbow_robe', materials: ['rainbow_scale', '@cloth_type', '@essence_type'], unlocked: false },
  divine_elixir: { id: 'r_divine_elixir', targetId: 'divine_elixir', materials: ['aether_essence', 'phoenix_ash', 'deep_pearl'], unlocked: false },
  chaos_ring: { id: 'r_chaos_ring', targetId: 'chaos_ring', materials: ['chaos_crystal', 'cursed_gem', '@gem_type'], unlocked: false },
  star_pendant: { id: 'r_star_pendant', targetId: 'star_pendant', materials: ['star_dust', 'deep_pearl', 'sky_fragment'], unlocked: false },
  wind_lance: { id: 'r_wind_lance', targetId: 'wind_lance', materials: ['wind_crystal', 'divine_ore', 'sky_fragment'], unlocked: false },
  phoenix_bow: { id: 'r_phoenix_bow', targetId: 'phoenix_bow', materials: ['phoenix_ash', '@wood_type', 'feather'], unlocked: false },

  // --- Rank 8 解放: 最終レシピ ---
  legendary_blade: { id: 'r_legendary_blade', targetId: 'legendary_blade', materials: ['divine_ore', 'dragon_scale', 'sky_fragment', 'primordial_gem'], unlocked: false },
  world_tree_staff: { id: 'r_world_tree_staff', targetId: 'world_tree_staff', materials: ['world_tree_sap', 'aether_essence', 'star_dust'], unlocked: false },
  genesis_armor: { id: 'r_genesis_armor', targetId: 'genesis_armor', materials: ['primordial_gem', 'divine_ore', 'dragon_scale', 'mithril_ore'], unlocked: false },
  time_blade: { id: 'r_time_blade', targetId: 'time_blade', materials: ['time_sand', 'divine_ore', 'chaos_crystal'], unlocked: false },
  primordial_crown: { id: 'r_primordial_crown', targetId: 'primordial_crown', materials: ['primordial_gem', '@gem_type', 'star_dust'], unlocked: false },
  eternity_ring: { id: 'r_eternity_ring', targetId: 'eternity_ring', materials: ['time_sand', 'primordial_gem', 'aether_essence'], unlocked: false },
  cosmos_bow: { id: 'r_cosmos_bow', targetId: 'cosmos_bow', materials: ['rainbow_scale', 'sky_fragment', 'phoenix_ash'], unlocked: false },
  panacea: { id: 'r_panacea', targetId: 'panacea', materials: ['world_tree_sap', 'phoenix_ash', 'primordial_gem'], unlocked: false },
  oblivion_shield: { id: 'r_oblivion_shield', targetId: 'oblivion_shield', materials: ['chaos_crystal', 'divine_ore', 'void_shard'], unlocked: false },
  astral_robe: { id: 'r_astral_robe', targetId: 'astral_robe', materials: ['aether_essence', 'rainbow_scale', 'star_dust'], unlocked: false },
};
// 特性マスタ — 名前と効果の説明
// Epic は融合でのみ入手可能（エリアドロップなし）
export const TraitDefs = {
  // ═══════════════════════════════════════════════
  //  Common (コモン) — 全系統の起点
  // ═══════════════════════════════════════════════
  '闘志': { name: '闘志', rarity: 'common', color: 'gray', description: 'バトル攻撃力が少しUP', effects: { battleAtk: 3, runDamageFlat: 3 } },
  '堅固': { name: '堅固', rarity: 'common', color: 'gray', description: 'バトル防御力が少しUP', effects: { battleDef: 2, runDamageReduction: 1 } },
  '活力': { name: '活力', rarity: 'common', color: 'gray', description: 'バトル最大HPが少しUP', effects: { battleHp: 10, runMaxHpFlat: 10 } },
  '光る': { name: '光る', rarity: 'common', color: 'gray', description: '売値+10%', effects: { sellBonus: 10 } },
  '丈夫': { name: '丈夫', rarity: 'common', color: 'gray', description: '探索成功率+3%', effects: { exploreSuccess: 3, runDodge: 0.015 } },
  '軽い': { name: '軽い', rarity: 'common', color: 'gray', description: '探索速度+8%', effects: { speedBonus: 8, runMoveSpeed: 0.04 } },
  '水溶性': { name: '水溶性', rarity: 'common', color: 'gray', description: '調合品質+2', effects: { craftQualityBonus: 2, runExpBonus: 0.04 } },
  '幸運': { name: '幸運', rarity: 'common', color: 'gray', description: '特性付与率+8%', effects: { traitChanceBonus: 8, runDropRate: 0.016 } },
  '薬草の香り': { name: '薬草の香り', rarity: 'common', color: 'gray', description: 'アイテム回復量が少しUP', effects: { battleHealBonus: 10, runRegenPerSec: 0.2 } },
  '滋養': { name: '滋養', rarity: 'common', color: 'gray', description: 'アイテム使用時に味方を微回復', effects: { battleHealFlat: 8 } },
  '硬い': { name: '硬い', rarity: 'common', color: 'gray', description: '成功率+2%, 調合+1', effects: { exploreSuccess: 2, craftQualityBonus: 1, runDodge: 0.01, runExpBonus: 0.02 } },
  '丹念': { name: '丹念', rarity: 'common', color: 'gray', description: 'バトル使用回数+1', effects: { battleItemUses: 1 } },

  // ═══════════════════════════════════════════════
  //  Uncommon (アンコモン) — 各系統の中位
  // ═══════════════════════════════════════════════
  '攻撃力+': { name: '攻撃力+', rarity: 'uncommon', color: 'green', description: 'バトル攻撃力UP', effects: { battleAtk: 8, runDamageFlat: 8 } },
  '防御力+': { name: '防御力+', rarity: 'uncommon', color: 'green', description: 'バトル防御力UP', effects: { battleDef: 5, runDamageReduction: 2.5 } },
  'HP回復+': { name: 'HP回復+', rarity: 'uncommon', color: 'green', description: 'バトル最大HP UP', effects: { battleHp: 20, runMaxHpFlat: 20 } },
  '売値UP': { name: '売値UP', rarity: 'uncommon', color: 'green', description: '売値+20%', effects: { sellBonus: 20 } },
  '猛毒': { name: '猛毒', rarity: 'uncommon', color: 'green', description: '探索成功率+6%', effects: { exploreSuccess: 6, runDodge: 0.03 } },
  '燃えやすい': { name: '燃えやすい', rarity: 'uncommon', color: 'green', description: '速度+12%, 成功率-3%', effects: { speedBonus: 12, exploreSuccess: -3, runMoveSpeed: 0.06, runDodge: -0.015 } },
  '練磨': { name: '練磨', rarity: 'uncommon', color: 'green', description: '調合品質+3', effects: { craftQualityBonus: 3, runExpBonus: 0.06 } },
  '強運': { name: '強運', rarity: 'uncommon', color: 'green', description: '特性付与率+15%', effects: { traitChanceBonus: 15, runDropRate: 0.03 } },
  '癒しの力': { name: '癒しの力', rarity: 'uncommon', color: 'green', description: 'アイテム回復量UP', effects: { battleHealBonus: 20, runRegenPerSec: 0.4 } },
  '命の露': { name: '命の露', rarity: 'uncommon', color: 'green', description: 'アイテム使用時に味方全体を微回復', effects: { battleHealFlat: 12 } },
  // スタンドアロン (融合チェーンなし)
  '採取量UP': { name: '採取量UP', rarity: 'uncommon', color: 'green', description: 'ドロップ+1', effects: { dropBonus: 1, runDropRate: 0.05 } },
  '先制': { name: '先制', rarity: 'uncommon', color: 'green', description: 'バトル開始時ATB+25', effects: { startAtb: 25, runStartInvincible: 2.5 } },
  '体力強化': { name: '体力強化', rarity: 'uncommon', color: 'green', description: 'バトル最大HP UP, 防御力UP', effects: { battleHp: 30, battleDef: 3, runMaxHpFlat: 30, runDamageReduction: 1.5 } },
  '練成': { name: '練成', rarity: 'uncommon', color: 'green', description: 'バトル使用回数+2', effects: { battleItemUses: 2 } },

  // ═══════════════════════════════════════════════
  //  Rare (レア) — 各系統の上位
  // ═══════════════════════════════════════════════
  '攻撃力++': { name: '攻撃力++', rarity: 'rare', color: 'blue', description: 'バトル攻撃力大UP', effects: { battleAtk: 16, runDamageFlat: 16 } },
  '防御力++': { name: '防御力++', rarity: 'rare', color: 'blue', description: 'バトル防御力大UP', effects: { battleDef: 10, runDamageReduction: 5 } },
  'HP回復++': { name: 'HP回復++', rarity: 'rare', color: 'blue', description: 'バトル最大HP大UP', effects: { battleHp: 40, runMaxHpFlat: 40 } },
  '売値UP+': { name: '売値UP+', rarity: 'rare', color: 'blue', description: '売値+40%', effects: { sellBonus: 40 } },
  '聖なる力': { name: '聖なる力', rarity: 'rare', color: 'blue', description: '成功率+8%, 調合+3', effects: { exploreSuccess: 8, craftQualityBonus: 3, runDodge: 0.04, runExpBonus: 0.06 } },
  '風の加護': { name: '風の加護', rarity: 'rare', color: 'blue', description: '速度+15%, 成功率+5%', effects: { speedBonus: 15, exploreSuccess: 5, runMoveSpeed: 0.075, runDodge: 0.025 } },
  '熟練': { name: '熟練', rarity: 'rare', color: 'blue', description: '調合品質+5', effects: { craftQualityBonus: 5, runExpBonus: 0.1 } },
  '天運': { name: '天運', rarity: 'rare', color: 'blue', description: '特性付与率+25%', effects: { traitChanceBonus: 25, runDropRate: 0.05 } },
  '慈愛': { name: '慈愛', rarity: 'rare', color: 'blue', description: 'アイテム回復量大UP', effects: { battleHealBonus: 40, runRegenPerSec: 0.8 } },
  '生命の雫': { name: '生命の雫', rarity: 'rare', color: 'blue', description: 'アイテム使用時に味方全体を小回復', effects: { battleHealFlat: 15 } },
  // スタンドアロン
  '雷撃': { name: '雷撃', rarity: 'rare', color: 'blue', description: 'バトル素早さ+20', effects: { battleSpd: 20, runAttackSpeed: 0.2 } },
  '吸血': { name: '吸血', rarity: 'rare', color: 'blue', description: '成功率+5%, 売値+15%', effects: { exploreSuccess: 5, sellBonus: 15, runDodge: 0.025 } },
  '鉄壁': { name: '鉄壁', rarity: 'rare', color: 'blue', description: 'バトルダメージ軽減+4', effects: { battleDmgReduction: 4, runDamageReduction: 4 } },
  '疾走': { name: '疾走', rarity: 'rare', color: 'blue', description: 'バトル素早さ+18, ATB+15', effects: { battleSpd: 18, startAtb: 15, runAttackSpeed: 0.18, runStartInvincible: 1.5 } },
  '達人の業': { name: '達人の業', rarity: 'rare', color: 'blue', description: 'バトル使用回数+3', effects: { battleItemUses: 3 } },

  // ═══════════════════════════════════════════════
  //  Epic (エピック) — 融合でのみ入手可能
  // ═══════════════════════════════════════════════
  '攻撃力+++': { name: '攻撃力+++', rarity: 'epic', color: 'purple', description: 'バトル攻撃力超UP', effects: { battleAtk: 28, runDamageFlat: 28 } },
  '防御力+++': { name: '防御力+++', rarity: 'epic', color: 'purple', description: 'バトル防御力超UP', effects: { battleDef: 18, runDamageReduction: 9 } },
  '生命の泉': { name: '生命の泉', rarity: 'epic', color: 'purple', description: 'バトル最大HP超UP + 自動回復', effects: { battleHp: 60, battleRegen: 1, runMaxHpFlat: 60, runRegenPerSec: 1 } },
  '黄金の輝き': { name: '黄金の輝き', rarity: 'epic', color: 'purple', description: '売値+60%', effects: { sellBonus: 60 } },
  '冒険の極意': { name: '冒険の極意', rarity: 'epic', color: 'purple', description: '成功率+15%, 速度+10%', effects: { exploreSuccess: 15, speedBonus: 10, runDodge: 0.075, runMoveSpeed: 0.05 } },
  '疾風': { name: '疾風', rarity: 'epic', color: 'purple', description: '速度+20%, 成功率+8%', effects: { speedBonus: 20, exploreSuccess: 8, runMoveSpeed: 0.1, runDodge: 0.04 } },
  '名匠の技': { name: '名匠の技', rarity: 'epic', color: 'purple', description: '調合品質+8', effects: { craftQualityBonus: 8, runExpBonus: 0.16 } },
  '運命の導き': { name: '運命の導き', rarity: 'epic', color: 'purple', description: '特性付与率+40%', effects: { traitChanceBonus: 40, runDropRate: 0.08 } },
  '聖癒': { name: '聖癒', rarity: 'epic', color: 'purple', description: '回復量超UP + 使用時全体回復', effects: { battleHealBonus: 60, battleHealFlat: 25, runRegenPerSec: 1.2 } },
  '生命の奔流': { name: '生命の奔流', rarity: 'epic', color: 'purple', description: 'アイテム使用時に味方全体を大回復', effects: { battleHealFlat: 35 } },
  '無尽蔵': { name: '無尽蔵', rarity: 'epic', color: 'purple', description: 'バトル使用回数+5', effects: { battleItemUses: 5 } },
  // スタンドアロン Epic
  '混沌': { name: '混沌', rarity: 'epic', color: 'purple', description: '成功率+15%, 売値-10%', effects: { exploreSuccess: 15, sellBonus: -10, runDodge: 0.075 } },
  '再生': { name: '再生', rarity: 'epic', color: 'purple', description: 'バトル中HP2/秒回復', effects: { battleRegen: 2, runRegenPerSec: 2 } },

  // ═══════════════════════════════════════════════
  //  Legendary (レジェンダリー) — 特殊入手
  // ═══════════════════════════════════════════════
  '時の祝福': { name: '時の祝福', rarity: 'legendary', color: 'gold', description: '速度+25%, 成功率+25%', effects: { speedBonus: 25, exploreSuccess: 25, runMoveSpeed: 0.125, runDodge: 0.125 } },
  '星の輝き': { name: '星の輝き', rarity: 'legendary', color: 'gold', description: '売値+100%, 調合+15', effects: { sellBonus: 100, craftQualityBonus: 15, runExpBonus: 0.3 } },
  '武神': { name: '武神', rarity: 'legendary', color: 'gold', description: '攻撃力・素早さ・先制 大UP', effects: { battleAtk: 15, battleSpd: 15, startAtb: 20, runDamageFlat: 15, runAttackSpeed: 0.15, runStartInvincible: 2 } },
  '不死鳥': { name: '不死鳥', rarity: 'legendary', color: 'gold', description: 'HP自動回復・防御力・HP 大UP', effects: { battleRegen: 4, battleDef: 12, battleHp: 30, runRegenPerSec: 4, runDamageReduction: 6, runMaxHpFlat: 30 } },
};

/**
 * トレイト融合テーブル — 同じトレイトの素材2つで1ランク上に昇格
 * 全10系統: Common → Uncommon → Rare → Epic
 */
export const TraitFusionTable = {
  // ── 攻撃力系 ──
  '闘志': '攻撃力+',
  '攻撃力+': '攻撃力++',
  '攻撃力++': '攻撃力+++',
  // ── 防御力系 ──
  '堅固': '防御力+',
  '防御力+': '防御力++',
  '防御力++': '防御力+++',
  // ── HP系 ──
  '活力': 'HP回復+',
  'HP回復+': 'HP回復++',
  'HP回復++': '生命の泉',
  // ── 売値系 ──
  '光る': '売値UP',
  '売値UP': '売値UP+',
  '売値UP+': '黄金の輝き',
  // ── 探索系 ──
  '丈夫': '猛毒',
  '猛毒': '聖なる力',
  '聖なる力': '冒険の極意',
  // ── 速度系 ──
  '軽い': '燃えやすい',
  '燃えやすい': '風の加護',
  '風の加護': '疾風',
  // ── 調合品質系 ──
  '水溶性': '練磨',
  '練磨': '熟練',
  '熟練': '名匠の技',
  // ── 幸運系 ──
  '幸運': '強運',
  '強運': '天運',
  '天運': '運命の導き',
  // ── 回復量系 ──
  '薬草の香り': '癒しの力',
  '癒しの力': '慈愛',
  '慈愛': '聖癒',
  // ── 使用回数系 ──
  '丹念': '練成',
  '練成': '達人の業',
  '達人の業': '無尽蔵',
  // ── 固定回復系 ──
  '滋養': '命の露',
  '命の露': '生命の雫',
  '生命の雫': '生命の奔流',
};
