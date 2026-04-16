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
    this.telegraphAngle = 0;         // 発動方向 (line/radial_burst用)
    this.telegraphStartX = 0;         // 発動開始時のボス座標 (line/radial_burst用)
    this.telegraphStartY = 0;
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
    this.telegraphAngle = 0;
    this.telegraphStartX = 0;
    this.telegraphStartY = 0;
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

    // テレグラフ中を先にチェック（_prepareSkill が activeSkill もセットするため、
    // 実行フェーズより先にテレグラフを進める必要がある）
    if (this.telegraphTimer > 0) {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this._startSkillExecution(playerX, playerY);
      }
      return;
    }

    // スキル実行中（テレグラフが終わり skillTimer が立った後）
    if (this.activeSkill) {
      this._executeSkill(dt, playerX, playerY);
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
    // 発動方向と開始位置を凍結（line/radial_burst 用に必要）
    const dxAim = playerX - this.x;
    const dyAim = playerY - this.y;
    this.telegraphAngle = Math.atan2(dyAim, dxAim);
    this.telegraphStartX = this.x;
    this.telegraphStartY = this.y;

    // テレグラフ時間（スキルタイプ別）— ダッシュ(0.15s)+反応時間を考慮した猶予
    switch (skill.type) {
      case 'attack':
        this.telegraphTimer = 0.55;
        break;
      case 'aoe':
        this.telegraphTimer = 1.0;
        break;
      case 'heavy':
        this.telegraphTimer = 1.2;
        break;
      case 'line':       // 直線攻撃: 槍型、長射程
        this.telegraphTimer = 1.0;
        break;
      case 'wide_aoe':   // 広範囲攻撃
        this.telegraphTimer = 1.5;
        break;
      case 'radial_burst': // 放射多段攻撃
        this.telegraphTimer = 1.2;
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
    // 発動エフェクト: スキルタイプ別に「今発動した！」を視覚化
    this._emitSkillFireFx();
  }

  /** スキル発動時のFXをイベントバス経由で発行する */
  _emitSkillFireFx() {
    const skill = this.activeSkill;
    if (!skill) return;
    const tx = this.telegraphPos?.x ?? this.x;
    const ty = this.telegraphPos?.y ?? this.y;
    const sx = this.telegraphStartX ?? this.x;
    const sy = this.telegraphStartY ?? this.y;

    switch (skill.type) {
      case 'attack': {
        // 突進開始: ボス位置から前方に短い爆煙 + 小シェイク
        eventBus.emit('particles:burst', { x: this.x, y: this.y, count: 10, config: { speed: 140, life: 0.35, size: 3, color: '#fa6', shape: 'square', gravity: 20 } });
        eventBus.emit('camera:shake', { power: 4, duration: 0.15 });
        break;
      }
      case 'heavy': {
        // 重叩きつけ: 着弾点に強い衝撃波 + 破片 + 大シェイク
        eventBus.emit('fx:shockwave', { x: tx, y: ty, color: '#faa', maxRadius: 110, duration: 0.45 });
        eventBus.emit('particles:burst', { x: tx, y: ty, count: 20, config: { speed: 200, life: 0.5, size: 4, color: '#f84', shape: 'square', gravity: 80 } });
        eventBus.emit('camera:shake', { power: 8, duration: 0.3 });
        break;
      }
      case 'aoe': {
        // 円形爆発: 中リング + パーティクル + フラッシュ
        eventBus.emit('fx:shockwave', { x: tx, y: ty, color: '#f66', maxRadius: 140, duration: 0.5 });
        eventBus.emit('particles:burst', { x: tx, y: ty, count: 18, config: { speed: 150, life: 0.45, size: 3, color: '#f66', shape: 'circle' } });
        eventBus.emit('ui:flash', { duration: 0.1, color: 'rgba(255,80,80,0.22)' });
        eventBus.emit('camera:shake', { power: 5, duration: 0.2 });
        break;
      }
      case 'line': {
        // 直線攻撃: 発動位置〜着弾方向に沿ってパーティクル点列 + 鋭いシェイク
        const range = skill.range || 320;
        const cos = Math.cos(this.telegraphAngle);
        const sin = Math.sin(this.telegraphAngle);
        const segments = 6;
        for (let i = 1; i <= segments; i++) {
          const px = sx + cos * (range * i / segments);
          const py = sy + sin * (range * i / segments);
          eventBus.emit('particles:burst', { x: px, y: py, count: 6, config: { speed: 120, life: 0.35, size: 3, color: '#fa6', shape: 'spark' } });
        }
        eventBus.emit('fx:shockwave', { x: sx, y: sy, color: '#fa6', maxRadius: 60, duration: 0.35 });
        eventBus.emit('camera:shake', { power: 6, duration: 0.25 });
        break;
      }
      case 'wide_aoe': {
        // 広範囲: 巨大衝撃波 + 強フラッシュ + 大量パーティクル + 大シェイク
        const radius = skill.radius || 170;
        eventBus.emit('fx:shockwave', { x: tx, y: ty, color: '#f44', maxRadius: radius * 1.2, duration: 0.7 });
        eventBus.emit('fx:shockwave', { x: tx, y: ty, color: '#fff', maxRadius: radius * 0.6, duration: 0.45 });
        eventBus.emit('particles:burst', { x: tx, y: ty, count: 30, config: { speed: 240, life: 0.6, size: 4, color: '#f66', shape: 'square', gravity: 60 } });
        eventBus.emit('ui:flash', { duration: 0.15, color: 'rgba(255,60,60,0.35)' });
        eventBus.emit('camera:shake', { power: 10, duration: 0.4 });
        break;
      }
      case 'radial_burst': {
        // 放射多段: 各レイ方向にパーティクル列
        const rayCount = skill.rayCount || 6;
        const rayRange = skill.rayRange || 260;
        for (let i = 0; i < rayCount; i++) {
          const ang = this.telegraphAngle + (Math.PI * 2 / rayCount) * i;
          const c = Math.cos(ang), s = Math.sin(ang);
          for (let k = 1; k <= 4; k++) {
            eventBus.emit('particles:burst', {
              x: sx + c * (rayRange * k / 4),
              y: sy + s * (rayRange * k / 4),
              count: 4,
              config: { speed: 120, life: 0.35, size: 3, color: '#fc6', shape: 'spark' },
            });
          }
        }
        eventBus.emit('fx:shockwave', { x: sx, y: sy, color: '#fc6', maxRadius: 90, duration: 0.45 });
        eventBus.emit('camera:shake', { power: 7, duration: 0.3 });
        break;
      }
      case 'heal': {
        // 回復: 緑のキラキラ
        eventBus.emit('particles:burst', { x: this.x, y: this.y, count: 16, config: { speed: 80, life: 0.9, size: 3, color: '#6f8', shape: 'spark', gravity: -40 } });
        break;
      }
    }
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

  /** スキルのダメージ範囲（RunManagerでの衝突判定用）。単一 shape or 配列を返す */
  getSkillHitArea() {
    if (!this.activeSkill) return null;
    const skill = this.activeSkill;
    switch (skill.type) {
      case 'attack':
        // 突進中ずっと当たり判定有効
        return { type: 'circle', x: this.x, y: this.y, radius: 30 };
      case 'aoe':
        if (this.skillTimer > 0.3) return null;
        return { type: 'circle', x: this.telegraphPos?.x || this.x, y: this.telegraphPos?.y || this.y, radius: 80 * (skill.damageMult || 1) };
      case 'heavy':
        if (this.skillTimer > 0.3) return null;
        return { type: 'circle', x: this.telegraphPos?.x || this.x, y: this.telegraphPos?.y || this.y, radius: 50 };
      case 'line': {
        // 直線攻撃: 発動開始位置からtelegraphAngle方向に range×width の矩形
        if (this.skillTimer > 0.3) return null;
        const range = skill.range || 320;
        const width = skill.width || 55;
        return { type: 'rect', x: this.telegraphStartX, y: this.telegraphStartY, angle: this.telegraphAngle, range, width };
      }
      case 'wide_aoe': {
        // 広範囲攻撃: 着弾位置に大きめの円
        if (this.skillTimer > 0.4) return null;
        return { type: 'circle', x: this.telegraphPos?.x || this.x, y: this.telegraphPos?.y || this.y, radius: skill.radius || 170 };
      }
      case 'radial_burst': {
        // 放射多段: 発動開始位置から全方向に複数の矩形
        if (this.skillTimer > 0.3) return null;
        const rayCount = skill.rayCount || 6;
        const rayRange = skill.rayRange || 260;
        const rayWidth = skill.rayWidth || 48;
        const shapes = [];
        for (let i = 0; i < rayCount; i++) {
          const a = this.telegraphAngle + (Math.PI * 2 / rayCount) * i;
          shapes.push({ type: 'rect', x: this.telegraphStartX, y: this.telegraphStartY, angle: a, range: rayRange, width: rayWidth });
        }
        return shapes;
      }
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
