/**
 * RunPrepScreen — 出撃準備画面
 * Phase 2: マルチ武器表示対応
 */

import { AreaDefs } from '../data/areas.js';
import { ItemBlueprints } from '../data/items.js';
import { Progression } from '../data/progression.js';
import { eventBus } from '../core/EventBus.js';
import { DifficultyMeta, DIFFICULTY_ORDER } from '../data/hardmode.js';
import { resolveTieredEffects } from '../run/ConsumableSystem.js';
import { BOSS_RUSH_ORDER } from '../run/BossRushManager.js';

export class RunPrepScreen {
  constructor(container, getWeaponSlots, getArmor, getAccessory, inventory, initialConsumableUids = [], initialAreaId = null) {
    this.container = container;
    this.getWeaponSlots = getWeaponSlots;
    this.getArmor = getArmor;
    this.getAccessory = getAccessory;
    this.inventory = inventory;
    // 前回の選択をUID経由で復元（売却/クラフトで消えたUIDは除外）
    this.selectedConsumables = (initialConsumableUids || [])
      .map(uid => this.inventory?.getItemByUid?.(uid))
      .filter(Boolean);
    this.el = document.createElement('div');
    this.el.className = 'prep-screen';
    // 前回のステージ選択を復元（未解放なら草原にフォールバック）
    const savedArea = initialAreaId && AreaDefs[initialAreaId];
    this.selectedArea = (savedArea && savedArea.unlocked) ? initialAreaId : 'plains';
    this.difficulty = 'normal';
  }

  /** ステージ選択変更を emit（Game側で永続化） */
  _emitAreaChanged() {
    eventBus.emit('area:selected', { areaId: this.selectedArea });
  }

  /** 選択状態変更時に UID を emit（Game側で永続化） */
  _emitConsumablesChanged() {
    eventBus.emit('consumables:selected', {
      uids: this.selectedConsumables.map(c => c.uid),
    });
  }

