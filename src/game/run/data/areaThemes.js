/**
 * AreaThemes — 各エリアの視覚テーマ定義
 *
 * フィールド:
 *  - baseColor: フォールバック単色
 *  - gradient: [topColor, bottomColor] 縦方向グラデーション
 *  - tileColor: グリッド線の色
 *  - tileAccent: タイル内アクセント色（小さなドット）
 *  - ambient: 環境パーティクル設定
 *     - type: 'leaf' | 'dust' | 'ember' | 'bubble' | 'snow' | 'star' | 'ash' | 'cloud'
 *     - color: パーティクル色
 *     - count: 目標数（カメラ範囲内）
 *     - size: 粒の大きさ
 *     - speedX/speedY: 平均速度
 *     - wave: 水平ゆらぎ量
 *     - life: 寿命（秒）
 */

export const AreaThemes = {
  plains: {
    baseColor: '#4a7a2a',
    gradient: ['#5a8a3a', '#3a6a2a'],
    tileColor: 'rgba(255,255,255,0.04)',
    tileAccent: 'rgba(255,255,150,0.06)',
    ambient: {
      type: 'leaf', color: '#c8f080', count: 25, size: 2.5,
      speedX: 15, speedY: 12, wave: 20, waveFreq: 1.2, life: 12,
      rotateSpeed: 1.5, shape: 'square',
    },
  },
  cave: {
    baseColor: '#202030',
    gradient: ['#2a2a40', '#0a0a18'],
    tileColor: 'rgba(180,160,100,0.05)',
    tileAccent: 'rgba(100,150,255,0.04)',
    ambient: {
      type: 'dust', color: '#ccccaa', count: 35, size: 1.5,
      speedX: 8, speedY: -6, wave: 10, waveFreq: 0.8, life: 8,
      shape: 'circle',
    },
  },
  forest: {
    baseColor: '#2a5a2a',
    gradient: ['#355a3a', '#1a3a20'],
    tileColor: 'rgba(180,240,180,0.04)',
    tileAccent: 'rgba(255,200,100,0.08)',
    ambient: {
      type: 'leaf', color: '#ffcc66', count: 35, size: 3,
      speedX: 10, speedY: 18, wave: 30, waveFreq: 1.0, life: 14,
      rotateSpeed: 2.0, shape: 'square',
    },
  },
  volcano: {
    baseColor: '#4a1a0a',
    gradient: ['#5a2510', '#2a0808'],
    tileColor: 'rgba(255,100,50,0.06)',
    tileAccent: 'rgba(255,180,80,0.1)',
    ambient: {
      type: 'ember', color: '#ff8844', count: 45, size: 2,
      speedX: 0, speedY: -50, wave: 15, waveFreq: 2.0, life: 3,
      shape: 'spark',
    },
  },
  deep_sea: {
    baseColor: '#0a2040',
    gradient: ['#103860', '#051020'],
    tileColor: 'rgba(100,200,255,0.05)',
    tileAccent: 'rgba(180,240,255,0.06)',
    ambient: {
      type: 'bubble', color: '#a8d8ff', count: 30, size: 3,
      speedX: 0, speedY: -30, wave: 8, waveFreq: 1.5, life: 8,
      shape: 'circle',
    },
  },
  dragon_nest: {
    baseColor: '#3a1010',
    gradient: ['#4a1a1a', '#1a0a0a'],
    tileColor: 'rgba(200,100,80,0.05)',
    tileAccent: 'rgba(255,80,40,0.08)',
    ambient: {
      type: 'ash', color: '#d66448', count: 40, size: 1.8,
      speedX: 5, speedY: -20, wave: 25, waveFreq: 1.8, life: 5,
      shape: 'spark',
    },
  },
  sky_tower: {
    baseColor: '#7080a0',
    gradient: ['#90a0c0', '#5060a0'],
    tileColor: 'rgba(255,255,255,0.08)',
    tileAccent: 'rgba(255,255,180,0.1)',
    ambient: {
      type: 'cloud', color: '#ffffff', count: 15, size: 6,
      speedX: 30, speedY: 0, wave: 5, waveFreq: 0.3, life: 20,
      shape: 'circle',
    },
  },
  time_corridor: {
    baseColor: '#1a0a2a',
    gradient: ['#2a1540', '#080412'],
    tileColor: 'rgba(200,150,255,0.06)',
    tileAccent: 'rgba(255,220,255,0.12)',
    ambient: {
      type: 'star', color: '#e0d0ff', count: 50, size: 1.5,
      speedX: 5, speedY: 8, wave: 10, waveFreq: 0.5, life: 15,
      rotateSpeed: 0.8, shape: 'triangle',
    },
  },
};

/** デフォルトテーマ（未定義エリア用フォールバック） */
export const DefaultTheme = AreaThemes.plains;
