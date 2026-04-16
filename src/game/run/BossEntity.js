/**
 * BossEntity — ボスエンティティ（フェーズ遷移+スキル）
 */

import { Enemy } from './EnemyAI.js';
import { eventBus } from '../core/EventBus.js';

export class BossEntity extends Enemy {
  constructor() {
    super();
    this.isBoss = true;
    this.phases = [];
    this.skills = [];
    this.currentPhaseIndex = -1;
    this.skillCooldown = 0;
    this.skillCooldownMax = 3.0;
    this.activeSkill = null;
    this.skillTimer = 0;
    this.telegraphTimer = 0;
    this.telegraphPos = null;
    this.baseDamage = 0;
    this.baseSpeed = 0;
    this.defense = 0;
    this.bossName = '';
  }

  reset() {
    super.reset();
    this.isBoss = true;
    this.phases = [];
    this.skills = [];
    this.currentPhaseIndex = -1;
    this.skillCooldown = 0;
    this.activeSkill = null;
    this.skillTimer = 0;
    this.telegraphTimer = 0;
    this.telegraphPos = null;
    this.baseDamage = 0;
    this.baseSpeed = 0;
    this.defense = 0;
    this.bossName = '';
  }

  /** ボスデータから初期化 */
  initBoss(bossDef, x, y) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = bossDef.maxHp;
    this.maxHp = bossDef.maxHp;
    this.baseDamage = bossDef.atk;
    this.damage = bossDef.atk;
    this.defense = bossDef.def;
    this.baseSpeed = bossDef.spd * 0.8;
    this.speed = this.baseSpeed;
    this.expValue = 50;
    this.radius = 24;
    this.color = '#f80';
    this.enemyId = bossDef.id;
    this.bossName = bossDef.name;
    this.preset = bossDef.preset || null;
    this.phases = [...(bossDef.phases || [])];
    this.skills = [...(bossDef.skills || [])];
    this.currentPhaseIndex = -1;
    this.skillCooldown = 2.0; // initial delay before first skill
    this.skillCooldownMax = 3.5;

