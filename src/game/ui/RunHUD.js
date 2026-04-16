/**
 * RunHUD — ラン中HUD（全UI要素統合・画像対応版）
 */

import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints } from '../data/items.js';
import { GameConfig } from '../data/config.js';
import { PassiveDefs } from '../data/passives.js';
import { assetPath } from '../core/assetPath.js';
import { fmt1, fmtPct1, fmtInt } from './NumberFormat.js';

const _passiveDefById = Object.fromEntries(PassiveDefs.map(p => [p.id, p]));

const WEAPON_ICONS = {
  sword: '\u2694\uFE0F', spear: '\uD83D\uDDE1\uFE0F', bow: '\uD83C\uDFF9',
  staff: '\u2728', dagger: '\uD83D\uDD2A', shield: '\uD83D\uDEE1\uFE0F',
};

const CONSUMABLE_ICONS = {
  heal: '\u2764\uFE0F', healfull: '\uD83D\uDC9A', buff: '\u2B06\uFE0F',
  damage: '\uD83D\uDCA5', debuff: '\uD83C\uDF00', stun: '\u2744\uFE0F',
};

const BUFF_STAT_ICONS = { atk: '\u2694\uFE0F', def: '\uD83D\uDEE1\uFE0F', spd: '\u26A1' };

function getItemImage(blueprintId) {
  const bp = ItemBlueprints[blueprintId];
  if (bp && bp.image) return assetPath(bp.image);
  return null;
}

export class RunHUD {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.id = 'run-hud';
    this.el.innerHTML = `
      <!-- Mobile pause button (left top; hidden on desktop via CSS) -->
      <button class="hud-pause-btn" id="hud-pause" type="button" aria-label="一時停止">
        <svg class="hud-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1"/>
          <rect x="14" y="5" width="4" height="14" rx="1"/>
        </svg>
      </button>

      <!-- Top Center: Timer + Wave -->
      <div class="hud-top-center">
        <div class="hud-timer" id="hud-timer">5:00</div>
        <div class="hud-wave" id="hud-wave"></div>
      </div>

      <!-- Skill activation banner (timer下) -->
      <div class="hud-skill-banner" id="hud-skill-banner"></div>

      <!-- Full-screen flash overlay for skill activation -->
      <div class="hud-skill-flash" id="hud-skill-flash"></div>

      <!-- 被弾ビネット（画面端の赤い脈動） -->
      <div class="hud-damage-vignette" id="hud-damage-vignette"></div>

      <!-- Top Right: Kills + Resources -->
      <div class="hud-top-right">
        <div class="hud-kills" id="hud-kills">0 kills</div>
        <div class="hud-resources" id="hud-resources">
          <span class="hud-gold">\uD83D\uDCB0 0</span>
          <span class="hud-mats">\uD83D\uDCE6 0</span>
        </div>
      </div>

      <!-- Boss HP -->
      <div class="hud-boss-bar hidden" id="hud-boss-bar">
        <div class="hud-boss-name" id="hud-boss-name"></div>
        <div class="hud-boss-hp">
          <div class="hud-boss-hp-fill" id="hud-boss-hp-fill"></div>
        </div>
      </div>

      <!-- Alert -->
      <div class="hud-alert hidden" id="hud-alert"></div>

      <!-- ═══ 中央下 コンソールパネル（HP/Lv/Dash/Stats/武器/消耗品/リソース統合） ═══ -->
      <div class="hud-console">
        <!-- 上段: HP / Lv / Dash / Stats -->
        <div class="hud-console-top">
          <div class="hud-console-hp">
            <div class="hud-hp-bar">
              <div class="hud-hp-lag" id="hud-hp-lag"></div>
              <div class="hud-hp-fill" id="hud-hp-fill"></div>
              <span class="hud-hp-text" id="hud-hp-text">100 / 100</span>
            </div>
          </div>
          <div class="hud-console-lv">
            <span class="hud-level" id="hud-level">Lv.1</span>
          </div>
          <div class="hud-console-dash" id="hud-dash" title="Space / Shift でダッシュ">
            <span class="hud-dash-icon">\uD83D\uDCA8</span>
            <div class="hud-dash-bar"><div class="hud-dash-fill" id="hud-dash-fill"></div></div>
            <span class="hud-dash-text" id="hud-dash-text">READY</span>
          </div>
          <div class="hud-console-stats" id="hud-stats">
            <div class="hud-stats-mini" id="hud-stats-mini"></div>
            <div class="hud-stats-detail hidden" id="hud-stats-detail"></div>
          </div>
        </div>

        <!-- 中段: 武器 | 消耗品 -->
        <div class="hud-console-mid">
          <div class="hud-console-col hud-col-weapons">
            <div class="hud-col-label">武器</div>
            <div class="hud-weapons" id="hud-weapons"></div>
          </div>
          <div class="hud-console-col hud-col-cons">
            <div class="hud-col-label">消耗品</div>
            <div class="hud-consumables" id="hud-consumables"></div>
          </div>
        </div>
      </div>

      <!-- パッシブアイコン（右下フロート、ラベルなし） -->
      <div class="hud-passives-float" id="hud-passives"></div>

      <!-- パッシブ詳細パネル（Tabで表示） -->
      <div class="hud-passives-detail hidden" id="hud-passives-detail"></div>

      <!-- EXP Bar -->
      <div class="hud-exp-bar">
        <div class="hud-exp-fill" id="hud-exp-fill"></div>
      </div>
    `;
    container.appendChild(this.el);

