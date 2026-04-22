/**
 * SpriteCache — 画像・ボクセルスプライトの統一キャッシュ
 *
 * - `loadImage(path)`: PNG/JPEG を HTMLImageElement として読み込みキャッシュ
 * - `loadPreset(path)`: voxel JSON を取得し VoxelRenderer で Canvas 化してキャッシュ
 * - `getImage(path)`: 取得済みなら同期的に返す、未取得なら null
 *
 * 使い方:
 *   const cache = new SpriteCache();
 *   await cache.preloadPresets(['/presets/RPG_Characters/Slime.json', ...]);
 *   await cache.preloadImages(['/art/items/wood.png', ...]);
 *   const sprite = cache.getPreset('/presets/RPG_Characters/Slime.json');
 */

import { assetPath } from '../../core/assetPath.js';
import { renderVoxelPresetToCanvas } from './VoxelRenderer.js';

// ブルームの最大スプレッド分の余白
const OUTLINE_PAD = 5;

/**
 * スプライト用のブルーム付きキャンバスを生成。
 * 構成（奥→手前）:
 *   1. ソフトブルーム（白 40%, blur 2.5px, 8方向2.5px広がり） — 背景と馴染むアトモスフェリックな発光
 *   2. 元スプライト
 */
function buildOutlineCanvas(sprite) {
  if (!sprite || !sprite.width || !sprite.height) return null;
  const w = sprite.width + OUTLINE_PAD * 2;
  const h = sprite.height + OUTLINE_PAD * 2;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d');

  // --- Layer 1: ソフトブルーム ---
  cx.save();
  cx.filter = 'blur(2.5px)';
  const bloomRadius = 2.5;
  for (let a = 0; a < 8; a++) {
    const ang = (Math.PI * 2 / 8) * a;
    cx.drawImage(
      sprite,
      OUTLINE_PAD + Math.cos(ang) * bloomRadius,
      OUTLINE_PAD + Math.sin(ang) * bloomRadius
    );
  }
  cx.restore();
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = 'rgba(255,255,255,0.2)';
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';

  // --- Top: 元スプライト ---
  cx.drawImage(sprite, OUTLINE_PAD, OUTLINE_PAD);

  return cv;
}

export class SpriteCache {
  constructor() {
    this.images = new Map();      // path -> HTMLImageElement
    this.presets = new Map();     // path -> HTMLCanvasElement
    this.presetOutlines = new Map(); // path -> HTMLCanvasElement (白アウトライン付き)
    this._loadingImages = new Map();  // path -> Promise
    this._loadingPresets = new Map(); // path -> Promise
  }

  /** 画像を非同期で読み込み */
  loadImage(path) {
    if (this.images.has(path)) return Promise.resolve(this.images.get(path));
    if (this._loadingImages.has(path)) return this._loadingImages.get(path);

    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(path, img);
        this._loadingImages.delete(path);
        resolve(img);
      };
      img.onerror = () => {
        // エラー時も null として記録（再試行しない）
        this.images.set(path, null);
        this._loadingImages.delete(path);
        resolve(null);
      };
      img.src = assetPath(path);
    });
    this._loadingImages.set(path, p);
    return p;
  }

  /** voxel preset を取得してスプライト化 */
  loadPreset(path, opts = {}) {
    if (this.presets.has(path)) return Promise.resolve(this.presets.get(path));
    if (this._loadingPresets.has(path)) return this._loadingPresets.get(path);

    const p = fetch(assetPath(path))
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
        return res.json();
      })
      .then(json => {
        const canvas = renderVoxelPresetToCanvas(json, opts);
        this.presets.set(path, canvas);
        this.presetOutlines.set(path, buildOutlineCanvas(canvas));
        this._loadingPresets.delete(path);
        return canvas;
      })
      .catch(err => {
        console.warn('[SpriteCache] preset load failed:', path, err);
        this.presets.set(path, null);
        this._loadingPresets.delete(path);
        return null;
      });
    this._loadingPresets.set(path, p);
    return p;
  }

  /** 複数画像を並列ロード */
  async preloadImages(paths) {
    await Promise.all(paths.map(p => this.loadImage(p)));
  }

  /** 複数 preset を並列ロード */
  async preloadPresets(paths, opts = {}) {
    await Promise.all(paths.map(p => this.loadPreset(p, opts)));
  }

  /** 同期取得（取得済みの場合のみ有効） */
  getImage(path) {
    return this.images.get(path) || null;
  }

  getPreset(path) {
    return this.presets.get(path) || null;
  }

  getPresetOutline(path) {
    return this.presetOutlines.get(path) || null;
  }

  clear() {
    this.images.clear();
    this.presets.clear();
    this.presetOutlines.clear();
  }
}
