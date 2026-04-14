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
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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

      // スプライトがあれば優先
      const def = enemy.enemyDef;
      let sprite = null;
      if (spriteCache && def && def.preset) {
        sprite = spriteCache.getPreset(def.preset);
      }
      if (sprite) {
        // スプライトサイズ調整 — enemy.radius に基づいてスケール
        const baseSize = Math.max(sprite.width, sprite.height);
        const scale = (enemy.radius * 2.2) / baseSize;
        EntityRenderer.drawSprite(ctx, sprite, sx, sy, { scale, flash });
      } else {
        EntityRenderer.drawEntityFallback(ctx, sx, sy, enemy.radius, enemy.color, flash);
      }

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

        // テレグラフ表示（スキル予告円）
        if (boss.telegraphTimer > 0 && boss.telegraphPos) {
          const tx = boss.telegraphPos.x - camera.x;
          const ty = boss.telegraphPos.y - camera.y;
          const skill = boss.activeSkill;
          const telegraphRadius = skill?.type === 'aoe'
            ? 80 * (skill.damageMult || 1)
            : skill?.type === 'heavy' ? 50 : 30;
          ctx.save();
          ctx.globalAlpha = 0.3 + Math.sin(boss.telegraphTimer * 12) * 0.15;
          ctx.fillStyle = '#f44';
          ctx.beginPath();
          ctx.arc(tx, ty, telegraphRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#f88';
          ctx.lineWidth = 2;
          ctx.stroke();
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
      }
    }

    // === 7. プレイヤー ===
    const px = player.lerpX(alpha) - camera.x;
    const py = player.lerpY(alpha) - camera.y;
    const pr = player.radius;

    // 青いオーラ
    EntityRenderer.drawGlow(ctx, px, py, pr * 1.8, '#4af', 0.35);

    // 無敵点滅
    const invincible = player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 0;
    if (invincible) ctx.globalAlpha = 0.4;

    // 本体
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.facingAngle);
    // 円形の胴体
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.arc(0, 0, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 方向インジケータ（白い矢印）
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(pr + 4, 0);
    ctx.lineTo(pr - 3, -4);
    ctx.lineTo(pr - 3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1;

    // === 8. 武器エフェクト ===
    weaponSystem.render(ctx, camera, alpha);

    // === 9. 前景パーティクル（ヒット/爆散/収集きらめき） ===
    if (particles) particles.renderLayer(ctx, camera, 'foreground');

    // === 10. ダメージ数字 ===
    if (damageNumbers) damageNumbers.render(ctx, camera);

    // === 11. モバイルスティック ===
    if (player.mobileControls) player.mobileControls.render(ctx);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
