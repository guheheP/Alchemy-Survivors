/**
 * UIHelpers — UI全体で共有される DOM 生成ユーティリティ
 * 大型カードデザイン・画像対応版
 */
import { ItemBlueprints, TraitDefs } from '../data/items.js';
import { AdventurerDefs, UnlockableAdventurers } from '../data/adventurers.js';
import { assetPath } from '../core/assetPath.js';
import { eventBus } from '../core/EventBus.js';
import { fmt1, fmtPct1 } from './NumberFormat.js';

// ===== 品質ティア定義（Q0-100は通常、Q101+はエンドゲーム解放時のみ） =====
const QualityTiers = [
  { name: '粗悪',  min: 0,   max: 20,  css: 'q-poor',      icon: '▪', color: '#888' },
  { name: '普通',  min: 21,  max: 40,  css: 'q-common',    icon: '▫', color: '#c8bea7' },
  { name: '良品',  min: 41,  max: 60,  css: 'q-fine',      icon: '◆', color: '#7daa68' },
  { name: '優品',  min: 61,  max: 80,  css: 'q-excellent', icon: '★', color: '#7ab0c4' },
  { name: '極上',  min: 81,  max: 100, css: 'q-legendary', icon: '✦', color: '#e8b84b' },
  // エンドゲームティア（Q100解放後）
  { name: '伝説',  min: 101, max: 200, css: 'q-mythic',    icon: '✧', color: '#c779ff' },
  { name: '神話',  min: 201, max: 500, css: 'q-mythic',    icon: '❋', color: '#ffe066' },
  { name: '超越',  min: 501, max: 9999, css: 'q-mythic',   icon: '✺', color: '#ffffff' },
];

// 現在の品質上限をキャッシュ (upgrade:purchased で更新)
let _cachedMaxQuality = 100;
export function getUIMaxQuality() { return _cachedMaxQuality; }
function _refreshMaxQuality() {
  const q = { effectType: 'quality_cap', result: 0 };
  eventBus.emit('upgrade:queryBonus', q);
  _cachedMaxQuality = 100 + (q.result || 0);
}
// 初期化時 + アップグレード購入時 + セーブロード後に更新
eventBus.on('upgrade:purchased', _refreshMaxQuality);
eventBus.on('save:loaded', _refreshMaxQuality);
// ShopSystem構築後に一度呼ぶ必要があるため、念のため遅延初期化
setTimeout(_refreshMaxQuality, 0);

// ===== タイプアイコン・カラー =====
const TypeInfo = {
  material:   { icon: '🪨', label: '素材',       css: 'type-material',   emoji: '🪨' },
  equipment:  { icon: '⚔️', label: '装備',       css: 'type-equipment',  emoji: '⚔️' },
  consumable: { icon: '🧪', label: '消耗品',     css: 'type-consumable', emoji: '🧪' },
  accessory:  { icon: '💎', label: 'アクセサリ', css: 'type-accessory',  emoji: '💎' },
};

export function getQualityTier(quality) {
  return QualityTiers.find(t => quality >= t.min && quality <= t.max) || QualityTiers[0];
}

export function getTypeInfo(type) {
  return TypeInfo[type] || TypeInfo.material;
}

// 特性バッジの色CSSクラス（レアリティベース）
function traitColorClass(traitName) {
  const def = TraitDefs[traitName];
  return def ? `trait-rarity-${def.rarity || 'common'}` : '';
}

/**
 * 特性の効果カテゴリを判定
 *  - equip: 装備中に発動する `run*` 効果を持つ
 *  - craft: 素材として調合に使った時に発動する効果 (craftQualityBonus) を持つ
 *  - consume: 消耗品として使用した時に発動する効果 (consumable*) を持つ
 */
export function getTraitCategory(traitName) {
  const def = TraitDefs[traitName];
  if (!def?.effects) return { equip: false, craft: false, consume: false };
  let equip = false, craft = false, consume = false;
  for (const key of Object.keys(def.effects)) {
    if (key.startsWith('run')) equip = true;
    else if (key === 'craftQualityBonus') craft = true;
    else if (key.startsWith('consumable')) consume = true;
  }
  return { equip, craft, consume };
}

