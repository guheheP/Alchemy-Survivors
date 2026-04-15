import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/Alchemy-Survivors/';

export default defineConfig({
  base: BASE,
  server: { port: 3001 },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // base に合わせて SW スコープを調整
      base: BASE,
      scope: BASE,
      includeAssets: [
        'icons/favicon.ico',
        'icons/apple-touch-icon-180.png',
      ],
      manifest: {
        id: BASE,
        name: 'Alchemy Survivors',
        short_name: 'Alchemy',
        description: '自分で鍛えた武器で戦場を制圧するサバイバルアクション + 錬金術クラフト',
        lang: 'ja',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d0d1a',
        theme_color: '#0d0d1a',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // index.html は Network First 相当にしたいので navigateFallback のみ有効化
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [
          // PlayFab / Azure Functions など外部 API は SW を通さない
          /^\/api\//,
          /playfab/i,
          /azurewebsites\.net/i,
        ],
        // アセットをプリキャッシュ (画像/音声/フォント/JS/CSS)
        globPatterns: [
          '**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff,woff2}',
        ],
        // 音声は大きいので上限を引き上げ
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          // アセット (BGM/SE/画像): Cache First
          {
            urlPattern: ({ url }) => /\.(mp3|ogg|wav|png|jpg|jpeg|webp|svg)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'alchemy-assets-v1',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // PlayFab / Azure Functions: 常にネットワーク、オフライン時は失敗 (既存コードが握りつぶす)
          {
            urlPattern: /^https:\/\/([a-z0-9-]+\.)?playfabapi\.com\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/([a-z0-9-]+\.)?azurewebsites\.net\//i,
            handler: 'NetworkOnly',
          },
        ],
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
