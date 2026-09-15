/**
 * POST /api/pro/verify  { licenseKey }
 *
 * The in-app activation and refresh check. Installed app versions read only
 * `{ active }` on 200, treat 401/404 as inactive, and treat every other status
 * as an error that keeps the current entitlement.
 *
 * - dxp- keys (Stripe Managed Payments) are verified against the live
 *   Checkout Session: refunds and disputes turn Pro off on the next check.
 * - lk_ / polar_cl_ keys came from the retired Polar checkout. They answer
 *   410 so apps that already activated one keep Pro instead of being
 *   switched off, while new activations with those keys fail visibly.
 * - Anything else is not a Dictx Pro key and is inactive.
 */
const { purchaseForSession, stripeConfig } = require("../_lib/stripe-purchase");
const { isStripeLicenseKey, parseLicenseKey } = require("../_lib/license");
const { createRateLimiter, getClientId, sendJson } = require("../_lib/http");

const RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.PRO_VERIFY_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);
const RATE_LIMIT_MAX = Number.parseInt(
  process.env.PRO_VERIFY_RATE_LIMIT_MAX || "20",
  10,
);
const MAX_LICENSE_KEY_LENGTH = 256;
const RETIRED_POLAR_KEY = /^(?:lk_|polar_cl_)/;

const isRateLimited = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);

// Positive verifications are cached briefly so an app refresh storm does not
// become a Stripe request storm. Refusals are never cached.
const ACTIVE_TTL_MS = 10 * 60 * 1000;
const activeUntil = new Map();

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
    if (typeof req.body === "object" && req.body !== null) return req.body;
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

const verifyStripeLicense = async (res, licenseKey) => {
  const config = stripeConfig();
  if (!config.ready) {
    return sendJson(res, 503, { error: "stripe_not_configured" });
  }
  const parsed = parseLicenseKey(licenseKey, config.licenseSecret);
  if (!parsed) {
    return sendJson(res, 200, { active: false, mode: "stripe_license" });
  }
  if ((activeUntil.get(parsed.sessionId) || 0) > Date.now()) {
    return sendJson(res, 200, { active: true, mode: "stripe_license" });
  }
  const purchase = await purchaseForSession(parsed.sessionId, config);
  if (purchase.ok) {
    activeUntil.set(parsed.sessionId, Date.now() + ACTIVE_TTL_MS);
    return sendJson(res, 200, { active: true, mode: "stripe_license" });
  }
  if (
    purchase.reason === "provider_unavailable" ||
    purchase.reason === "provider_invalid"
  ) {
    // An outage must not revoke Pro: the app keeps its entitlement on errors.
    return sendJson(res, 502, { error: "stripe_api_error" });
  }
  activeUntil.delete(parsed.sessionId);
  return sendJson(res, 200, {
    active: false,
    mode: "stripe_license",
    reason: purchase.reason,
  });
};

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (isRateLimited(getClientId(req))) {
    return sendJson(res, 429, { error: "rate_limited" });
  }

  const body = await readBody(req);
  const licenseKey = String(body.licenseKey || body.checkoutId || "").trim();

  if (!licenseKey) {
    return sendJson(res, 400, { error: "licenseKey_required" });
  }
  if (licenseKey.length > MAX_LICENSE_KEY_LENGTH) {
    return sendJson(res, 400, { error: "invalid_license_key" });
  }
  if (isStripeLicenseKey(licenseKey)) {
    return verifyStripeLicense(res, licenseKey);
  }
  if (RETIRED_POLAR_KEY.test(licenseKey)) {
    return sendJson(res, 410, { error: "polar_retired" });
  }
  return sendJson(res, 200, { active: false, mode: "unknown_key" });
};

module.exports = handler;