/** 消耗品効果の説明テキストを組み立てる (tooltip 用) */
function describeConsumableEffects(def) {
  if (!def?.effects) return '';
  const e = def.effects;
  const parts = [];
  if (e.consumableHealMult)     parts.push(`回復+${Math.round(e.consumableHealMult * 100)}%`);
  if (e.consumableDamageMult)   parts.push(`ダメージ+${Math.round(e.consumableDamageMult * 100)}%`);
  if (e.consumableBuffMult)     parts.push(`バフ効果+${Math.round(e.consumableBuffMult * 100)}%`);
  if (e.consumableDurationMult) parts.push(`継続時間+${Math.round(e.consumableDurationMult * 100)}%`);
  if (e.consumableCooldownMult) parts.push(`CD${e.consumableCooldownMult >= 0 ? '+' : ''}${Math.round(e.consumableCooldownMult * 100)}%`);
  if (e.consumableRegenAfter)   parts.push(`使用後${e.consumableRegenAfter.duration}秒 HP+${e.consumableRegenAfter.amount}/s`);
  return parts.join(', ');
}

/** 特性バッジ用のカテゴリピル HTML (装/素/消) */
function renderTraitCategoryPills(traitName) {
  const cat = getTraitCategory(traitName);
  let html = '';
  if (cat.equip) html += `<span class="trait-cat-pill trait-cat-equip" title="装備中に発動">装</span>`;
  if (cat.craft) html += `<span class="trait-cat-pill trait-cat-craft" title="素材として調合時に発動">素</span>`;
  if (cat.consume) html += `<span class="trait-cat-pill trait-cat-consume" title="消耗品として使用時に発動">消</span>`;
  return html;
}

/** 特性バッジHTMLを生成（GameTooltip対応） */
export function createTraitBadgeHTML(traitName, extra = '') {
  const def = TraitDefs[traitName];
  const colorCls = traitColorClass(traitName);
  const baseDesc = def?.description ?? '';
  const consumeDesc = describeConsumableEffects(def);
  const desc = consumeDesc
    ? `${baseDesc}${baseDesc ? ' / ' : ''}消: ${consumeDesc}`
    : baseDesc;
  const rarity = def?.rarity ?? '';
  const pills = renderTraitCategoryPills(traitName);
  return `<span class="trait-badge ${colorCls} ${extra}" data-tooltip="${desc}" data-tooltip-title="${traitName}" data-tooltip-rarity="${rarity}">${pills}${traitName}</span>`;
}

/** 属性バッジ定義（ラベル/色/説明） */
const ELEMENT_BADGE_DEFS = {
  fire:      { label: '炎',  icon: '🔥', tooltip: '燃焼: 継続ダメージを与える' },
  ice:       { label: '氷',  icon: '❄',  tooltip: '凍結: 移動速度を低下させる' },
  poison:    { label: '毒',  icon: '☠',  tooltip: '毒: 継続ダメージ + 周囲の敵に感染' },
  lightning: { label: '雷',  icon: '⚡', tooltip: '感電: 短時間スタン' },
  wind:      { label: '風',  icon: '💨', tooltip: '風: 状態異常を持つ敵に命中時、周囲に拡散' },
  water:     { label: '水',  icon: '💧', tooltip: '脆弱: 敵が受けるダメージが15%増加' },
  none:      { label: '無',  icon: '◇', tooltip: '無属性: 与ダメージ +25%' },
};

/** 武器属性バッジHTMLを生成。element が未定義なら空文字を返す */
export function createElementBadgeHTML(element, extra = '') {
  if (!element) return '';
  const def = ELEMENT_BADGE_DEFS[element];
  if (!def) return '';
  return `<span class="element-badge element-${element} ${extra}" data-tooltip="${def.tooltip}" data-tooltip-title="${def.label}属性">${def.icon}${def.label}</span>`;
}

// アイテムの画像URL（将来のカスタム画像パス対応）
function getItemImageUrl(item) {
  const bp = ItemBlueprints[item.blueprintId];
  if (bp && bp.image) return assetPath(bp.image);
  return null; // 画像未設定
}

/**
 * タッチ端末で .trait-item-wrap / .equip-trait-wrap をタップすると
 * 特性ツールチップを開閉するグローバルハンドラ。デスクトップ(hover対応)では
 * 既存の :hover で動くため、このハンドラは無効にする。
 * main.js から起動時に1回だけ呼ぶ。
 */
