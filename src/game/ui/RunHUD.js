/**
 * RunHUD — ラン中HUD（HP/タイマー/レベル/キル数/経験値バー/ボスHP）
 */

import { eventBus } from '../core/EventBus.js';

export class RunHUD {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.id = 'run-hud';
    this.el.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-hp-bar">
          <div class="hud-hp-fill" id="hud-hp-fill"></div>
          <span class="hud-hp-text" id="hud-hp-text">100 / 100</span>
        </div>
        <div class="hud-level" id="hud-level">Lv.1</div>
      </div>
      <div class="hud-top-center">
        <div class="hud-timer" id="hud-timer">20:00</div>
      </div>
      <div class="hud-top-right">
        <div class="hud-kills" id="hud-kills">0 kills</div>
      </div>
      <div class="hud-boss-bar hidden" id="hud-boss-bar">
        <div class="hud-boss-name" id="hud-boss-name"></div>
        <div class="hud-boss-hp">
          <div class="hud-boss-hp-fill" id="hud-boss-hp-fill"></div>
        </div>
      </div>
      <div class="hud-alert hidden" id="hud-alert"></div>
      <div class="hud-consumables" id="hud-consumables"></div>
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

    this._unsubs = [
      eventBus.on('run:tick', (data) => this._onTick(data)),
      eventBus.on('player:expChanged', (data) => this._onExpChanged(data)),
      eventBus.on('boss:spawned', (data) => this._onBossSpawned(data)),
      eventBus.on('boss:hpChanged', (data) => this._onBossHpChanged(data)),
      eventBus.on('boss:phaseChange', (data) => this._showAlert(data.message)),
      eventBus.on('boss:defeated', () => this._onBossDefeated()),
      eventBus.on('boss:intro', (data) => this._showAlert(`⚠️ ${data.icon} ${data.name} 出現！`)),
      eventBus.on('area:unlocked', (data) => this._showAlert(`🎉 ${data.name} が解放された！`)),
      eventBus.on('weapon:unlocked', (data) => this._showAlert(`🗡️ ${data.name} が使用可能に！`)),
      eventBus.on('consumable:slotsChanged', ({ slots }) => this._updateConsumables(slots)),
    ];
  }

  _onTick({ remaining, killCount, hp, maxHp }) {
    const hpPct = Math.max(0, hp / maxHp * 100);
    this._hpFill.style.width = hpPct + '%';
    this._hpFill.style.backgroundColor = hpPct > 50 ? '#4c4' : hpPct > 25 ? '#cc4' : '#c44';
    this._hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;

    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    this._timer.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    this._kills.textContent = `${killCount} kills`;
  }

  _onExpChanged({ exp, expToNext, level }) {
    this._level.textContent = `Lv.${level}`;
    this._expFill.style.width = (exp / expToNext * 100) + '%';
  }

  _onBossSpawned({ name, maxHp }) {
    this._bossBar.classList.remove('hidden');
    this._bossName.textContent = name;
    this._bossHpFill.style.width = '100%';
  }

  _onBossHpChanged({ hp, maxHp, name }) {
    const pct = Math.max(0, hp / maxHp * 100);
    this._bossHpFill.style.width = pct + '%';
  }

  _onBossDefeated() {
    this._bossBar.classList.add('hidden');
    this._showAlert('🏆 ボスを撃破した！');
  }

  _showAlert(message) {
    this._alert.textContent = message;
    this._alert.classList.remove('hidden');
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      this._alert.classList.add('hidden');
    }, 3000);
  }

  _updateConsumables(slots) {
    const el = this.el.querySelector('#hud-consumables');
    if (!el || !slots || slots.length === 0) return;
    el.innerHTML = slots.map((s, i) => {
      const cdPct = s.cooldown > 0 ? (s.cooldown / s.cooldownMax * 100) : 0;
      const empty = s.usesRemaining <= 0;
      return `<div class="hud-cons-slot ${empty ? 'empty' : ''}">
        <span class="hud-cons-key">${i + 1}</span>
        <span class="hud-cons-name">${s.name}</span>
        <span class="hud-cons-uses">${s.usesRemaining}</span>
        ${cdPct > 0 ? `<div class="hud-cons-cd" style="width:${cdPct}%"></div>` : ''}
      </div>`;
    }).join('');
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this.el.remove();
  }
}
