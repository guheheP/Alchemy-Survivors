/**
 * PlayFab Server API 薄いラッパー
 * Secret Key を使ってサーバ権限で API を呼ぶ
 */

const PLAYFAB_TITLE_ID = process.env.PLAYFAB_TITLE_ID;
const PLAYFAB_SECRET_KEY = process.env.PLAYFAB_SECRET_KEY;

function assertEnv() {
  if (!PLAYFAB_TITLE_ID) throw new Error('PLAYFAB_TITLE_ID env var missing');
  if (!PLAYFAB_SECRET_KEY) throw new Error('PLAYFAB_SECRET_KEY env var missing');
}

async function serverPost(path, body) {
  assertEnv();
  const url = `https://${PLAYFAB_TITLE_ID}.playfabapi.com${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SecretKey': PLAYFAB_SECRET_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`PlayFab invalid JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok || json.code !== 200) {
    throw new Error(`PlayFab ${path} failed: ${json.errorMessage || response.status}`);
  }
  return json.data;
}

/**
 * @param {string} playFabId
 * @param {Array<{ StatisticName: string, Value: number }>} statistics
 */
async function updatePlayerStatistics(playFabId, statistics) {
  return serverPost('/Server/UpdatePlayerStatistics', {
    PlayFabId: playFabId,
    Statistics: statistics,
  });
}

module.exports = {
  updatePlayerStatistics,
};
