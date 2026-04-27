/**
 * EntityRenderer — エンティティ描画の共通ヘルパー
 *
 * - 影（楕円の黒半透明）
 * - グロー（radialGradient）
 * - スプライト描画（被弾フラッシュ対応）
 * - フォールバック幾何描画（目付き円）
 */

// グロー画像キャッシュ — 敵ごとに createRadialGradient を呼ぶとGCが激しくなるので、
// (radius, color) をキーにオフスクリーンcanvasへ焼き込み、drawImage で描画する。
const _glowCache = new Map();
const _GLOW_MAX_ENTRIES = 64;

function _getGlowSprite(radius, color) {
  // radius は 2px 単位でキャッシュ（外れ値を減らす）
  const rKey = Math.max(2, Math.round(radius / 2) * 2);
  const key = `${rKey}|${color}`;
  let sprite = _glowCache.get(key);
  if (sprite) return sprite;

  // キャッシュ上限：超えたら最古を退去（簡易 LRU: Map 挿入順に依存）
  if (_glowCache.size >= _GLOW_MAX_ENTRIES) {
    const firstKey = _glowCache.keys().next().value;
    _glowCache.delete(firstKey);
  }

  const size = rKey * 2;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const gctx = cv.getContext('2d');
  const g = gctx.createRadialGradient(rKey, rKey, 0, rKey, rKey, rKey);
  g.addColorStop(0, color);
  g.addColorStop(0.4, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  gctx.fillStyle = g;
  gctx.beginPath();
  gctx.arc(rKey, rKey, rKey, 0, Math.PI * 2);
  gctx.fill();
  _glowCache.set(key, cv);
  return cv;
}

export const EntityRenderer = {
  /** エンティティ足元に落ちる楕円影 */
  drawShadow(ctx, x, y, radius, alpha = 0.35) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.7, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** グロー描画 — キャッシュ済みスプライトを drawImage（毎フレーム gradient 生成しない） */
  drawGlow(ctx, x, y, radius, color = '#4af', alpha = 0.6) {
    const sprite = _getGlowSprite(radius, color);
    const half = sprite.width / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - half, y - half);
    ctx.restore();
  },

  /**
   * スプライト（オフスクリーン Canvas or Image）を中心に描画
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} sprite
   * @param {number} x - 中心X
   * @param {number} y - 中心Y
   * @param {object} opts - { scale, facing, flash, flipX, rotate, outlineSprite }
   */
  drawSprite(ctx, sprite, x, y, opts = {}) {
    if (!sprite) return;
    const scale = opts.scale || 1;
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    const flash = opts.flash || 0;
    const outline = opts.outlineSprite;

    ctx.save();
    ctx.translate(x, y);
    if (opts.flipX) ctx.scale(-1, 1);
    if (opts.rotate) ctx.rotate(opts.rotate);

    if (outline) {
      // アウトライン済みキャンバスは白ハロー+元スプライト合成済み（SpriteCache 生成）
      const ow = outline.width * scale;
      const oh = outline.height * scale;
      ctx.drawImage(outline, -ow / 2, -oh / 2, ow, oh);
    } else {
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    }

    // 被弾フラッシュ（白オーバーレイ）— スプライト本体の矩形のみ塗る
    if (flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.min(1, flash);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  },

  /** スプライトがない場合の改良された幾何描画（目付きの柔らかい円） */
  drawEntityFallback(ctx, x, y, radius, color, flash = 0) {
    ctx.save();
    // 本体（円）
    if (flash > 0) {
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = color;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 柔らかい白リング — スプライト版のブルームと揃える
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 目（2つの白点 + 黒瞳）
    if (flash <= 0) {
      const eyeY = y - radius * 0.2;
      const eyeX = radius * 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - eyeX, eyeY, radius * 0.18, 0, Math.PI * 2);
      ctx.arc(x + eyeX, eyeY, radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
      ctx.arc(x + eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /**
   * ペット描画 — 簡易キャラ + 浮遊アニメ + 攻撃クールダウンリング
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number,radius:number,def:object,facing:number,_actionTimer:number,params:object,level:number}} pet
   * @param {number} elapsed - ラン経過時間（ボブアニメーション用）
   */
  drawPet(ctx, pet, elapsed = 0) {
    if (!pet || !pet.def) return;
    const x = pet.x;
    const y = pet.y;
    const radius = pet.radius || 8;
    const color = pet.def.spriteColor || '#fff';
    const icon = pet.def.icon || '🐾';

    // 影
    EntityRenderer.drawShadow(ctx, x, y, radius, 0.3);

    // 浮遊（軽くY座標を上下）
    const bob = Math.sin(elapsed * 4 + (pet.petId?.length || 0)) * 2;

    // 弱グロー
    EntityRenderer.drawGlow(ctx, x, y + bob, radius * 1.6, color, 0.35);

    // 本体（円 + 絵文字アイコン）
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + bob, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 絵文字（簡易アバター）
    ctx.font = `${Math.round(radius * 1.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, x, y + bob);
    ctx.restore();

    // クールダウンリング（攻撃系のみ表示）
    const cooldown = pet.params?.cooldown;
    if (cooldown && pet._actionTimer > 0) {
      const ratio = 1 - Math.min(1, pet._actionTimer / cooldown);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y + bob, radius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
      ctx.restore();
    }

    // Lv バッジ（小さい数字）
    if (pet.level && pet.level > 1) {
      ctx.save();
      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(`Lv${pet.level}`, x, y + bob - radius - 6);
      ctx.fillText(`Lv${pet.level}`, x, y + bob - radius - 6);
      ctx.restore();
    }
  },

  /** HPバー描画（エンティティの頭上） */
  drawHpBar(ctx, x, y, radius, hp, maxHp) {
    if (hp >= maxHp) return;
    const barW = radius * 2;
    const barH = 3;
    const barY = y - radius - 8;
    ctx.fillStyle = '#300';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    ctx.fillStyle = '#f44';
    ctx.fillRect(x - barW / 2, barY, barW * (hp / maxHp), barH);
  },
};
