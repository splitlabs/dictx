/**
 * Dictx Pro license keys for Stripe purchases.
 *
 * A key is the Checkout Session id plus an HMAC over it:
 *   dxp-<cs_live_...>-<32 hex chars>
 * so issuing needs no storage, forging needs DICTX_LICENSE_SECRET, and every
 * verification can re-check the live session for refunds and disputes. The
 * charset stays within [A-Za-z0-9_-], which is all installed app versions
 * send unchanged to /api/pro/verify.
 *
 * Rotating DICTX_LICENSE_SECRET invalidates every issued key. Do not rotate
 * it without a migration.
 */
const crypto = require("node:crypto");

const KEY_PREFIX = "dxp-";
const KEY_PATTERN =
  /^dxp-(cs_(?:live|test)_[A-Za-z0-9]{10,200})-([0-9a-f]{32})$/;

const mac = (sessionId, secret) =>
  crypto
    .createHmac("sha256", secret)
    .update(`dictx-pro:v1:${sessionId}`)
    .digest("hex")
    .slice(0, 32);

const issueLicenseKey = (sessionId, secret) =>
  `${KEY_PREFIX}${sessionId}-${mac(sessionId, secret)}`;

const isStripeLicenseKey = (value) =>
  typeof value === "string" && value.startsWith(KEY_PREFIX);

/** Returns { sessionId } for an authentic key, otherwise null. */
const parseLicenseKey = (value, secret) => {
  const match = KEY_PATTERN.exec(value || "");
  if (!match || !secret) return null;
  const expected = Buffer.from(mac(match[1], secret), "utf8");
  const given = Buffer.from(match[2], "utf8");
  if (expected.length !== given.length) return null;
  return crypto.timingSafeEqual(expected, given)
    ? { sessionId: match[1] }
    : null;
};

module.exports = { isStripeLicenseKey, issueLicenseKey, parseLicenseKey };
