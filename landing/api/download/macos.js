/**
 * POST /api/download/macos  { session_id, arch }
 *
 * Mints a short-lived presigned R2 URL for the signed macOS DMG once the
 * Stripe Checkout Session is verified paid, unrefunded and undisputed
 * (see ../_lib/stripe-purchase.js). No license keys: the session id itself
 * is the re-download token, so it is never logged and the response is
 * never cached.
 */
const { purchaseForSession, stripeConfig } = require("../_lib/stripe-purchase");
const { presignGetUrl, r2Config } = require("../_lib/r2-presign");
const { createRateLimiter, getClientId, sendJson } = require("../_lib/http");

const RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.DOWNLOAD_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);
const RATE_LIMIT_MAX = Number.parseInt(
  process.env.DOWNLOAD_RATE_LIMIT_MAX || "20",
  10,
);
const isRateLimited = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);

const URL_EXPIRES_IN = 300;
const ARCHES = new Set(["aarch64", "x64"]);

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

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (isRateLimited(getClientId(req))) {
    return sendJson(res, 429, { error: "rate_limited" });
  }

  const stripe = stripeConfig();
  if (!stripe.ready) {
    return sendJson(res, 503, { error: "stripe_not_configured" });
  }
  const r2 = r2Config();
  if (!r2.ready) {
    return sendJson(res, 503, { error: "r2_not_configured" });
  }

  const parsed = await readBody(req);
  const body = parsed && typeof parsed === "object" ? parsed : {};
  const arch = String(body.arch || "aarch64").trim() || "aarch64";
  if (!ARCHES.has(arch)) {
    return sendJson(res, 400, { error: "invalid_arch" });
  }

  const sessionId = String(body.session_id || "").trim();
  const purchase = await purchaseForSession(sessionId, stripe);
  if (!purchase.ok) {
    // Reason only: never log the session id or any derived URL.
    console.warn("download_macos_refused", { reason: purchase.reason });
    return sendJson(res, STATUS_BY_REASON[purchase.reason] || 400, {
      error: purchase.reason,
    });
  }

  const key = `macos/latest/Dictx_${arch}.dmg`;
  const url = presignGetUrl({
    accountId: r2.accountId,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
    bucket: r2.bucket,
    key,
    expiresIn: URL_EXPIRES_IN,
    responseContentDisposition: `attachment; filename="Dictx_${arch}.dmg"`,
  });

  return sendJson(res, 200, { url, expiresIn: URL_EXPIRES_IN });
};

module.exports = handler;
