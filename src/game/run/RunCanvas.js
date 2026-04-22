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
import { StatusEffectRenderer } from './render/StatusEffectRenderer.js';

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
        if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) continue;
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
      let outlineSprite = null;
      if (spriteCache && def && def.preset) {
        sprite = spriteCache.getPreset(def.preset);
        outlineSprite = spriteCache.getPresetOutline(def.preset);
      }
      if (sprite) {
        const baseSize = Math.max(sprite.width, sprite.height);
        const scale = (enemy.radius * 2.2) / baseSize;
        EntityRenderer.drawSprite(ctx, sprite, sx, sy, { scale, flash, outlineSprite });
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
      StatusEffectRenderer.drawAura(ctx, sx, sy, enemy, enemy.radius, elapsed);

      // HPバー
      EntityRenderer.drawHpBar(ctx, sx, sy, enemy.radius, enemy.hp, enemy.maxHp);

      // 状態異常アイコン列 (HPバー直上、常時視認用)
      StatusEffectRenderer.drawIcons(ctx, sx, sy, enemy, enemy.radius);
    }

    // === 6. ボス ===
    if (bossSystem) {
      for (const boss of bossSystem.getActiveBosses()) {
        if (!boss.active) continue;
        const sx = boss.lerpX(alpha) - camera.x;
        const sy = boss.lerpY(alpha) - camera.y;
        if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) continue;

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
        let outlineSprite = null;
        if (spriteCache && boss.preset) {
          sprite = spriteCache.getPreset(boss.preset);
          outlineSprite = spriteCache.getPresetOutline(boss.preset);
        }
        if (sprite) {
          const baseSize = Math.max(sprite.width, sprite.height);
          const scale = (boss.radius * 2.4) / baseSize;
          EntityRenderer.drawSprite(ctx, sprite, sx, sy, { scale, flash, outlineSprite });
        } else {
          EntityRenderer.drawEntityFallback(ctx, sx, sy, boss.radius, boss.color, flash);
        }

        // ボス外枠（強調）
        ctx.strokeStyle = boss.enemyId === 'reaper' ? '#f44' : '#fa4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, boss.radius + 2, 0, Math.PI * 2);
        ctx.stroke();

        // ボスの状態異常エフェクト + アイコン列
        StatusEffectRenderer.drawAura(ctx, sx, sy, boss, boss.radius, elapsed);
        StatusEffectRenderer.drawIcons(ctx, sx, sy, boss, boss.radius);
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


  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
