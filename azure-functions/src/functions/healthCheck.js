const { app } = require('@azure/functions');

/**
 * ヘルスチェック: デプロイ確認用。
 * GET https://<funcapp>.azurewebsites.net/api/healthCheck で 200 OK が返れば成功。
 */
app.http('healthCheck', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('healthCheck invoked');
    // 外部公開エンドポイントなので、設定存在の有無など偵察材料になる情報は返さない
    return {
      status: 200,
      jsonBody: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  },
});
