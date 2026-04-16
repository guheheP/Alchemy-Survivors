/**
 * RunCanvas — Canvas 2D 描画パイプライン
 *
 * レイヤー順序:
 *   1. 背景（BackgroundRenderer: グラデ/タイル/グリッド）
 *   2. アンビエントパーティクル
 *   3. 影（全エンティティの足元）
 *   4. ドロップ（PNGアイコン or 菱形）
 *   5. 敵（スプライト or フォールバック）
 *   6. ボス（スプライト + オーラ）
 *   7. プレイヤー（グロー + スプライト/幾何）
 *   8. 武器エフェクト（weaponSystem.render）
 *   9. 前景パーティクル（被弾/爆散/きらめき）
 *  10. ダメージ数字
 *  11. モバイルスティック
 */

import { EntityRenderer } from './render/EntityRenderer.js';

export class RunCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    // 論理サイズ（CSSピクセル基準、描画コードはこの値で座標計算）
    this._logicalWidth = 0;
    this._logicalHeight = 0;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  /** 論理幅（CSSピクセル）— 描画ロジックはこれを参照する */
  get width() { return this._logicalWidth; }
  get height() { return this._logicalHeight; }

  _resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    this._logicalWidth = cssW;
    this._logicalHeight = cssH;

    // 物理ピクセル解像度（DPR倍）に設定し、CSSサイズは論理ピクセルで固定
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    // すべての描画をDPR倍スケールで処理 → 既存の座標ロジックは無変更で済む
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {number} alpha - 補間係数
   * @param {Camera} camera
   * @param {PlayerController} player
   * @param {Enemy[]} enemies
   * @param {Drop[]} drops
   * @param {WeaponSystem} weaponSystem
   * @param {BossSystem} bossSystem
   * @param {DamageNumberSystem} damageNumbers
   * @param {object} ctxExtras - { background, particles, spriteCache, itemBlueprints, elapsed }
   */
  render(alpha, camera, player, enemies, drops, weaponSystem, bossSystem, damageNumbers, ctxExtras = {}) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const background = ctxExtras.background;
    const particles = ctxExtras.particles;
    const spriteCache = ctxExtras.spriteCache;
    const itemBlueprints = ctxExtras.itemBlueprints;
    const elapsed = ctxExtras.elapsed || 0;
    const playerSpritePath = ctxExtras.playerSpritePath;
    const playerSpriteFrameW = ctxExtras.playerSpriteFrameW || 16;
    const playerSpriteFrameH = ctxExtras.playerSpriteFrameH || 17;

    // シェイク適用
    const shakeX = camera.shakeX || 0;
    const shakeY = camera.shakeY || 0;
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    // === 1. 背景 ===
    if (background) {
      background.render(ctx, camera);
    } else {
      ctx.fillStyle = '#2a4a1a';
      ctx.fillRect(0, 0, w, h);
    }

    // === 2. アンビエントパーティクル ===
    if (particles) particles.renderLayer(ctx, camera, 'ambient');

    // === 3. 影（全エンティティ） ===
    for (const drop of drops) {
      if (!drop.active) continue;
      const sx = drop.lerpX(alpha) - camera.x;
      const sy = drop.lerpY(alpha) - camera.y;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
      EntityRenderer.drawShadow(ctx, sx, sy, drop.radius, 0.25);
    }
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const sx = enemy.lerpX(alpha) - camera.x;
      const sy = enemy.lerpY(alpha) - camera.y;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
      EntityRenderer.drawShadow(ctx, sx, sy, enemy.radius);
    }
    if (bossSystem) {
      for (const boss of bossSystem.getActiveBosses()) {
        if (!boss.active) continue;
        const sx = boss.lerpX(alpha) - camera.x;
        const sy = boss.lerpY(alpha) - camera.y;
        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
        EntityRenderer.drawShadow(ctx, sx, sy, boss.radius, 0.45);
      }
    }
    {
      const sx = player.lerpX(alpha) - camera.x;
      const sy = player.lerpY(alpha) - camera.y;
      EntityRenderer.drawShadow(ctx, sx, sy, player.radius);
    }

    // === 4. ドロップ ===
    for (const drop of drops) {
      if (!drop.active) continue;
      const wx = drop.lerpX(alpha);
      const wy = drop.lerpY(alpha);
      const sx = wx - camera.x;
      const sy = wy - camera.y;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      // 浮遊アニメ
      const bob = Math.sin(elapsed * 3 + wx * 0.05) * 1.5;
      const dy = sy + bob;

      if (drop.dropType === 'exp') {
        // 経験値: 輝く菱形
        ctx.save();
        ctx.shadowColor = '#ffaa33';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffdd44';
        ctx.translate(sx, dy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else if (drop.dropType === 'material') {
        // 素材: アイテム画像
        let img = null;
        if (spriteCache && itemBlueprints) {
          const bp = itemBlueprints[drop.blueprintId];
          if (bp && bp.image) img = spriteCache.getImage(bp.image);
        }
        if (img) {
          const size = 18;
          // 特性ありは淡い輝き
          if (drop.traits && drop.traits.length > 0) {
            ctx.save();
            ctx.shadowColor = '#8ff';
            ctx.shadowBlur = 8;
            ctx.drawImage(img, sx - size / 2, dy - size / 2, size, size);
            ctx.restore();
          } else {
            ctx.drawImage(img, sx - size / 2, dy - size / 2, size, size);
          }
        } else {
          // フォールバック: 従来の円
          ctx.fillStyle = drop.color;
          ctx.beginPath();
          ctx.arc(sx, dy, drop.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = drop.color;
        ctx.beginPath();
        ctx.arc(sx, dy, drop.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // === 5. 敵 ===
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const sx = enemy.lerpX(alpha) - camera.x;
      const sy = enemy.lerpY(alpha) - camera.y;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

      const flash = enemy.hitFlashTimer > 0 ? enemy.hitFlashTimer / 0.1 : 0;
      // 会心命中時の黄色ハイライト（敵サイズより少し大きい発光）
      if (enemy.critFlashTimer > 0) {
        const critAlpha = Math.min(0.7, enemy.critFlashTimer / 0.18);
        EntityRenderer.drawGlow(ctx, sx, sy, enemy.radius * 2.2, '#ffdc6a', critAlpha);
      }

      // behavior別の背景オーラ
      if (enemy.armorHits > 0) {
        // armored: 青銀の装甲オーラ + 残り回数表示
        const pulse = 0.4 + Math.sin(elapsed * 6) * 0.15;
        EntityRenderer.drawGlow(ctx, sx, sy, enemy.radius * 1.6, '#8cf', pulse);
      } else if (enemy.behavior === 'tank') {
        EntityRenderer.drawGlow(ctx, sx, sy, enemy.radius * 1.5, '#fa6', 0.25);
      } else if (enemy.isTelegraphing) {
        // dasher 予備動作: 赤色の警告パルス
        const tpulse = 0.5 + Math.sin(elapsed * 24) * 0.4;
        EntityRenderer.drawGlow(ctx, sx, sy, enemy.radius * 2.0, '#f44', tpulse);
      } else if (enemy.isDashing) {
        // dashing: 残像ブラー
        EntityRenderer.drawGlow(ctx, sx, sy, enemy.radius * 1.8, '#fc8', 0.55);
      }

      // スプライトがあれば優先
      const def = enemy.enemyDef;
      let sprite = null;
      if (spriteCache && def && def.preset) {
        sprite = spriteCache.getPreset(def.preset);
      }
      if (sprite) {
        const baseSize = Math.max(sprite.width, sprite.height);
        const scale = (enemy.radius * 2.2) / baseSize;
        EntityRenderer.drawSprite(ctx, sprite, sx, sy, { scale, flash });
      } else {
        EntityRenderer.drawEntityFallback(ctx, sx, sy, enemy.radius, enemy.color, flash);
      }

      // armored: 回数チップ
      if (enemy.armorHits > 0) {
        ctx.save();
        ctx.fillStyle = '#8cf';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = sx + enemy.radius * 0.9;
        const ty = sy - enemy.radius * 0.9;
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(40,60,120,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#8cf';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(String(enemy.armorHits), tx, ty);
        ctx.restore();
      }

      // 状態異常の視覚エフェクト
      this._drawStatusEffects(ctx, sx, sy, enemy, enemy.radius, elapsed);

      // HPバー
      EntityRenderer.drawHpBar(ctx, sx, sy, enemy.radius, enemy.hp, enemy.maxHp);
    }

    // === 6. ボス ===
    if (bossSystem) {
      for (const boss of bossSystem.getActiveBosses()) {
        if (!boss.active) continue;
        const sx = boss.lerpX(alpha) - camera.x;
        const sy = boss.lerpY(alpha) - camera.y;
        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;

        // テレグラフ表示（スキル予告）— circle / line / radial_burst / wide_aoe に対応
        if (boss.telegraphTimer > 0 && boss.telegraphPos) {
          const tx = boss.telegraphPos.x - camera.x;
          const ty = boss.telegraphPos.y - camera.y;
          const skill = boss.activeSkill;
          ctx.save();
          ctx.globalAlpha = 0.3 + Math.sin(boss.telegraphTimer * 12) * 0.15;
          ctx.fillStyle = '#f44';
          ctx.strokeStyle = '#f88';
          ctx.lineWidth = 2;
          const skillType = skill?.type;
          if (skillType === 'line') {
            // 直線攻撃: 発動開始位置から telegraphAngle 方向に range×width
            const bx = boss.telegraphStartX - camera.x;
            const by = boss.telegraphStartY - camera.y;
            const range = skill.range || 320;
            const width = skill.width || 55;
            ctx.translate(bx, by);
            ctx.rotate(boss.telegraphAngle);
            ctx.fillRect(0, -width / 2, range, width);
            ctx.strokeRect(0, -width / 2, range, width);
          } else if (skillType === 'radial_burst') {
            // 放射多段: 発動位置から全方向の矩形
            const bx = boss.telegraphStartX - camera.x;
            const by = boss.telegraphStartY - camera.y;
            const rayCount = skill.rayCount || 6;
            const rayRange = skill.rayRange || 260;
            const rayWidth = skill.rayWidth || 48;
            ctx.translate(bx, by);
            for (let i = 0; i < rayCount; i++) {
              ctx.save();
              ctx.rotate(boss.telegraphAngle + (Math.PI * 2 / rayCount) * i);
              ctx.fillRect(0, -rayWidth / 2, rayRange, rayWidth);
              ctx.strokeRect(0, -rayWidth / 2, rayRange, rayWidth);
              ctx.restore();
            }
          } else {
            // 円形系: aoe / heavy / wide_aoe / その他
            const telegraphRadius = skillType === 'wide_aoe'
              ? (skill.radius || 170)
              : skillType === 'aoe'
                ? 80 * (skill.damageMult || 1)
                : skillType === 'heavy' ? 50 : 30;
            ctx.beginPath();
            ctx.arc(tx, ty, telegraphRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }

        // 死神オーラ（赤）
        if (boss.enemyId === 'reaper') {
          const pulse = 0.4 + Math.sin(elapsed * 5) * 0.15;
          EntityRenderer.drawGlow(ctx, sx, sy, boss.radius * 2.2, '#c22', pulse);
        } else {
          // 通常ボスはオレンジのオーラ
          EntityRenderer.drawGlow(ctx, sx, sy, boss.radius * 1.8, '#f80', 0.35);
        }

        const flash = boss.hitFlashTimer > 0 ? boss.hitFlashTimer / 0.1 : 0;
        // スプライト or フォールバック
        let sprite = null;
        if (spriteCache && boss.preset) sprite = spriteCache.getPreset(boss.preset);
        if (sprite) {
          const baseSize = Math.max(sprite.width, sprite.height);
          const scale = (boss.radius * 2.4) / baseSize;
          EntityRenderer.drawSprite(ctx, sprite, sx, sy, { scale, flash });
        } else {
          EntityRenderer.drawEntityFallback(ctx, sx, sy, boss.radius, boss.color, flash);
        }

        // ボス外枠（強調）
        ctx.strokeStyle = boss.enemyId === 'reaper' ? '#f44' : '#fa4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, boss.radius + 2, 0, Math.PI * 2);
        ctx.stroke();

        // ボスの状態異常エフェクト
        this._drawStatusEffects(ctx, sx, sy, boss, boss.radius, elapsed);
      }
    }

    // === 7. プレイヤー ===
    const px = player.lerpX(alpha) - camera.x;
    const py = player.lerpY(alpha) - camera.y;
    const pr = player.radius;

    // 無敵点滅
    const invincible = player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 0;
    if (invincible) ctx.globalAlpha = 0.4;

    // 本体 — キャラクタースプライトシート（4向き×3歩行フレーム）
    const playerFlash = player.hitFlashTimer > 0 ? player.hitFlashTimer / 0.1 : 0;
    const playerSheet = spriteCache && playerSpritePath ? spriteCache.getImage(playerSpritePath) : null;
    if (playerSheet) {
      // facingAngle (atan2(dy,dx)) → 向きインデックス（列）
      // 列: 0=下, 1=右, 2=上, 3=左
      const deg = (player.facingAngle * 180 / Math.PI + 360) % 360;
      let dirCol;
      if (deg >= 45 && deg < 135) dirCol = 0;        // 下
      else if (deg >= 135 && deg < 225) dirCol = 3;  // 左
      else if (deg >= 225 && deg < 315) dirCol = 2;  // 上
      else dirCol = 1;                                // 右

      // 歩行フレーム（行）: 0=待機, 1=左足, 2=右足、パターン 0,1,0,2
      const moving = Math.abs(player.x - player.prevX) + Math.abs(player.y - player.prevY) > 0.1;
      let frameRow = 0;
      if (moving) {
        const t = Math.floor(elapsed * 8) % 4;
        frameRow = t === 0 ? 0 : t === 1 ? 1 : t === 2 ? 0 : 2;
      }

      const sx0 = dirCol * playerSpriteFrameW;
      const sy0 = frameRow * playerSpriteFrameH;
      const scale = (pr * 2.6) / Math.max(playerSpriteFrameW, playerSpriteFrameH);
      const dw = playerSpriteFrameW * scale;
      const dh = playerSpriteFrameH * scale;
      const dx = px - dw / 2;
      const dy = py - dh / 2 - pr * 0.15;

      ctx.save();
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false; // ドット絵をシャープに
      ctx.drawImage(playerSheet, sx0, sy0, playerSpriteFrameW, playerSpriteFrameH, dx, dy, dw, dh);
      // 被弾フラッシュ
      if (playerFlash > 0) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = Math.min(1, playerFlash);
        ctx.fillStyle = '#fff';
        ctx.fillRect(dx, dy, dw, dh);
      }
      ctx.imageSmoothingEnabled = prevSmoothing;
      ctx.restore();
    }

    ctx.globalAlpha = 1;

    // === 8. 武器エフェクト ===
    weaponSystem.render(ctx, camera, alpha);

    // === 9. 前景パーティクル（ヒット/爆散/収集きらめき） ===
    if (particles) particles.renderLayer(ctx, camera, 'foreground');

    // === 10. ダメージ数字 ===
    if (damageNumbers) damageNumbers.render(ctx, camera);

    // シェイク復元（モバイルスティックはシェイクの影響を受けない）
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.restore();
    }

    // === 11. モバイルスティック ===
    if (player.mobileControls) player.mobileControls.render(ctx);
  }

  /**
   * 敵・ボスの状態異常エフェクトを派手に描画
   * entity: EnemyAI または BossEntity のインスタンス (_burnTimer等を持つ)
   */
  _drawStatusEffects(ctx, sx, sy, entity, radius, elapsed) {
    // 燃焼: 炎のゆらめき + 赤オレンジのグロー
    if (entity._burnTimer > 0) {
      const t = elapsed;
      ctx.save();
      // 外周のパルスグロー（加算合成）— shadowBlurなしで加算合成のみで光らせる
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(sx, sy, radius * 0.4, sx, sy, radius * 1.8);
      grad.addColorStop(0, 'rgba(255,160,60,0.55)');
      grad.addColorStop(0.5, 'rgba(255,90,20,0.35)');
      grad.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      // 炎の舌 (3本に削減。見た目ほぼ同じ)
      for (let i = 0; i < 3; i++) {
        const phase = t * 4 + i * 1.8;
        const ox = Math.sin(phase) * radius * 0.5;
        const flicker = 0.7 + Math.sin(t * 12 + i) * 0.3;
        const flameH = radius * (0.8 + flicker * 0.6);
        const flameW = radius * 0.35;
        const baseY = sy - radius * 0.3;
        const tipY = baseY - flameH;
        const cx = sx + ox;
        // 外側炎（オレンジ）
        ctx.fillStyle = `rgba(255,120,30,${0.45 * flicker})`;
        ctx.beginPath();
        ctx.moveTo(cx - flameW * 0.5, baseY);
        ctx.quadraticCurveTo(cx - flameW, baseY - flameH * 0.5, cx, tipY);
        ctx.quadraticCurveTo(cx + flameW, baseY - flameH * 0.5, cx + flameW * 0.5, baseY);
        ctx.closePath();
        ctx.fill();
        // 内側炎（黄色）
        ctx.fillStyle = `rgba(255,230,120,${0.55 * flicker})`;
        ctx.beginPath();
        ctx.moveTo(cx - flameW * 0.25, baseY);
        ctx.quadraticCurveTo(cx - flameW * 0.5, baseY - flameH * 0.4, cx, tipY + flameH * 0.15);
        ctx.quadraticCurveTo(cx + flameW * 0.5, baseY - flameH * 0.4, cx + flameW * 0.25, baseY);
        ctx.closePath();
        ctx.fill();
      }
      // 舞い上がる火の粉 (2個に削減)
      for (let i = 0; i < 2; i++) {
        const phase = (t * 2 + i * 0.7) % 1;
        const a = (i * 3.14 + t * 0.5) % (Math.PI * 2);
        const dist = radius * 0.6;
        const fpx = sx + Math.cos(a) * dist;
        const fpy = sy - radius * 0.2 - phase * radius * 1.5;
        ctx.fillStyle = `rgba(255,200,80,${(1 - phase) * 0.9})`;
        ctx.beginPath();
        ctx.arc(fpx, fpy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 毒: 緑のもや + 上昇する泡
    if (entity._poisonTimer > 0) {
      const t = elapsed;
      ctx.save();
      // 毒のもや
      const grad = ctx.createRadialGradient(sx, sy, radius * 0.3, sx, sy, radius * 1.6);
      grad.addColorStop(0, 'rgba(120,220,80,0.35)');
      grad.addColorStop(0.6, 'rgba(70,170,50,0.22)');
      grad.addColorStop(1, 'rgba(40,100,30,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();
      // 上昇する泡 (3個に削減)
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.2 + i * 0.33) % 1;
        const ox = Math.sin(t * 2 + i * 1.7) * radius * 0.5;
        const by = sy + radius * 0.4 - phase * radius * 1.8;
        const bx = sx + ox;
        const br = 2.5 + Math.sin(phase * Math.PI) * 2.5;
        const alpha = Math.sin(phase * Math.PI) * 0.85;
        // 泡の本体
        ctx.fillStyle = `rgba(100,220,80,${alpha})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        // 泡のハイライト
        ctx.fillStyle = `rgba(200,255,160,${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      // 脈動する毒々しいリング
      const ringPulse = 0.5 + Math.sin(t * 5) * 0.25;
      ctx.globalAlpha = ringPulse;
      ctx.strokeStyle = '#5c2';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -t * 12;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 凍結: 氷の結晶 + 冷気
    if (entity._freezeTimer > 0) {
      const t = elapsed;
      ctx.save();
      // 冷気のグロー（加算合成）
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(sx, sy, radius * 0.3, sx, sy, radius * 1.6);
      grad.addColorStop(0, 'rgba(180,240,255,0.5)');
      grad.addColorStop(0.6, 'rgba(100,200,255,0.3)');
      grad.addColorStop(1, 'rgba(60,120,200,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();
      // 回転する氷の結晶 (2つに削減、shadowBlur削除=加算合成で代替)
      const rot = t * 0.6;
      ctx.strokeStyle = 'rgba(200,240,255,0.95)';
      ctx.fillStyle = 'rgba(140,220,255,0.6)';
      ctx.lineWidth = 2;  // 線を太めにしてshadowBlurなしの明度を補う
      for (let i = 0; i < 2; i++) {
        const a = rot + Math.PI * i;
        const cx = sx + Math.cos(a) * radius * 1.1;
        const cy = sy + Math.sin(a) * radius * 1.1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a * 2);
        // 雪結晶: 3本のラインで六角形風
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const ka = (Math.PI / 3) * k;
          ctx.moveTo(-Math.cos(ka) * 5, -Math.sin(ka) * 5);
          ctx.lineTo(Math.cos(ka) * 5, Math.sin(ka) * 5);
        }
        ctx.stroke();
        // 中心の小さな菱形
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(3, 0);
        ctx.lineTo(0, 3);
        ctx.lineTo(-3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // 下方にぶら下がる氷柱風ライン (2本に削減、shadowBlur削除)
      ctx.strokeStyle = 'rgba(180,240,255,0.85)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const a = Math.PI * 0.4 + i * 0.5;
        const x1 = sx + Math.cos(a) * radius * 0.7;
        const y1 = sy + Math.sin(a) * radius * 0.7;
        const x2 = sx + Math.cos(a) * (radius + 5);
        const y2 = sy + Math.sin(a) * (radius + 5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 感電: 雷のジグザグ + 火花
    if (entity._shockTimer > 0) {
      const t = elapsed;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 黄白の放射グロー（強めの脈動）
      const pulse = 0.6 + Math.sin(t * 40) * 0.4;
      const grad = ctx.createRadialGradient(sx, sy, radius * 0.2, sx, sy, radius * 1.7);
      grad.addColorStop(0, `rgba(255,255,200,${0.6 * pulse})`);
      grad.addColorStop(0.5, `rgba(255,230,80,${0.35 * pulse})`);
      grad.addColorStop(1, 'rgba(200,180,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      // ジグザグ稲妻 (2本に削減、shadowBlur削除=太線で代替)
      ctx.strokeStyle = '#ffffaa';
      ctx.lineWidth = 3;
      for (let b = 0; b < 2; b++) {
        const startA = (t * 8 + b * Math.PI) % (Math.PI * 2);
        const endA = startA + Math.PI + (Math.random() - 0.5) * 0.8;
        const startR = radius * 0.4;
        const endR = radius * 1.4;
        const x1 = sx + Math.cos(startA) * startR;
        const y1 = sy + Math.sin(startA) * startR;
        const x2 = sx + Math.cos(endA) * endR;
        const y2 = sy + Math.sin(endA) * endR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let s = 1; s < 5; s++) {
          const sp = s / 5;
          const jx = x1 + (x2 - x1) * sp + (Math.random() - 0.5) * 10;
          const jy = y1 + (y2 - y1) * sp + (Math.random() - 0.5) * 10;
          ctx.lineTo(jx, jy);
        }
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // 火花 (3個に削減)
      ctx.fillStyle = '#ffffcc';
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * (0.6 + Math.random() * 0.8);
        const px = sx + Math.cos(a) * r;
        const py = sy + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