    eventBus.emit('boss:spawned', { name: bossDef.name, maxHp: bossDef.maxHp });
  }

  update(dt, playerX, playerY) {
    this.savePrev();

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;

    // 状態異常ティック
    this.updateStatusEffects(dt);

    // フェーズ遷移チェック
    this._checkPhaseTransition();

    // 感電スタン中は行動不能
    if (this.isStunned) return;

    // スキル実行中
    if (this.activeSkill) {
      this._executeSkill(dt, playerX, playerY);
      return;
    }

    // テレグラフ中
    if (this.telegraphTimer > 0) {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this._startSkillExecution(playerX, playerY);
      }
      return;
    }

    // 通常移動（プレイヤーに向かう）
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }

    // スキルクールダウン
    this.skillCooldown -= dt;
    if (this.skillCooldown <= 0) {
      this._prepareSkill(playerX, playerY);
    }
  }

  takeDamage(amount, isCrit = false) {
    // 脆弱（水属性）: 被ダメージを増幅してから防御計算
    amount = amount * this._incomingDamageMult();
    const effectiveDmg = Math.max(1, amount - this.defense * 0.3);
    this.hp -= effectiveDmg;
    this.hitFlashTimer = 0.1;
    eventBus.emit('boss:hpChanged', { hp: this.hp, maxHp: this.maxHp, name: this.bossName });
    // ボス被弾も enemy:damaged で通知（パーティクル/ダメージ数字/カメラシェイク連携）
    eventBus.emit('enemy:damaged', { x: this.x, y: this.y, damage: effectiveDmg, isCrit });
    return this.hp <= 0;
  }

  _checkPhaseTransition() {
    // HP 0 以下で死亡確定のフレームに相変化を起こさない（死亡直前の不要なバフ適用を防ぐ）
    if (this.hp <= 0) return;
    const hpRatio = this.hp / this.maxHp;
    for (let i = this.phases.length - 1; i >= 0; i--) {
      if (i <= this.currentPhaseIndex) continue;
      if (hpRatio <= this.phases[i].hpThreshold) {
        this.currentPhaseIndex = i;
        const phase = this.phases[i];
        // ステータスバフ適用
        if (phase.effect) {
          if (phase.effect.stat === 'atk') this.damage = this.baseDamage + phase.effect.amount;
          if (phase.effect.stat === 'spd') this.speed = this.baseSpeed + phase.effect.amount * 0.5;
          if (phase.effect.stat === 'def') this.defense += phase.effect.amount;
        }
        eventBus.emit('boss:phaseChange', { phase: phase.name, message: phase.message });
        break;
      }
    }
  }

  _prepareSkill(playerX, playerY) {
    // skills 未定義・空配列の防御（死神のように skills=[] のボスはスキル使用しない）
    if (!this.skills || this.skills.length === 0) {
      this.skillCooldown = 99999; // 実質無効化
      return;
    }
    // 重み付きランダムでスキル選択
    const totalChance = this.skills.reduce((sum, s) => sum + (s.chance || 0), 0);
    let skill = this.skills[0];
    if (totalChance > 0) {
      let roll = Math.random() * totalChance;
      for (const s of this.skills) {
        roll -= (s.chance || 0);
        if (roll <= 0) { skill = s; break; }
      }
    }
    if (!skill || !skill.type) {
      this.skillCooldown = this.skillCooldownMax;
      return;
    }

    this.telegraphPos = { x: playerX, y: playerY };

    // テレグラフ時間（スキルタイプ別）
    switch (skill.type) {
      case 'attack':
        this.telegraphTimer = 0.3;
        break;
      case 'aoe':
        this.telegraphTimer = 0.8;
        break;
      case 'heavy':
        this.telegraphTimer = 1.0;
        break;
      case 'heal':
        this.telegraphTimer = 0.5;
        break;
      default:
        this.telegraphTimer = 0.5;
    }

    this.activeSkill = skill;
    this.skillTimer = 0;

    eventBus.emit('boss:telegraph', {
      skill: skill,
      targetX: playerX,
      targetY: playerY,
      duration: this.telegraphTimer,
    });
  }

  _startSkillExecution(playerX, playerY) {
    // テレグラフ終了、実際のスキル発動
    this.skillTimer = 0.5; // スキル実行時間
  }

  _executeSkill(dt, playerX, playerY) {
    this.skillTimer -= dt;

    const skill = this.activeSkill;
    if (!skill) return;

    switch (skill.type) {
      case 'attack': {
        // 突進: プレイヤーに向かって高速移動
        const dx = this.telegraphPos.x - this.x;
        const dy = this.telegraphPos.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          const lungeSpeed = this.speed * 4;
          this.x += (dx / dist) * lungeSpeed * dt;
          this.y += (dy / dist) * lungeSpeed * dt;
        }
        break;
      }
      case 'heavy': {
        // 叩きつけ: テレグラフ位置に突進
        const dx = this.telegraphPos.x - this.x;
        const dy = this.telegraphPos.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          const lungeSpeed = this.speed * 3;
          this.x += (dx / dist) * lungeSpeed * dt;
          this.y += (dy / dist) * lungeSpeed * dt;
        }
        break;
      }
      case 'heal': {
        // HP回復
        const healAmount = this.maxHp * 0.05 * dt;
        this.hp = Math.min(this.maxHp, this.hp + healAmount);
        eventBus.emit('boss:hpChanged', { hp: this.hp, maxHp: this.maxHp, name: this.bossName });
        break;
      }
      // aoe: ボスは動かない（テレグラフ位置にダメージ判定はRunManagerで処理）
    }

    if (this.skillTimer <= 0) {
      this.activeSkill = null;
      this.skillCooldown = this.skillCooldownMax;
    }
  }

  /** スキルのダメージ範囲（RunManagerでの衝突判定用） */
  getSkillHitArea() {
    if (!this.activeSkill) return null;
    // attack(突進)は実行中ずっと当たり判定を有効にする（前は skillTimer>0.3 で切れて後半0.3秒が無効だった）
    // aoe / heavy はテレグラフ位置で着弾する攻撃なので短い着弾ウィンドウを維持（~0.3秒）
    const skill = this.activeSkill;
    switch (skill.type) {
      case 'attack':
        return { type: 'circle', x: this.x, y: this.y, radius: 30 };
      case 'aoe':
        if (this.skillTimer > 0.3) return null;
        return { type: 'circle', x: this.telegraphPos?.x || this.x, y: this.telegraphPos?.y || this.y, radius: 80 * (skill.damageMult || 1) };
      case 'heavy':
        if (this.skillTimer > 0.3) return null;
        return { type: 'circle', x: this.telegraphPos?.x || this.x, y: this.telegraphPos?.y || this.y, radius: 50 };
      default:
        return null;
    }
  }

  getSkillDamage() {
    if (!this.activeSkill) return 0;
    const mult = this.activeSkill.damageMult || 1.0;
    return this.damage * mult;
  }
}