let _traitTooltipTapInitialized = false;
export function initTraitTooltipTap() {
  if (_traitTooltipTapInitialized) return;
  _traitTooltipTapInitialized = true;

  const isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (!isTouch) return; // デスクトップは :hover で対応済み

  const TRAIT_SELECTOR = '.trait-item-wrap, .equip-trait-wrap';

  document.addEventListener('click', (e) => {
    const wrap = e.target.closest(TRAIT_SELECTOR);
    // 他のラップから既存の open 状態をクリア
    document.querySelectorAll(TRAIT_SELECTOR + '.show-tooltip').forEach(el => {
      if (el !== wrap) el.classList.remove('show-tooltip');
    });
    if (wrap) {
      // タップされたラップをトグル
      wrap.classList.toggle('show-tooltip');
      // trait バッジ本体の他のクリック挙動を阻害しない
    }
  });
}

// 戦闘効果のテキスト生成
function renderBattleEffectHTML(item) {
  const bp = ItemBlueprints[item.blueprintId];
  if (!bp || !bp.battleEffect) return '';
  const fx = bp.battleEffect;

  let desc = '';
  let icon = '⚔️';

  if (fx.type === 'heal') {
    icon = '❤️';
    desc = `HP ${fx.value} 回復`;
  } else if (fx.type === 'healfull') {
    icon = '❤️‍🩹';
    desc = 'HP 全回復';
  } else if (fx.type === 'revive') {
    icon = '✨';
    desc = `復活 (HP ${fx.value})`;
  } else if (fx.type === 'buff') {
    icon = '⬆️';
    const stat = fx.stat === 'atk' ? '攻撃' : fx.stat === 'def' ? '防御' : '素早さ';
    desc = `${stat}+${fx.amount} (${fx.duration}秒)`;
  } else if (fx.type === 'debuff') {
    icon = '⬇️';
    const stat = fx.stat === 'atk' ? '攻撃' : fx.stat === 'def' ? '防御' : '素早さ';
    desc = `敵${stat}${fx.amount} (${fx.duration}秒)`;
  } else if (fx.type === 'damage') {
    icon = '💥';
    desc = `ボスに ${fx.value} ダメージ`;
  } else if (fx.type === 'stun') {
    icon = '⚡';
    desc = `ボスをスタン (${fx.duration}秒)`;
  }

  return `<div class="item-battle-effect"><span class="battle-effect-icon">${icon}</span><span class="battle-effect-desc">戦闘: ${desc}</span></div>`;
}

// 画像エリアのHTML（画像がない場合は絵文字プレースホルダ）
function renderImageArea(item, typeInfo) {
  const imageUrl = getItemImageUrl(item);
  if (imageUrl) {
    return `<div class="item-card-image"><img src="${imageUrl}" alt="${item.name}" /></div>`;
  }
  // 絵文字フォールバック
  return `<div class="item-card-image item-card-image-placeholder"><span class="item-card-emoji">${typeInfo.emoji}</span></div>`;
}

/** アイテムを装備できる冒険者一覧を返す */
const ALL_ADVENTURERS = [...AdventurerDefs, ...UnlockableAdventurers];
function getEquipableAdventurers(item) {
  const bp = ItemBlueprints[item.blueprintId];
  if (!bp) return [];
  if (bp.type === 'accessory') return ALL_ADVENTURERS; // アクセサリーは全員装備可
  if (bp.type !== 'equipment' || !bp.equipType) return [];
  return ALL_ADVENTURERS.filter(adv => adv.allowedEquipTypes.includes(bp.equipType));
}

/** 装備可能者アイコン行 HTML */
function renderEquipIcons(item) {
  const advs = getEquipableAdventurers(item);
  if (advs.length === 0) return '';
  const icons = advs.map(a =>
    `<span class="equip-adv-icon" title="${a.name}">${a.icon}</span>`
  ).join('');
  return `<div class="item-equip-icons">${icons}</div>`;
}

/**
 * 特性の effects オブジェクトから読みやすい説明行の HTML を生成
 */