  render() {
    const weaponSlots = this.getWeaponSlots();
    const equippedWeapons = weaponSlots.filter(w => w !== null);
    const armor = this.getArmor();
    const accessory = this.getAccessory();
    const area = AreaDefs[this.selectedArea];
    const invItemCount = this.inventory?.items?.length ?? 0;
    const invMax = this.inventory?.maxCapacity ?? Infinity;
    const overCapacity = invItemCount > invMax;
    const canStart = equippedWeapons.length > 0 && !overCapacity;

    const weaponListHtml = equippedWeapons.length > 0
      ? equippedWeapons.map((w, i) => {
          const bp = ItemBlueprints[w.blueprintId];
          return `<span class="prep-weapon">${i + 1}. ${w.name} (Q${w.quality})</span>`;
        }).join('')
      : '<span class="prep-no-weapon">未装備</span>';

    const armorHtml = armor ? `🛡 ${armor.name} (Q${armor.quality})` : '未装備';
    const accessoryHtml = accessory ? `💍 ${accessory.name} (Q${accessory.quality})` : '未装備';

    this.el.innerHTML = `
      <div class="prep-layout">
        <div class="prep-area">
          <h3>ステージ選択</h3>
          <div class="area-list">
            ${Object.values(AreaDefs).map(a => `
              <div class="area-card ${a.id === this.selectedArea ? 'selected' : ''} ${a.unlocked ? '' : 'locked'}"
                   data-area="${a.id}" ${a.unlocked ? '' : 'aria-disabled="true"'}>
                <span class="area-icon">${a.icon}</span>
                <span class="area-name">${a.name}</span>
                ${!a.unlocked ? '<span class="area-lock">🔒</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="prep-summary">
          <h3>出撃準備</h3>
          ${this._renderPresetSelect()}
          <div class="prep-info">
            <div class="prep-row">
              <span>ステージ:</span>
              <span>${area.icon} ${area.name}</span>
            </div>
            <div class="prep-row-weapons">
              <span>武器 (${equippedWeapons.length}/4):</span>
              <div class="prep-weapon-list">${weaponListHtml}</div>
            </div>
            <div class="prep-row">
              <span>防具:</span>
              <span>${armorHtml}</span>
            </div>
            <div class="prep-row">
              <span>アクセサリ:</span>
              <span>${accessoryHtml}</span>
            </div>
            <div class="prep-consumables">
              <h4>消耗品 (${this.selectedConsumables.length}/3)</h4>
              <div class="prep-consumable-slots">
                ${[0, 1, 2].map(i => {
                  const c = this.selectedConsumables[i];
                  const cBp = c ? ItemBlueprints[c.blueprintId] : null;
                  const cEffect = cBp?.battleEffect ? this._describeBattleEffect(cBp.battleEffect, c?.quality) : '';
                  return c
                    ? `<div class="prep-cons-slot filled" data-idx="${i}">
                        <span class="cons-key">${i + 1}</span>
                        <div class="cons-slot-info">
                          <span>${c.name}</span>
                          <span class="cons-slot-effect">${cEffect}</span>
                        </div>
                        <button class="cons-remove" data-idx="${i}">✕</button>
                      </div>`
                    : `<div class="prep-cons-slot empty" data-idx="${i}">
                        <span class="cons-key">${i + 1}</span>
                        <button class="cons-add" data-idx="${i}">+追加</button>
                      </div>`;
                }).join('')}
              </div>
            </div>
            <div class="prep-stage-info">
              <h4>ステージ情報</h4>
              <div class="prep-row"><span>難易度:</span><span>${'★'.repeat(area.difficulty + 1)}</span></div>
              <div class="prep-row"><span>ドロップ品質:</span><span>Q${area.qualityMin}〜Q${area.qualityMax}</span></div>
              <div class="prep-row"><span>ボス:</span><span>${area.boss ? `${area.boss.icon} ${area.boss.name} (HP${area.boss.maxHp})` : 'なし'}</span></div>
              ${this._renderDifficultySelector()}
            </div>
          </div>
          ${equippedWeapons.length === 0 ? '<p class="prep-warning">武器を1つ以上装備してください</p>' : ''}
          ${overCapacity ? `<p class="prep-warning">⚠️ 倉庫が上限を超えています (${invItemCount}/${invMax})。倉庫画面でアイテムを整理してください。</p>` : ''}
          <button class="prep-start-btn" ${canStart ? '' : 'disabled'}>出撃！</button>
          ${this._renderBossRushSection(canStart)}
        </div>
      </div>
    `;
    this.container.appendChild(this.el);

    this.el.querySelectorAll('.area-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedArea = card.dataset.area;
        this._emitAreaChanged();
        this.render();
      });
    });

    // 消耗品スロットのイベント
    this.el.querySelectorAll('.cons-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this._showConsumablePicker(idx);
      });
    });
    this.el.querySelectorAll('.cons-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.selectedConsumables.splice(idx, 1);
        this._emitConsumablesChanged();
        this.render();
      });
    });

    // 難易度プルダウン
    const diffSelect = this.el.querySelector('#difficulty-select');
    if (diffSelect) {
      diffSelect.addEventListener('change', () => {
        this.difficulty = diffSelect.value;
        this.render();
      });
    }

    // プリセット切替
    const presetSelect = this.el.querySelector('.prep-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const id = presetSelect.value;
        if (!id) return;
        eventBus.emit('preset:apply', { id });
        // equipment:changed が発火すると親が再レンダーするので、ここでは再描画のみ
        setTimeout(() => this.render(), 0);
        presetSelect.value = '';
      });
    }

    const startBtn = this.el.querySelector('.prep-start-btn');
    if (startBtn && canStart) {
      startBtn.addEventListener('click', () => {
        // 選択中の難易度がそのエリアで未解放なら normal に落とす（誤クリック保護）
        const safeDifficulty = this._isDifficultyAvailable(this.difficulty) ? this.difficulty : 'normal';
        eventBus.emit('run:start', {
          weaponSlots: weaponSlots.filter(w => w !== null),
          areaId: this.selectedArea,
          consumables: [...this.selectedConsumables],
          difficulty: safeDifficulty,
          hardMode: safeDifficulty !== 'normal', // 旧API互換
        });
      });
    }

    // ボスラッシュ出撃ボタン
    const brBtn = this.el.querySelector('.prep-bossrush-btn');
    if (brBtn && !brBtn.disabled) {
      brBtn.addEventListener('click', () => {
        const safeDifficulty = this._isDifficultyAvailable(this.difficulty) ? this.difficulty : 'normal';
        eventBus.emit('run:start', {
          weaponSlots: weaponSlots.filter(w => w !== null),
          areaId: BOSS_RUSH_ORDER[0],
          consumables: [...this.selectedConsumables],
          difficulty: safeDifficulty,
          hardMode: safeDifficulty !== 'normal',
          bossRush: true,
        });
      });
    }

    return this.el;
  }

  /** ボスラッシュ解放: 全7エリアのボスを撃破済み */
  _isBossRushUnlocked() {
    const defeated = new Set(Progression.getDefeatedBosses?.() || []);
    for (const areaId of BOSS_RUSH_ORDER) {
      const area = AreaDefs[areaId];
      if (!area?.boss?.id) return false;
      if (!defeated.has(area.boss.id)) return false;
    }
    return true;
  }

  /** RunPrep の出撃ボタン下に表示するボスラッシュ用セクション */
  _renderBossRushSection(canStart) {
    const unlocked = this._isBossRushUnlocked();
    if (!unlocked) {
      const defeated = new Set(Progression.getDefeatedBosses?.() || []);
      const remaining = BOSS_RUSH_ORDER.filter(a => {
        const area = AreaDefs[a];
        return area?.boss?.id && !defeated.has(area.boss.id);
      }).length;
      return `<div class="bossrush-locked">
        <p style="margin-top:0.8rem; color:var(--color-text-dim); font-size:0.85rem;">
          🏆 ボスラッシュ: 全7ボス撃破で解放 (残り <strong>${remaining}</strong>)
        </p>
      </div>`;
    }
    return `<div class="bossrush-section" style="margin-top:0.8rem;">
      <button class="prep-bossrush-btn" ${canStart ? '' : 'disabled'} style="
        width: 100%; padding: 0.6rem; font-family: inherit; font-size: 0.95rem;
        background: linear-gradient(135deg, #b8410f, #d4a017);
        color: #fff; border: 2px solid #8b0000; border-radius: 6px;
        cursor: pointer; font-weight: bold;
      ">🏆 ボスラッシュ — 7体連続戦に挑む</button>
      <p style="margin-top:0.4rem; color:var(--color-text-dim); font-size:0.75rem;">
        7体連戦・HP/装備持ち越し・ボス間30秒ロビー。完走で伝説ペット卵獲得！
      </p>
    </div>`;
  }

  _showConsumablePicker(slotIdx) {
    const consumables = this.inventory
      ? this.inventory.items.filter(item => {
          const bp = ItemBlueprints[item.blueprintId];
          return bp && bp.type === 'consumable' && !this.selectedConsumables.some(sc => sc.uid === item.uid);
        })
      : [];

    const overlay = document.createElement('div');
    overlay.className = 'cons-picker-overlay';
    overlay.innerHTML = `
      <div class="cons-picker">
        <h4>消耗品を選択 (スロット ${slotIdx + 1})</h4>
        ${consumables.length > 0
          ? consumables.map((item, i) => {
              const bp = ItemBlueprints[item.blueprintId];
              const effectDesc = bp?.battleEffect ? this._describeBattleEffect(bp.battleEffect, item?.quality) : '';
              return `<div class="cons-picker-item" data-item-idx="${i}">
                <span class="cons-picker-name">${item.name} (Q${item.quality})</span>
                <span class="cons-picker-effect">${effectDesc}</span>
              </div>`;
            }).join('')
          : '<p style="color:#888;text-align:center;">使用可能な消耗品がありません</p>'
        }
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        return;
      }
      const pickerItem = e.target.closest('.cons-picker-item');
      if (pickerItem) {
        const itemIdx = parseInt(pickerItem.dataset.itemIdx, 10);
        const selected = consumables[itemIdx];
        if (selected) {
          if (slotIdx < this.selectedConsumables.length) {
            this.selectedConsumables[slotIdx] = selected;
          } else {
            this.selectedConsumables.push(selected);
          }
          this._emitConsumablesChanged();
          overlay.remove();
          this.render();
        }
      }
    });

