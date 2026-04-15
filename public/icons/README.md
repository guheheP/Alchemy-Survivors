# PWA Icons

以下のファイルをこのディレクトリに配置してください。

| ファイル名 | サイズ | 用途 | 備考 |
|---|---|---|---|
| `icon-192.png` | 192×192 | Android ホーム画面 / favicon | 必須 |
| `icon-512.png` | 512×512 | Android 大サイズ / インストール時プレビュー | 必須 |
| `icon-maskable-512.png` | 512×512 | Android maskable (丸/角丸トリミング対応) | 必須。**中央 80% (直径 409px) 内にロゴを収める** こと。外周は単色背景で埋める |
| `apple-touch-icon-180.png` | 180×180 | iOS ホーム画面 | 必須 (角丸は OS が自動適用するので**角丸なしの正方形**を入れる) |
| `favicon.ico` | 16/32/48 | ブラウザタブ | 必須 (ICO 形式) |

## 生成ツール (参考)
- <https://maskable.app/editor> — maskable チェック + エクスポート
- <https://realfavicongenerator.net/> — 一括生成 (apple-touch-icon / favicon.ico も)
- `pwa-asset-generator` (npm) — CLI で一括

## 配置後
```
npm run build
npm run preview
```
で Chrome DevTools > Application > Manifest にエラーがないことを確認してください。
