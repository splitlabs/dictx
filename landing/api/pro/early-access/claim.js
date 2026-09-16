/**
 * POST /api/pro/early-access/claim
 *
 * The early-access offer ("first 100 installs get Pro free") is retired.
 *
 * It never worked: the claim store (Upstash Redis) was never provisioned in
 * production, so every claim answered 500 missing_redis_config. Installed apps
 * treat a 5xx as a failure and record a verification error on the Pro check,
 * while 404 means "not granted" and lets the app carry on silently
 * (src-tauri/src/commands/pro.rs, claim_early_access). So this endpoint stays
 * in place and answers 404 rather than disappearing: older installs keep
 * calling it, and they must not be shown an error for an offer we withdrew.
 */
const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);

  if (res && typeof res.status === "function") {
    res.setHeader("cache-control", "no-store");
    res.status(statusCode).json(payload);
    return null;
  }

  return new Response(body, {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  return sendJson(res, 404, { error: "early_access_closed" });
};

module.exports = handler;
