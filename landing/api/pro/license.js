/**
 * GET /api/pro/license?session_id=cs_live_...
 *
 * Issues the Dictx Pro license key for a verified Stripe purchase. The success
 * page calls this after the Payment Link redirect; opening that page again
 * reissues the same key, because the key is derived from the session id.
 */
const { purchaseForSession, stripeConfig } = require("../_lib/stripe-purchase");
const { issueLicenseKey } = require("../_lib/license");
const {
  createRateLimiter,
  getClientId,
  getQueryParam,
  sendJson,
} = require("../_lib/http");

const isRateLimited = createRateLimiter(60000, 20);

const STATUS_BY_REASON = {
  malformed_session: 404,
  invalid_session: 404,
  test_session: 404,
  unpaid: 402,
  wrong_order: 409,
  refunded: 410,
  provider_invalid: 502,
  provider_unavailable: 502,
};

const handler = async (req, res) => {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (isRateLimited(getClientId(req))) {
    return sendJson(res, 429, { error: "rate_limited" });
  }

  const config = stripeConfig();
  if (!config.ready) {
    return sendJson(res, 503, { error: "stripe_not_configured" });
  }

  const sessionId = String(getQueryParam(req, "session_id")).trim();
  const purchase = await purchaseForSession(sessionId, config);
  if (!purchase.ok) {
    console.warn("pro_license_refused", { reason: purchase.reason });
    return sendJson(res, STATUS_BY_REASON[purchase.reason] || 400, {
      error: purchase.reason,
    });
  }

  return sendJson(res, 200, {
    licenseKey: issueLicenseKey(purchase.sessionId, config.licenseSecret),
  });
};

module.exports = handler;
