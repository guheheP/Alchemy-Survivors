/**
 * RunHUD — ラン中HUD（HP/タイマー/レベル/キル数/経験値バー）
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
        <div class="hud-timer" id="hud-timer">5:00</div>
      </div>
      <div class="hud-top-right">
        <div class="hud-kills" id="hud-kills">0 kills</div>
      </div>
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

    this._unsubs = [
      eventBus.on('run:tick', (data) => this._onTick(data)),
      eventBus.on('player:expChanged', (data) => this._onExpChanged(data)),
    ];
  }

  _onTick({ remaining, killCount, hp, maxHp }) {
    // HP
    const hpPct = Math.max(0, hp / maxHp * 100);
    this._hpFill.style.width = hpPct + '%';
    this._hpFill.style.backgroundColor = hpPct > 50 ? '#4c4' : hpPct > 25 ? '#cc4' : '#c44';
    this._hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;

    // タイマー
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    this._timer.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    // キル数
    this._kills.textContent = `${killCount} kills`;
  }

  _onExpChanged({ exp, expToNext, level }) {
    this._level.textContent = `Lv.${level}`;
    this._expFill.style.width = (exp / expToNext * 100) + '%';
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this.el.remove();
  }
}