    document.body.appendChild(overlay);
  }

  /** 指定難易度がそのエリアで選択可能かを返す（順次解放）
   *   normal:    常時可能
   *   hard:      そのエリアのボスを normal 以上でクリア
   *   challenge: そのエリアのボスを hard 以上でクリア
   *   nightmare: そのエリアのボスを challenge 以上でクリア
   */
  _isDifficultyAvailable(difficulty) {
    if (difficulty === 'normal') return true;
    const area = AreaDefs[this.selectedArea];
    if (!area?.boss) return false;
    const requiredClear = {
      hard:      'normal',
      challenge: 'hard',
      nightmare: 'challenge',
    }[difficulty];
    return Progression.isBossDefeated(area.boss.id, requiredClear);
  }

  /** 難易度選択プルダウン + 現在選択中の倍率説明 */
  _renderDifficultySelector() {
    const area = AreaDefs[this.selectedArea];
    if (!area?.boss) return ''; // ボスのないエリアは難易度選択なし

    // 表示ルール:
    //  - ノーマル: 常時
    //  - 解放済難易度: 常時
    //  - 次にロック中の 1 つ: 🔒 付き disabled で目標提示
    //  - さらに上のロック中: 非表示
    const nextLocked = this._nextLockedDifficulty();
    const options = DIFFICULTY_ORDER.map(d => {
      const meta = DifficultyMeta[d];
      const available = this._isDifficultyAvailable(d);
      if (!available && d !== nextLocked) return '';
      const prefix = available ? '' : '🔒 ';
      const selected = this.difficulty === d ? 'selected' : '';
      const disabled = available ? '' : 'disabled';
      return `<option value="${d}" ${selected} ${disabled}>${prefix}${meta.icon} ${meta.label}</option>`;
    }).filter(Boolean).join('');

    const currentMeta = DifficultyMeta[this.difficulty] || DifficultyMeta.normal;
    return `
      <div class="prep-difficulty">
        <label class="difficulty-select-label">
          <span>難易度:</span>
          <select id="difficulty-select" class="difficulty-select">${options}</select>
        </label>
        ${this.difficulty !== 'normal' ? `<div class="difficulty-desc">${currentMeta.icon} ${currentMeta.label}: ${currentMeta.shortDesc}</div>` : ''}
      </div>
    `;
  }

  /** 順次解放のうち、次にロック中の1つだけは表示してプレイヤーに目標を見せる */
  _nextLockedDifficulty() {
    for (const d of DIFFICULTY_ORDER) {
      if (d === 'normal') continue;
      if (!this._isDifficultyAvailable(d)) return d;
    }
    return null;
  }

  _renderPresetSelect() {
    const mgr = this.presetsManager;
    if (!mgr || !mgr.list || mgr.list.length === 0) return '';
    const options = mgr.list.map(p =>
      `<option value="${p.id}">${this._escapeAttr(p.name)}</option>`
    ).join('');
    return `
      <div class="prep-preset-row">
        <label>装備プリセット:</label>
        <select class="prep-preset-select">
          <option value="">— 選択 —</option>
          ${options}
        </select>
      </div>
    `;
  }

  _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _describeBattleEffect(fx, quality) {
    const statNames = { atk: '攻撃力', def: '防御力', spd: '速度', crit: '会心率', critDmg: '会心ダメ', cooldown: 'CD短縮', elemPower: '属性威力', elemProc: '属性発動率', dodge: '回避', range: '武器範囲', magnet: '磁力', maxHp: '最大HP' };
    // tier 形式: 現在品質で解決した効果を1行要約
    if (Array.isArray(fx.tiers)) {
      const r = resolveTieredEffects(fx, quality || 0);
      if (!r) return '';
      const parts = [];
      if (r.heal) parts.push(`💚HP+${r.heal}`);
      if (r.percentHeal) parts.push(`💚最大${r.percentHeal}%`);
      if (r.regen && r.regen.hpPerSec && r.regen.duration) parts.push(`🌿+${r.regen.hpPerSec}/秒×${r.regen.duration}s`);
      if (r.shield && r.shield.amount) parts.push(`🛡️+${r.shield.amount}HP`);
      if (r.buffs) {
        for (const k of Object.keys(r.buffs)) {
          const b = r.buffs[k];
          parts.push(`⬆️${statNames[b.stat] || b.stat}+${b.amount}`);
        }
      }
      if (r.damage) parts.push(`💥${r.damage}`);
      if (r.statusEffect) {
        const typeLabel = { burn: '🔥', poison: '☠', freeze: '❄', shock: '⚡' }[r.statusEffect.type] || r.statusEffect.type;
        parts.push(typeLabel);
      }
      if (r.vulnerable) parts.push(`💢脆弱+${r.vulnerable.amount}%`);
      if (r.stun) parts.push(`⚡スタン${r.stun.duration}s`);
      return parts.join(' ') || '(未解放)';
    }
    switch (fx.type) {
      case 'heal': return `💚 HP${fx.value}回復`;
      case 'healfull': return `💚 HP全回復`;
      case 'buff': return `⬆️ ${statNames[fx.stat] || fx.stat}+${fx.amount} (${fx.duration}秒)`;
      case 'debuff': return `⬇️ 敵${statNames[fx.stat] || fx.stat}${fx.amount} (${fx.duration}秒)`;
      case 'damage': return `💥 周囲ダメージ${fx.value}`;
      case 'stun': return `⚡ スタン${fx.duration}秒`;
      default: return '';
    }
  }

  destroy() {
    const picker = document.querySelector('.cons-picker-overlay');
    if (picker) picker.remove();
    this.el.remove();
  }
}
