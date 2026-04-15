const { app } = require('@azure/functions');
const { validateRunResult } = require('../lib/validation');
const { updatePlayerStatistics } = require('../lib/playfabServer');

/**
 * PlayFab ExecuteFunction からの呼び出しで起動。
 * リクエストボディ（PlayFab が送ってくる形式）:
 * {
 *   "TitleAuthenticationContext": { "Id": "TitleId", "EntityToken": "..." },
 *   "CallerEntityProfile": { "Lineage": { "MasterPlayerAccountId": "...", ... }, "Entity": { "Id": "...", "Type": "..." } },
 *   "FunctionArgument": { ...ゲームから送った runResult... },
 *   "PlayFabId": "...",
 *   "TitleId": "..."
 * }
 */
app.http('submitRunResult', {
  methods: ['POST'],
  authLevel: 'function', // function key 必須（後で PlayFab に登録する際に使用）
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      context.error('Invalid JSON body');
      return { status: 400, jsonBody: { error: 'Invalid JSON' } };
    }

    const runResult = body?.FunctionArgument;
    const playFabId = body?.CallerEntityProfile?.Lineage?.MasterPlayerAccountId
      || body?.PlayFabId
      || null;

    if (!playFabId) {
      context.error('PlayFabId not found in request');
      return { status: 400, jsonBody: { error: 'PlayFabId missing' } };
    }

    // TitleId 照合（なりすまし防止の基本チェック）
    const expectedTitleId = process.env.PLAYFAB_TITLE_ID;
    const incomingTitleId = body?.TitleAuthenticationContext?.Id || body?.TitleId;
    if (expectedTitleId && incomingTitleId && incomingTitleId !== expectedTitleId) {
      context.warn(`TitleId mismatch: expected ${expectedTitleId}, got ${incomingTitleId}`);
      return { status: 403, jsonBody: { error: 'Title mismatch' } };
    }

    // 妥当性検証
    const verdict = validateRunResult(runResult);
    if (!verdict.ok) {
      context.warn(`Run result rejected for ${playFabId}: ${verdict.reason}`);
      return {
        status: 200,
        jsonBody: { accepted: false, reason: verdict.reason },
      };
    }
    const sanitized = verdict.sanitized;

    // リーダーボード用の統計を更新
    const statistics = [
      { StatisticName: 'best_survival_time', Value: sanitized.survivalTime },
      { StatisticName: 'total_kills', Value: sanitized.killCount },
      { StatisticName: 'highest_damage', Value: sanitized.highestDamage },
    ];

    try {
      await updatePlayerStatistics(playFabId, statistics);
      context.log(`Statistics updated for ${playFabId}: ${JSON.stringify(sanitized)}`);
    } catch (e) {
      // 実装詳細（PlayFab 内部エラー・環境変数名など）はクライアントに返さずログのみに残す
      context.error(`PlayFab update failed: ${e.message}`);
      return {
        status: 200,
        jsonBody: { accepted: false, reason: 'server_error' },
      };
    }

    return {
      status: 200,
      jsonBody: { accepted: true, sanitized },
    };
  },
});
