const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const EARLY_ACCESS_LIMIT = Number.parseInt(
  process.env.DICTX_PRO_EARLY_ACCESS_LIMIT || "100",
  10,
);
const RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.PRO_EARLY_ACCESS_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);
const RATE_LIMIT_MAX = Number.parseInt(
  process.env.PRO_EARLY_ACCESS_RATE_LIMIT_MAX || "30",
  10,
);

const INSTALL_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const MAX_APP_VERSION_LENGTH = 32;
const requestBuckets = new Map();

const CLAIMS_SET_KEY = "dictx:pro:early_access:installs";
const CLAIMS_RANK_KEY = "dictx:pro:early_access:ranks";

const CLAIM_SCRIPT = `
local set_key = KEYS[1]
local rank_key = KEYS[2]
local install_id = ARGV[1]
local limit = tonumber(ARGV[2])
local now = ARGV[3]

if redis.call("SISMEMBER", set_key, install_id) == 1 then
  local rank = redis.call("ZSCORE", rank_key, install_id)
  return {1, tostring(rank or "0")}
end

local count = redis.call("SCARD", set_key)
if count >= limit then
  return {0, tostring(count)}
end

redis.call("SADD", set_key, install_id)
local claimed = redis.call("SCARD", set_key)
redis.call("ZADD", rank_key, claimed, install_id)
redis.call("HSET", "dictx:pro:early_access:meta:" .. install_id, "claimed_at", now)
return {1, tostring(claimed)}
`;

const getHeader = (req, name) => {
  if (!req || !req.headers) return "";
  if (typeof req.headers.get === "function") {
    return req.headers.get(name) || "";
  }
  const lower = name.toLowerCase();
  return req.headers[lower] || req.headers[name] || "";
};

const readBody = async (req) => {
  if (!req) return {};

  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch (_error) {
        return {};
      }
    }

    if (typeof req.body === "object" && req.body !== null) {
      return req.body;
    }
  }

  if (typeof req.json === "function") {
    try {
      return await req.json();
    } catch (_error) {
      return {};
    }
  }

  return {};
};

const getClientId = (req) => {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (Array.isArray(forwarded)) {
    return forwarded[0] || "unknown";
  }
  if (forwarded.length > 0) {
    const [first] = forwarded.split(",");
    return first.trim() || "unknown";
  }
  return req?.socket?.remoteAddress || "unknown";
};

const isRateLimited = (clientId) => {
  const now = Date.now();
  if (requestBuckets.size > 5000) {
    for (const [key, bucket] of requestBuckets.entries()) {
      if (now > bucket.resetAt) {
        requestBuckets.delete(key);
      }
    }
  }

  const existing = requestBuckets.get(clientId);
  if (!existing || now > existing.resetAt) {
    requestBuckets.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  requestBuckets.set(clientId, existing);
  return existing.count > RATE_LIMIT_MAX;
};

const sendJson = (res, statusCode, payload) => {
  if (res && typeof res.status === "function") {
    if (typeof res.setHeader === "function") {
      res.setHeader("cache-control", "no-store");
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
    }
    res.status(statusCode).json(payload);
    return null;
  }

  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};

const callRedisEval = async (installId) => {
  const response = await fetch(`${UPSTASH_REDIS_REST_URL}/eval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      script: CLAIM_SCRIPT,
      keys: [CLAIMS_SET_KEY, CLAIMS_RANK_KEY],
      args: [installId, String(EARLY_ACCESS_LIMIT), new Date().toISOString()],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`redis_eval_failed:${response.status}:${detail}`);
  }

  const body = await response.json();
  const result = Array.isArray(body?.result) ? body.result : [];
  const isActive = Number.parseInt(String(result[0] ?? "0"), 10) === 1;
  const rank = Number.parseInt(String(result[1] ?? "0"), 10);
  return { isActive, rank };
};

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return sendJson(res, 500, { error: "missing_redis_config" });
  }

  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return sendJson(res, 429, { error: "rate_limited" });
  }

  const body = await readBody(req);
  const installId = String(body.installId || "").trim();
  const appVersion = String(body.appVersion || "").trim();

  if (!installId) {
    return sendJson(res, 400, { error: "installId_required" });
  }

  if (!INSTALL_ID_PATTERN.test(installId)) {
    return sendJson(res, 400, { error: "invalid_install_id" });
  }

  if (appVersion.length > MAX_APP_VERSION_LENGTH) {
    return sendJson(res, 400, { error: "invalid_app_version" });
  }

  try {
    const { isActive, rank } = await callRedisEval(installId);
    const remainingRaw = EARLY_ACCESS_LIMIT - Math.max(rank, 0);
    const remaining = remainingRaw > 0 ? remainingRaw : 0;

    if (!isActive) {
      return sendJson(res, 200, {
        active: false,
        limit: EARLY_ACCESS_LIMIT,
        remaining,
      });
    }

    return sendJson(res, 200, {
      active: true,
      licenseKey: `EARLY-${installId}`,
      rank,
      limit: EARLY_ACCESS_LIMIT,
      remaining,
    });
  } catch (error) {
    console.warn("pro_early_access_claim_error", {
      clientId,
      detail: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 500, {
      error: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

module.exports = handler;
