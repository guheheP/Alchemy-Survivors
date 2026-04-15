/**
 * ラン結果の妥当性検証ロジック
 * サーバ信頼できない値を全て弾く（NaN / 負値 / 常識外の範囲）
 */

// ゲーム側の常識的上限（必要に応じて後で調整）
const LIMITS = {
  maxSurvivalSeconds: 30 * 60, // 30 分
  maxKillsPerSecond: 50,       // 秒間50キルが上限（範囲攻撃考慮）
  maxKillsAbsolute: 100000,
  maxDamagePerHit: 10_000_000,
  maxLevel: 200,
};

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampInt(v, min, max) {
  const n = Math.floor(v);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * @param {object} result - クライアントから送られた runResult
 * @returns {{ ok: boolean, reason?: string, sanitized?: object }}
 */
function validateRunResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'result is not an object' };
  }

  const survivalTime = Number(result.survivalTime);
  const killCount = Number(result.killCount);
  const highestDamage = Number(result.highestDamage || 0);
  const level = Number(result.level || 0);
  const hardMode = !!result.hardMode;
  const bossDefeated = !!result.bossDefeated;
  const reason = String(result.reason || '');

  if (!isFiniteNumber(survivalTime) || survivalTime < 0 || survivalTime > LIMITS.maxSurvivalSeconds) {
    return { ok: false, reason: `survivalTime out of range: ${survivalTime}` };
  }
  if (!isFiniteNumber(killCount) || killCount < 0 || killCount > LIMITS.maxKillsAbsolute) {
    return { ok: false, reason: `killCount out of range: ${killCount}` };
  }
  if (survivalTime > 0 && (killCount / survivalTime) > LIMITS.maxKillsPerSecond) {
    return { ok: false, reason: `kill rate too high: ${(killCount / survivalTime).toFixed(2)} kps` };
  }
  if (!isFiniteNumber(highestDamage) || highestDamage < 0 || highestDamage > LIMITS.maxDamagePerHit) {
    return { ok: false, reason: `highestDamage out of range: ${highestDamage}` };
  }
  if (!isFiniteNumber(level) || level < 0 || level > LIMITS.maxLevel) {
    return { ok: false, reason: `level out of range: ${level}` };
  }
  if (!['death', 'clear', 'retreat'].includes(reason)) {
    return { ok: false, reason: `unknown reason: ${reason}` };
  }

  return {
    ok: true,
    sanitized: {
      survivalTime: clampInt(survivalTime, 0, LIMITS.maxSurvivalSeconds),
      killCount: clampInt(killCount, 0, LIMITS.maxKillsAbsolute),
      highestDamage: clampInt(highestDamage, 0, LIMITS.maxDamagePerHit),
      level: clampInt(level, 0, LIMITS.maxLevel),
      hardMode,
      bossDefeated,
      reason,
    },
  };
}

module.exports = { validateRunResult, LIMITS };