    this._hpFill = this.el.querySelector('#hud-hp-fill');
    this._hpText = this.el.querySelector('#hud-hp-text');
    this._level = this.el.querySelector('#hud-level');
    this._timer = this.el.querySelector('#hud-timer');
    this._kills = this.el.querySelector('#hud-kills');
    this._expFill = this.el.querySelector('#hud-exp-fill');
    this._bossBar = this.el.querySelector('#hud-boss-bar');
    this._bossName = this.el.querySelector('#hud-boss-name');
    this._bossHpFill = this.el.querySelector('#hud-boss-hp-fill');
    this._alert = this.el.querySelector('#hud-alert');
    this._alertTimeout = null;
    this._passivesEl = this.el.querySelector('#hud-passives');
    this._weaponsEl = this.el.querySelector('#hud-weapons');
    this._resourcesEl = this.el.querySelector('#hud-resources');
    this._waveEl = this.el.querySelector('#hud-wave');
    this._statsMini = this.el.querySelector('#hud-stats-mini');
    this._statsDetail = this.el.querySelector('#hud-stats-detail');
    this._dashFill = this.el.querySelector('#hud-dash-fill');
    this._dashText = this.el.querySelector('#hud-dash-text');
    this._passivesDetail = this.el.querySelector('#hud-passives-detail');
    this._hpLag = this.el.querySelector('#hud-hp-lag');

    this._skillBanner = this.el.querySelector('#hud-skill-banner');
    this._skillFlash = this.el.querySelector('#hud-skill-flash');
    this._damageVignette = this.el.querySelector('#hud-damage-vignette');
    this._damageVignetteTimeout = null;
    this._skillBannerTimeout = null;
    this._skillFlashTimeout = null;

    this._passiveList = [];
    this._statsExpanded = false;
    this._passivesExpanded = false;
    this._PASSIVE_LIMIT = 3;

    this._onKeyDown = (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this._toggleDetail();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Mobile pause button — emits pauseMenu:requestToggle, RunManager handles it
    // touchstart で先にトグル発火（モバイルで click イベントが何らかの理由で
    // 届かないケースに対する保険）。デスクトップは click が動く。
    const pauseBtn = this.el.querySelector('#hud-pause');
    if (pauseBtn) {
      let lastTriggerAt = 0;
      const triggerPause = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        // touchstart→click の二重発火を抑止
        const now = Date.now();
        if (now - lastTriggerAt < 350) return;
        lastTriggerAt = now;
        eventBus.emit('pauseMenu:requestToggle');
      };
      pauseBtn.addEventListener('click', triggerPause);
      pauseBtn.addEventListener('touchstart', triggerPause, { passive: false });
    }

