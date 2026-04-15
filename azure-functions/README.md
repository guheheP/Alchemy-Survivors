# Azure Functions — Alchemy Survivors サーバ検証

PlayFab の ExecuteFunction から呼び出されるサーバ側関数。クライアントが送るラン結果を検証し、
妥当であれば PlayFab Server API で統計を更新する。

## 関数一覧
- `healthCheck` (GET) — デプロイ確認用。`/api/healthCheck` で 200 を返す。
- `submitRunResult` (POST) — ラン結果の検証 + 統計更新。PlayFab 経由で呼ばれる。

## 環境変数
Function App の「構成 → アプリケーション設定」に登録:

| Key | Value |
|---|---|
| `PLAYFAB_TITLE_ID` | `1A020C` |
| `PLAYFAB_SECRET_KEY` | PlayFab Game Manager → Settings → Secret Keys の default キー |

ローカルでは `local.settings.json` に記入（`.gitignore` 対象）。

## セットアップ

```powershell
cd azure-functions
npm install
```

## ローカル実行

```powershell
func start
```

`http://localhost:7071/api/healthCheck` にアクセスして JSON が返れば OK。

## デプロイ

```powershell
# Azure CLI ログイン（未ログインの場合のみ）
az login

# デプロイ
func azure functionapp publish alchemy-survivors-funcs
```

デプロイ後のエンドポイント:
- `https://alchemy-survivors-funcs.azurewebsites.net/api/healthCheck`
- `https://alchemy-survivors-funcs.azurewebsites.net/api/submitRunResult` (function key 必須)

## PlayFab への登録

Game Manager → Automation → Cloud Script → Functions (Azure) → Register Function:
- Function Name: `submitRunResult`
- Trigger URL: `https://alchemy-survivors-funcs.azurewebsites.net/api/submitRunResult?code=<FUNCTION_KEY>`
- Function Key は Azure Portal の関数アプリ → submitRunResult 関数 → 関数キー から取得
