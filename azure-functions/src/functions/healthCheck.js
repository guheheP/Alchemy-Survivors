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
    return {
      status: 200,
      jsonBody: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        titleId: process.env.PLAYFAB_TITLE_ID || null,
        hasSecret: !!process.env.PLAYFAB_SECRET_KEY,
      },
    };
  },
});