function buildTraitEffectsHTML(traitName) {
  const def = TraitDefs[traitName];
  if (!def?.effects) return '';

  const labels = {
    craftQualityBonus:  v => `調合品質 +${fmt1(v)}`,
    runDamageFlat:      v => `攻撃力 +${fmt1(v)}`,
    runDamageReduction: v => `ダメージ軽減 +${fmt1(v)}`,
    runMaxHpFlat:       v => `最大HP +${fmt1(v)}`,
    runMoveSpeed:       v => `移動速度 +${fmtPct1(v)}%`,
    runRegenPerSec:     v => `HP回復 +${fmt1(v)}/秒`,
    runDodge:           v => `回避率 ${v > 0 ? '+' : ''}${fmtPct1(v)}%`,
    runDropRate:        v => `ドロップ率 +${fmtPct1(v)}%`,
    runAttackSpeed:     v => `攻撃速度 +${fmtPct1(v)}%`,
    runExpBonus:        v => `経験値 +${fmtPct1(v)}%`,
    runCritChance:      v => `会心率 +${fmtPct1(v)}%`,
    runCritDamage:      v => `会心ダメージ +${fmtPct1(v)}%`,
    runElementProc:     v => `属性発動率 +${fmtPct1(v)}%`,
    runElementPower:    v => `属性効果量 +${fmtPct1(v)}%`,
  };

  return Object.entries(def.effects)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => {
      const fn = labels[k];
      if (!fn) return '';
      const isEquip = k.startsWith('run');
      const isCraft = k === 'craftQualityBonus';
      const tagCls = isEquip ? 'trait-cat-equip' : (isCraft ? 'trait-cat-craft' : '');
      const tagText = isEquip ? '装備' : (isCraft ? '素材' : '');
      const tagHtml = tagText
        ? `<span class="trait-effect-tag ${tagCls}">${tagText}</span>`
        : '';
      return `<span class="trait-effect-line">${tagHtml}${fn(v)}</span>`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * アイテムの詳細モーダルを表示する（インベントリタブ等からクリックで呼ぶ）
 */
export function openItemDetailModal(item) {
  const tier = getQualityTier(item.quality);
  const typeInfo = getTypeInfo(item.type);

  const traitsDetailHtml = item.traits.length > 0
    ? item.traits.map(t => {
        const def = TraitDefs[t];
        const rarityClass = def ? `trait-rarity-${def.rarity || 'common'}` : '';
        const effectsHtml = buildTraitEffectsHTML(t);
        return `
          <div class="detail-trait-row">
            <span class="trait-badge ${rarityClass}">${t}</span>
            <div class="detail-trait-effects">${effectsHtml || '<span class="trait-effect-line text-dim">—</span>'}</div>
          </div>
        `;
      }).join('')
    : '<div class="detail-no-traits text-dim">特性なし</div>';

  // 戦闘効果セクション
  const bp = ItemBlueprints[item.blueprintId];
  let battleSectionHtml = '';
  if (bp?.battleEffect) {
    const fx = bp.battleEffect;
    let desc = '';
    if (fx.type === 'heal') desc = `❤️ HP ${fx.value} 回復`;
    else if (fx.type === 'healfull') desc = '❤️‍🩹 HP 全回復';
    else if (fx.type === 'revive') desc = `✨ 復活 (HP ${fx.value})`;
    else if (fx.type === 'buff') {
      const stat = fx.stat === 'atk' ? '攻撃' : fx.stat === 'def' ? '防御' : '素早さ';
      desc = `⬆️ ${stat}+${fx.amount} (${fx.duration}秒)`;
    } else if (fx.type === 'debuff') {
      const stat = fx.stat === 'atk' ? '攻撃' : fx.stat === 'def' ? '防御' : '素早さ';
      desc = `⬇️ 敵${stat}${fx.amount} (${fx.duration}秒)`;
    } else if (fx.type === 'damage') {
      desc = `💥 ボスに ${fx.value} ダメージ`;
    } else if (fx.type === 'stun') {
      desc = `⚡ ボスをスタン (${fx.duration}秒)`;
    }
    if (desc) {
      battleSectionHtml = `
        <div class="detail-section">
          <div class="detail-section-title">── 戦闘効果 ──</div>
          <div class="detail-battle-effect">${desc}</div>
        </div>
      `;
    }
  }

  const modal = document.createElement('div');
  modal.className = 'item-detail-overlay';
  modal.innerHTML = `
    <div class="item-detail-modal">
      <button class="item-detail-close" id="item-detail-close">✕</button>
      <div class="item-detail-header">
        <span class="item-detail-icon">${typeInfo.emoji}</span>
        <div>
          <div class="item-detail-name">${item.name}</div>
          <div class="item-detail-type">${typeInfo.icon} ${typeInfo.label}</div>
        </div>
      </div>
      <div class="item-detail-quality">
        <span style="color:${tier.color}">${tier.icon} ${tier.name} (Q${item.quality}/${_cachedMaxQuality})</span>
        <div class="item-quality-bar" style="margin-top:4px">
          <div class="item-quality-fill" style="width:${Math.min(100, (item.quality / _cachedMaxQuality) * 100)}%"></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">── 特性 ──</div>
        ${traitsDetailHtml}
      </div>
      ${battleSectionHtml}
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#item-detail-close').addEventListener('click', () => modal.remove());
}

/**
 * アイテムインスタンスを DOM カード HTMLとして生成（倉庫用）
 */
export function createItemCardHTML(item) {
  const tier = getQualityTier(item.quality);
  const typeInfo = getTypeInfo(item.type);

  const traitsHtml = item.traits
    .map(t => {
      const def = TraitDefs[t];
      const title = def?.description ?? '';
      return createTraitBadgeHTML(t);
    })
    .join('');

  return `
    <div class="item-card ${tier.css} ${typeInfo.css}" data-uid="${item.uid}">
      ${renderImageArea(item, typeInfo)}
      <div class="item-card-body">
        <div class="item-card-type-strip">
          <span class="item-type-icon">${typeInfo.icon}</span>
          <span class="item-type-label">${typeInfo.label}</span>
        </div>
        <div class="item-card-header">
          <span class="item-name">${item.name}</span>
        </div>
        <div class="item-card-quality-row">
          <span class="item-quality">${tier.icon} Q: ${item.quality}</span>
          <span class="item-quality-name">${tier.name}</span>
        </div>
        <div class="item-quality-bar">
          <div class="item-quality-fill" style="width:${Math.min(100, (item.quality / _cachedMaxQuality) * 100)}%"></div>
        </div>
        ${renderEquipIcons(item)}
        <div class="item-traits">${traitsHtml}</div>
        ${renderBattleEffectHTML(item)}
      </div>
    </div>
  `;
}

/**
 * 売値付きのアイテムカード HTML を生成（お店 陳列用）
 */
export function createShopItemCardHTML(item) {
  const tier = getQualityTier(item.quality);
  const typeInfo = getTypeInfo(item.type);

  const traitsHtml = item.traits
    .map(t => {
      const def = TraitDefs[t];
      const title = def?.description ?? '';
      return createTraitBadgeHTML(t);
    })
    .join('');

  return `
    <div class="item-card ${tier.css} ${typeInfo.css} shop-displayable-card" data-uid="${item.uid}">
      ${renderImageArea(item, typeInfo)}
      <div class="item-card-body">
        <div class="item-card-type-strip">
          <span class="item-type-icon">${typeInfo.icon}</span>
          <span class="item-type-label">${typeInfo.label}</span>
        </div>
        <div class="item-card-header">
          <span class="item-name">${item.name}</span>
        </div>
        <div class="item-card-quality-row">
          <span class="item-quality">${tier.icon} Q: ${item.quality}</span>
          <span class="item-card-price">💰 ${item.value}G</span>
        </div>
        <div class="item-quality-bar">
          <div class="item-quality-fill" style="width:${Math.min(100, (item.quality / _cachedMaxQuality) * 100)}%"></div>
        </div>
        ${renderEquipIcons(item)}
        <div class="item-traits">${traitsHtml}</div>
        <div class="shop-display-hint">🏪 クリックで陳列</div>
      </div>
    </div>
  `;
}

/**
 * 陳列中アイテムのカード（取り下げボタン付き）
 */
export function createDisplayedItemCardHTML(item) {
  const tier = getQualityTier(item.quality);
  const typeInfo = getTypeInfo(item.type);

  const traitsHtml = item.traits
    .map(t => {
      const def = TraitDefs[t];
      const title = def?.description ?? '';
      return createTraitBadgeHTML(t);
    })
    .join('');

  return `
    <div class="item-card ${tier.css} ${typeInfo.css} displayed-glow" data-uid="${item.uid}">
      ${renderImageArea(item, typeInfo)}
      <div class="item-card-body">
        <div class="item-card-type-strip">
          <span class="item-type-icon">${typeInfo.icon}</span>
          <span class="item-type-label">${typeInfo.label}</span>
          <span class="displayed-badge">陳列中</span>
        </div>
        <div class="item-card-header">
          <span class="item-name">${item.name}</span>
        </div>
        <div class="item-card-quality-row">
          <span class="item-quality">${tier.icon} Q: ${item.quality}</span>
          <span class="item-card-price">💰 ${item.value}G</span>
        </div>
        ${renderEquipIcons(item)}
        <div class="item-traits">${traitsHtml}</div>
      </div>
    </div>
  `;
}
