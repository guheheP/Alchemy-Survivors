/**
 * RunHUD — ラン中HUD（全UI要素統合・画像対応版）
 */

import { eventBus } from '../core/EventBus.js';
import { ItemBlueprints } from '../data/items.js';
import { assetPath } from '../core/assetPath.js';

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
      <!-- Top Left: HP + Level + Passives -->
      <div class="hud-top-left">
        <div class="hud-hp-bar">
          <div class="hud-hp-fill" id="hud-hp-fill"></div>
          <span class="hud-hp-text" id="hud-hp-text">100 / 100</span>
        </div>
        <div class="hud-level" id="hud-level">Lv.1</div>
        <div class="hud-passives" id="hud-passives"></div>
      </div>

      <!-- Top Center: Timer + Wave -->
      <div class="hud-top-center">
        <div class="hud-timer" id="hud-timer">20:00</div>
        <div class="hud-wave" id="hud-wave"></div>
      </div>

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

      <!-- Bottom Left: Weapon Slots -->
      <div class="hud-weapons" id="hud-weapons"></div>

      <!-- Bottom Center: Consumable Slots -->
      <div class="hud-consumables" id="hud-consumables"></div>

      <!-- Bottom Right: Mini Stats -->
      <div class="hud-stats" id="hud-stats">
        <div class="hud-stats-mini" id="hud-stats-mini"></div>
        <div class="hud-stats-detail hidden" id="hud-stats-detail"></div>
      </div>

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

    this._passiveList = [];
    this._statsExpanded = false;

    this._onKeyDown = (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this._statsExpanded = !this._statsExpanded;
        this._statsDetail.classList.toggle('hidden', !this._statsExpanded);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

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
    ];
  }

  _onTick({ remaining, killCount, hp, maxHp, goldEarned, materialCount, weaponSlots, player, bossSpawnTimes, elapsed }) {
    const hpPct = Math.max(0, hp / maxHp * 100);
    this._hpFill.style.width = hpPct + '%';
    this._hpFill.style.backgroundColor = hpPct > 50 ? '#4c4' : hpPct > 25 ? '#cc4' : '#c44';
    this._hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;

    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    this._timer.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    this._kills.textContent = `${killCount} kills`;

    this._resourcesEl.innerHTML =
      `<span class="hud-gold">\uD83D\uDCB0 ${goldEarned || 0}</span>` +
      `<span class="hud-mats">\uD83D\uDCE6 ${materialCount || 0}</span>`;

    if (weaponSlots) this._updateWeapons(weaponSlots);
    if (elapsed !== undefined && bossSpawnTimes) this._updateWave(elapsed, bossSpawnTimes);
    if (player) this._updateStats(player);
  }

  _onExpChanged({ exp, expToNext, level }) {
    this._level.textContent = `Lv.${level}`;
    this._expFill.style.width = (exp / expToNext * 100) + '%';
  }

  // --- Weapon Slots (with images) ---
  _updateWeapons(slots) {
    this._weaponsEl.innerHTML = slots.map((s, i) => {
      if (!s.unlocked) {
        return `<div class="hud-weapon-slot locked">
          <div class="hud-wpn-img-wrap"><span class="hud-wpn-lock">\uD83D\uDD12</span></div>
        </div>`;
      }
      const imgUrl = getItemImage(s.blueprintId);
      const skillPct = Math.max(0, (1 - (s.skillCooldownPct || 0)) * 100);
      const skillReady = s.skillReady;
      const imgHtml = imgUrl
        ? `<img class="hud-wpn-img" src="${imgUrl}" alt="${s.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const fallbackIcon = WEAPON_ICONS[s.equipType] || '\u2694\uFE0F';
      return `<div class="hud-weapon-slot ${skillReady ? 'skill-ready' : ''}">
        <div class="hud-wpn-img-wrap">
          ${imgHtml}
          <span class="hud-wpn-fallback" ${imgUrl ? 'style="display:none"' : ''}>${fallbackIcon}</span>
        </div>
        <div class="hud-wpn-skill-bar">
          <div class="hud-wpn-skill-fill ${skillReady ? 'ready' : ''}" style="width:${skillPct}%"></div>
        </div>
        <span class="hud-wpn-name">${s.name}</span>
      </div>`;
    }).join('');
  }

  // --- Passive Badges ---
  _onPassiveSelected(data) {
    if (data.isWeaponUnlock) return;
    this._passiveList.push(data.passiveId);
    this._renderPassives();
  }

  _renderPassives() {
    const counts = {};
    for (const id of this._passiveList) counts[id] = (counts[id] || 0) + 1;
    const icons = {
      damage_up: '\u2694\uFE0F', range_up: '\uD83D\uDD35', hp_up: '\u2764\uFE0F',
      speed_up: '\uD83D\uDCA8', magnet_up: '\uD83E\uDDF2', cooldown_down: '\u23F1\uFE0F',
      regen: '\uD83D\uDC9A', extra_drop: '\uD83C\uDF81', extra_projectile: '\uD83D\uDD31',
      crit_chance: '\uD83D\uDCA5',
    };
    this._passivesEl.innerHTML = Object.keys(counts).map(id => {
      const icon = icons[id] || '\u2B50';
      const count = counts[id];
      return `<span class="hud-passive-badge" title="${id} x${count}">${icon}${count > 1 ? count : ''}</span>`;
    }).join('');
  }

  // --- Wave / Difficulty ---
  _updateWave(elapsed, bossSpawnTimes) {
    let nextBoss = null;
    for (const t of bossSpawnTimes) {
      if (elapsed < t) { nextBoss = t; break; }
    }
    const diffLevel = Math.min(5, Math.floor(elapsed / 120) + 1);
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
  _updateStats(player) {
    const p = player.passives;
    const atk = Math.floor((1 + p.damageMultiplier) * 100);
    const def = p.damageReduction.toFixed(1);
    const spd = Math.floor((1 + p.moveSpeedMultiplier) * 100);

    this._statsMini.innerHTML =
      `<span class="stat-atk">\u2694 ATK ${atk}%</span>` +
      `<span class="stat-def">\uD83D\uDEE1 DEF ${def}</span>` +
      `<span class="stat-spd">\u26A1 SPD ${spd}%</span>`;

    if (this._statsExpanded) {
      this._statsDetail.innerHTML =
        `<div>CRIT: ${(p.critChance * 100).toFixed(0)}%</div>` +
        `<div>DODGE: ${(p.dodge * 100).toFixed(0)}%</div>` +
        `<div>REGEN: ${p.regenPerSec.toFixed(1)}/s</div>` +
        `<div>RANGE: +${(p.rangeMultiplier * 100).toFixed(0)}%</div>` +
        `<div>CD: -${(p.cooldownReduction * 100).toFixed(0)}%</div>` +
        `<div>DROP: +${(p.dropRateBonus * 100).toFixed(0)}%</div>` +
        `<div>MAGNET: +${(p.magnetMultiplier * 100).toFixed(0)}%</div>`;
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

      return `<div class="hud-cons-slot ${empty ? 'empty' : ''} ${cdPct > 0 ? 'on-cd' : ''}">
        <span class="hud-cons-key">${i + 1}</span>
        <div class="hud-cons-img-wrap">
          ${imgHtml}
          <span class="hud-cons-fallback" ${imgUrl ? 'style="display:none"' : ''}>${fallbackIcon}</span>
          ${cdPct > 0 ? `<div class="hud-cons-cd-overlay" style="height:${cdPct}%"></div>` : ''}
        </div>
        <div class="hud-cons-info">
          <span class="hud-cons-name">${s.name}</span>
          <span class="hud-cons-dots">${dots.join('')}</span>
        </div>
      </div>`;
    }).join('');

    if (buffs && buffs.length > 0) {
      const buffsHtml = buffs.map(b => {
        const icon = BUFF_STAT_ICONS[b.stat] || '\u2B06\uFE0F';
        return `<span class="hud-buff-active">${icon} ${b.remaining.toFixed(1)}s</span>`;
      }).join('');
      el.innerHTML += `<div class="hud-buff-bar">${buffsHtml}</div>`;
    }
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this.el.remove();
  }
}