    // Consumable slots — クリック/タップで発動（キー 1-3 と同等）
    // 注意: _updateConsumables が毎tick innerHTML を書き換えるため、
    // mousedown→mouseup 間にスロット要素が置換されて click が成立しない。
    // pointerdown を使って press 検知で即発火する。
    const consEl = this.el.querySelector('#hud-consumables');
    if (consEl) {
      let lastConsTriggerAt = 0;
      const triggerCons = (e) => {
        const slotEl = e.target.closest('.hud-cons-slot');
        if (!slotEl || !consEl.contains(slotEl)) return;
        e.preventDefault();
        e.stopPropagation();
        // 多重発火抑止（pointerdown / touchstart / click 重複対策）
        const now = Date.now();
        if (now - lastConsTriggerAt < 350) return;
        lastConsTriggerAt = now;
        const idx = parseInt(slotEl.dataset.slot, 10);
        if (Number.isInteger(idx)) eventBus.emit('consumable:requestUse', { slot: idx });
      };
      consEl.addEventListener('pointerdown', triggerCons);
      // フォールバック（pointer event 未対応ブラウザ向け）
      consEl.addEventListener('click', triggerCons);
      consEl.addEventListener('touchstart', triggerCons, { passive: false });
    }

    this._unsubs = [
      eventBus.on('run:tick', (data) => this._onTick(data)),
      eventBus.on('player:expChanged', (data) => this._onExpChanged(data)),
      eventBus.on('boss:spawned', (data) => this._onBossSpawned(data)),
      eventBus.on('boss:hpChanged', (data) => this._onBossHpChanged(data)),
      eventBus.on('boss:phaseChange', (data) => this._showAlert(data.message)),
      eventBus.on('boss:defeated', () => this._onBossDefeated()),
      eventBus.on('boss:intro', (data) => this._showAlert(`\u26A0\uFE0F ${data.icon} ${data.name} \u51FA\u73FE\uFF01`)),
      eventBus.on('area:unlocked', (data) => this._showAlert(`\uD83C\uDF89 ${data.name} \u304C\u89E3\u653E\u3055\u308C\u305F\uFF01`)),
      eventBus.on('weapon:unlocked', (data) => this._showAlert(`\uD83D\uDDE1\uFE0F ${data.name} \u304C\u4F7F\u7528\u53EF\u80FD\u306B\uFF01`)),
      eventBus.on('consumable:slotsChanged', ({ slots, buffs }) => this._updateConsumables(slots, buffs)),
      eventBus.on('levelup:selected', (data) => this._onPassiveSelected(data)),
      eventBus.on('skill:activated', (data) => this._showSkillBanner(data)),
      eventBus.on('ui:flash', (data) => this._showSkillFlash(data)),
      eventBus.on('player:damaged', () => this._flashDamageVignette()),
    ];
  }

  _toggleDetail() {
    this._statsExpanded = !this._statsExpanded;
    this._statsDetail.classList.toggle('hidden', !this._statsExpanded);
    this._passivesDetail.classList.toggle('hidden', !this._statsExpanded);
    this._renderPassivesDetail();
  }

  _showSkillBanner({ name, color }) {
    if (!this._skillBanner) return;
    this._skillBanner.textContent = name;
    this._skillBanner.style.color = color || '#ffd766';
    this._skillBanner.style.borderColor = color || '#ffd766';
    this._skillBanner.classList.remove('show');
    // reflow で再アニメーションを起こす
    void this._skillBanner.offsetWidth;
    this._skillBanner.classList.add('show');
    if (this._skillBannerTimeout) clearTimeout(this._skillBannerTimeout);
    this._skillBannerTimeout = setTimeout(() => {
      this._skillBanner.classList.remove('show');
    }, 1400);
  }

  _showSkillFlash({ color, duration }) {
    if (!this._skillFlash) return;
    const dur = (duration || 0.2) * 1000;
    this._skillFlash.style.backgroundColor = color || '#fff';
    this._skillFlash.style.transitionDuration = `${dur}ms`;
    this._skillFlash.classList.add('show');
    if (this._skillFlashTimeout) clearTimeout(this._skillFlashTimeout);
    this._skillFlashTimeout = setTimeout(() => {
      this._skillFlash.classList.remove('show');
    }, 40);
  }

  _flashDamageVignette() {
    if (!this._damageVignette) return;
    this._damageVignette.classList.add('show');
    if (this._damageVignetteTimeout) clearTimeout(this._damageVignetteTimeout);
    this._damageVignetteTimeout = setTimeout(() => {
      this._damageVignette.classList.remove('show');
    }, 80);
  }

  _onTick({ remaining, killCount, hp, maxHp, goldEarned, materialCount, weaponSlots, player, bossSpawnTimes, elapsed }) {
    const hpPct = Math.max(0, hp / maxHp * 100);
    this._hpFill.style.width = hpPct + '%';
    this._hpFill.style.backgroundColor = hpPct > 50 ? '#4c4' : hpPct > 25 ? '#cc4' : '#c44';
    this._hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;
    // HP遅延バー: 減少時は lag が遅れて追従（赤い差分）、回復/横ばい時は即追従
    // 横ばい時に rAF を積み続けるとコールバックが蓄積するため、
    // 実際に変化があった時だけ処理する
    if (this._hpLag) {
      const prev = this._lastHpPct == null ? hpPct : this._lastHpPct;
      if (hpPct !== prev) {
        if (hpPct >= prev) {
          this._hpLag.classList.add('no-delay');
          this._hpLag.style.width = hpPct + '%';
          requestAnimationFrame(() => this._hpLag && this._hpLag.classList.remove('no-delay'));
        } else {
          this._hpLag.style.width = hpPct + '%';
        }
        this._lastHpPct = hpPct;
      }
    }

    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    this._timer.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    // kills は頻繁に変化するが同値も多い。前回値と比較して差分更新。
    if (killCount !== this._lastKillCount) {
      this._kills.textContent = `${killCount} kills`;
      this._lastKillCount = killCount;
    }

    // resources は goldEarned / materialCount が変化した時だけDOM更新
    const g = goldEarned || 0;
    const m = materialCount || 0;
    if (g !== this._lastGold || m !== this._lastMaterialCount) {
      this._resourcesEl.innerHTML =
        `<span class="hud-gold">\uD83D\uDCB0 ${g}</span>` +
        `<span class="hud-mats">\uD83D\uDCE6 ${m}</span>`;
      this._lastGold = g;
      this._lastMaterialCount = m;
    }

    if (weaponSlots) this._updateWeapons(weaponSlots);
    if (elapsed !== undefined && bossSpawnTimes) this._updateWave(elapsed, bossSpawnTimes);
    if (player) {
      this._updateStats(player);
      this._updateDash(player);
    }
  }

  _updateDash(player) {
    if (!this._dashFill) return;
    const cd = player.dashCooldownTimer || 0;
    const cdMax = GameConfig.run.dashCooldown;
    if (cd <= 0) {
      this._dashFill.style.width = '100%';
      this._dashFill.classList.add('ready');
      this._dashText.textContent = 'READY';
    } else {
      const pct = Math.max(0, (1 - cd / cdMax)) * 100;
      this._dashFill.style.width = fmtInt(pct) + '%';
      this._dashFill.classList.remove('ready');
      this._dashText.textContent = fmt1(cd) + 's';
    }
  }

  _onExpChanged({ exp, expToNext, level }) {
    this._level.textContent = `Lv.${level}`;
    // expToNext が 0（最大レベル到達等）の場合 Infinity% になるのを防ぐ
    const pct = expToNext > 0 ? Math.min(100, (exp / expToNext) * 100) : 100;
    this._expFill.style.width = pct + '%';
  }

  // --- Weapon Slots (with images) ---
  // 毎フレーム innerHTML 書き換えは重い(DOM churn + GC)ので、構造変化がない限り
  // 既存DOM要素のCDバー width/class のみ更新する差分方式。
  _updateWeapons(slots) {
    // 構造変化(unlocked状態または個数の変化)を検出
    const structureKey = slots.map(s => s.unlocked ? `${s.name}|${s.equipType}` : 'L').join('/');
    if (structureKey !== this._lastWeaponStructKey) {
      this._lastWeaponStructKey = structureKey;
      this._weaponsEl.innerHTML = slots.map((s) => {
        if (!s.unlocked) {
          return `<div class="hud-weapon-slot locked">
            <div class="hud-wpn-img-wrap"><span class="hud-wpn-lock">\uD83D\uDD12</span></div>
          </div>`;
        }
        const imgUrl = getItemImage(s.blueprintId);
        const imgHtml = imgUrl
          ? `<img class="hud-wpn-img" src="${imgUrl}" alt="${s.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : '';
        const fallbackIcon = WEAPON_ICONS[s.equipType] || '\u2694\uFE0F';
        return `<div class="hud-weapon-slot">
          <div class="hud-wpn-img-wrap">
            ${imgHtml}
            <span class="hud-wpn-fallback" ${imgUrl ? 'style="display:none"' : ''}>${fallbackIcon}</span>
          </div>
          <div class="hud-wpn-skill-bar">
            <div class="hud-wpn-skill-fill"></div>
          </div>
          <span class="hud-wpn-name">${s.name}</span>
        </div>`;
      }).join('');
      // 描画した要素を参照キャッシュ
      this._weaponSlotEls = Array.from(this._weaponsEl.querySelectorAll('.hud-weapon-slot'));
      this._weaponSkillFills = this._weaponSlotEls.map(el => el.querySelector('.hud-wpn-skill-fill'));
    }

    // スキルCDとready状態のみ毎フレーム更新（軽量）
    if (!this._weaponSlotEls) return;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const el = this._weaponSlotEls[i];
      const fill = this._weaponSkillFills[i];
      if (!el || !fill) continue;
      if (!s.unlocked) continue;
      const pct = Math.max(0, (1 - (s.skillCooldownPct || 0)) * 100);
      fill.style.width = pct + '%';
      const ready = !!s.skillReady;
      if (ready !== el._ready) {
        el.classList.toggle('skill-ready', ready);
        fill.classList.toggle('ready', ready);
        el._ready = ready;
      }
    }
  }

  // --- Passive Badges ---
  _onPassiveSelected(data) {
    if (data.isWeaponUnlock) return;
    this._passiveList.push(data.passiveId);
    this._renderPassives();
  }

  _renderPassives() {
    const counts = {};
    const order = [];
    // 取得順に出現、カウントアップ
    for (const id of this._passiveList) {
      if (!(id in counts)) order.push(id);
      counts[id] = (counts[id] || 0) + 1;
    }
    const icons = {
      damage_up: '\u2694\uFE0F', range_up: '\uD83D\uDD35', hp_up: '\u2764\uFE0F',
      speed_up: '\uD83D\uDCA8', magnet_up: '\uD83E\uDDF2', cooldown_down: '\u23F1\uFE0F',
      regen: '\uD83D\uDC9A', extra_drop: '\uD83C\uDF81', extra_projectile: '\uD83D\uDD31',
      crit_chance: '\uD83D\uDCA5',
    };
    // デフォルトは最新N個のみ表示（Tabで全表示に切替）
    const ids = this._passivesExpanded
      ? order
      : order.slice(-this._PASSIVE_LIMIT);
    const hidden = order.length - ids.length;
    const badges = ids.map(id => {
      const icon = icons[id] || '\u2B50';
      const count = counts[id];
      return `<span class="hud-passive-badge" title="${id} x${count}">${icon}${count > 1 ? count : ''}</span>`;
    });
    if (hidden > 0) {
      badges.unshift(`<span class="hud-passive-badge hud-passive-more" title="Tabキーで全表示">+${hidden}</span>`);
    }
    this._passivesEl.innerHTML = badges.join('');
  }

  _renderPassivesDetail() {
    if (!this._passivesDetail) return;
    if (this._passiveList.length === 0) {
      this._passivesDetail.innerHTML = '<div class="hud-pdet-empty">パッシブ未取得</div>';
      return;
    }
    const counts = {};
    const order = [];
    for (const id of this._passiveList) {
      if (!(id in counts)) order.push(id);
      counts[id] = (counts[id] || 0) + 1;
    }
    const rows = order.map(id => {
      const def = _passiveDefById[id] || { name: id, icon: '⭐', description: '' };
      const count = counts[id];
      return `<div class="hud-pdet-row">
        <span class="hud-pdet-icon">${def.icon || '⭐'}</span>
        <span class="hud-pdet-name">${def.name || id}</span>
        ${count > 1 ? `<span class="hud-pdet-count">×${count}</span>` : ''}
      </div>`;
    }).join('');
    this._passivesDetail.innerHTML = `
      <div class="hud-pdet-header">取得パッシブ (${this._passiveList.length})</div>
      <div class="hud-pdet-list">${rows}</div>
    `;
  }

  // --- Wave / Difficulty ---
  _updateWave(elapsed, bossSpawnTimes) {
    let nextBoss = null;
    for (const t of bossSpawnTimes) {
      if (elapsed < t) { nextBoss = t; break; }
    }
    const diffLevel = Math.min(5, Math.floor(elapsed / 60) + 1);
    const stars = '\u2605'.repeat(diffLevel) + '\u2606'.repeat(5 - diffLevel);
    let html = `<span class="hud-diff">${stars}</span>`;
    if (nextBoss) {
      const untilBoss = nextBoss - elapsed;
      const bMin = Math.floor(untilBoss / 60);
      const bSec = Math.floor(untilBoss % 60);
      html += `<span class="hud-next-boss">BOSS ${bMin}:${String(bSec).padStart(2, '0')}</span>`;
    }
    this._waveEl.innerHTML = html;
  }

  // --- Stats ---
  // 毎フレーム呼ばれるが値はレベルアップ/バフ時にしか変わらない。
  // ダイジェスト文字列で前回値と比較し、変化があるときだけDOM更新。
  _updateStats(player) {
    const p = player.passives;
    const atk = fmtInt((1 + p.damageMultiplier) * 100);
    const def = fmt1(p.damageReduction);
    const spd = fmtInt((1 + p.moveSpeedMultiplier) * 100);
    const miniKey = `${atk}|${def}|${spd}`;
    if (miniKey !== this._lastStatsMiniKey) {
      this._statsMini.innerHTML =
        `<span class="stat-atk">\u2694 ATK ${atk}%</span>` +
        `<span class="stat-def">\uD83D\uDEE1 DEF ${def}</span>` +
        `<span class="stat-spd">\u26A1 SPD ${spd}%</span>`;
      this._lastStatsMiniKey = miniKey;
    }

    if (this._statsExpanded) {
      const crit = fmtPct1(p.critChance);
      const critDmg = fmtPct1(1 + p.critDamage);
      const dodge = fmtPct1(p.dodge);
      const regen = fmt1(p.regenPerSec);
      const range = fmtPct1(p.rangeMultiplier);
      const cd = fmtPct1(p.cooldownReduction);
      const drop = fmtPct1(p.dropRateBonus);
      const magnet = fmtPct1(p.magnetMultiplier);
      const detailKey = `${crit}|${critDmg}|${dodge}|${regen}|${range}|${cd}|${drop}|${magnet}`;
      if (detailKey !== this._lastStatsDetailKey) {
        this._statsDetail.innerHTML =
          `<div>CRIT: ${crit}% (x${fmt1(1 + p.critDamage)})</div>` +
          `<div>DODGE: ${dodge}%</div>` +
          `<div>REGEN: ${regen}/s</div>` +
          `<div>RANGE: +${range}%</div>` +
          `<div>CD: -${cd}%</div>` +
          `<div>DROP: +${drop}%</div>` +
          `<div>MAGNET: +${magnet}%</div>`;
        this._lastStatsDetailKey = detailKey;
      }
    }
  }

  // --- Boss ---
  _onBossSpawned({ name, maxHp }) {
    this._bossBar.classList.remove('hidden');
    this._bossName.textContent = name;
    this._bossHpFill.style.width = '100%';
  }
  _onBossHpChanged({ hp, maxHp }) {
    this._bossHpFill.style.width = Math.max(0, hp / maxHp * 100) + '%';
  }
  _onBossDefeated() {
    this._bossBar.classList.add('hidden');
    this._showAlert('\uD83C\uDFC6 \u30DC\u30B9\u3092\u64C3\u7834\u3057\u305F\uFF01');
  }

  // --- Alert ---
  _showAlert(message) {
    this._alert.textContent = message;
    this._alert.classList.remove('hidden');
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => this._alert.classList.add('hidden'), 3000);
  }

  // --- Consumables (with images) ---
  _updateConsumables(slots, buffs) {
    const el = this.el.querySelector('#hud-consumables');
    if (!el || !slots || slots.length === 0) return;

    el.innerHTML = slots.map((s, i) => {
      const empty = s.usesRemaining <= 0;
      const cdPct = s.cooldown > 0 ? (s.cooldown / s.cooldownMax * 100) : 0;
      const imgUrl = getItemImage(s.blueprintId);
      const fallbackIcon = CONSUMABLE_ICONS[s.effectType] || '\uD83E\uDDEA';

      const dots = [];
      for (let d = 0; d < s.usesMax; d++) {
        dots.push(d < s.usesRemaining ? '\u25CF' : '\u25CB');
      }

      const imgHtml = imgUrl
        ? `<img class="hud-cons-img" src="${imgUrl}" alt="${s.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';

      return `<div class="hud-cons-slot ${empty ? 'empty' : ''} ${cdPct > 0 ? 'on-cd' : ''}" title="${s.name}" data-slot="${i}" role="button" tabindex="-1">
        <span class="hud-cons-key">${i + 1}</span>
        <div class="hud-cons-img-wrap">
          ${imgHtml}
          <span class="hud-cons-fallback" ${imgUrl ? 'style="display:none"' : ''}>${fallbackIcon}</span>
          ${cdPct > 0 ? `<div class="hud-cons-cd-overlay" style="height:${cdPct}%"></div>` : ''}
        </div>
        <span class="hud-cons-dots">${dots.join('')}</span>
      </div>`;
    }).join('');

    if (buffs && buffs.length > 0) {
      const buffsHtml = buffs.map(b => {
        const icon = BUFF_STAT_ICONS[b.stat] || '\u2B06\uFE0F';
        return `<span class="hud-buff-active">${icon} ${fmt1(b.remaining)}s</span>`;
      }).join('');
      el.innerHTML += `<div class="hud-buff-bar">${buffsHtml}</div>`;
    }
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    if (this._skillBannerTimeout) clearTimeout(this._skillBannerTimeout);
    if (this._skillFlashTimeout) clearTimeout(this._skillFlashTimeout);
    this.el.remove();
  }
}
