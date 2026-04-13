/**
 * EnemyAI — 敵の追尾ロジック
 */

import { Entity } from './Entity.js';
import { eventBus } from '../core/EventBus.js';

export class Enemy extends Entity {
  constructor() {
    super();
    this.type = 'enemy';
    this.hp = 0;
    this.maxHp = 0;
    this.speed = 0;
    this.damage = 0;
    this.expValue = 0;
    this.color = '#f00';
    this.enemyId = '';
    this.hitFlashTimer = 0;
  }

  reset() {
    super.reset();
    this.hp = 0;
    this.maxHp = 0;
    this.speed = 0;
    this.damage = 0;
    this.expValue = 0;
    this.color = '#f00';
    this.enemyId = '';
    this.hitFlashTimer = 0;
  }

  /** 敵データから初期化 */
  init(def, x, y) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.speed = def.speed;
    this.damage = def.damage;
    this.expValue = def.expValue;
    this.radius = def.radius;
    this.color = def.color;
    this.enemyId = def.id;
  }

  /** プレイヤーに向かって移動 */
  update(dt, playerX, playerY) {
    this.savePrev();

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
  }

  takeDamage(amount, isCrit = false) {
    this.hp -= amount;
    this.hitFlashTimer = 0.1;
    eventBus.emit('enemy:damaged', { x: this.x, y: this.y, damage: amount, isCrit });
    return this.hp <= 0;
  }
}
