/** Shared request helpers for the Stripe billing endpoints. */
const getHeader = (req, name) => {
  if (!req || !req.headers) return "";
  if (typeof req.headers.get === "function") return req.headers.get(name) || "";
  return req.headers[name.toLowerCase()] || req.headers[name] || "";
};

const getClientId = (req) => {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (Array.isArray(forwarded)) return forwarded[0] || "unknown";
  if (forwarded.length > 0) return forwarded.split(",")[0].trim() || "unknown";
  return req?.socket?.remoteAddress || "unknown";
};

const createRateLimiter = (windowMs, max) => {
  const buckets = new Map();
  return (clientId) => {
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) buckets.delete(key);
      }
    }
    const existing = buckets.get(clientId);
    if (!existing || now > existing.resetAt) {
      buckets.set(clientId, { count: 1, resetAt: now + windowMs });
      return false;
    }
    existing.count += 1;
    return existing.count > max;
  };
};

const sendJson = (res, statusCode, payload) => {
  res.setHeader("cache-control", "no-store");
  res.status(statusCode).json(payload);
  return null;
};

const getQueryParam = (req, name) => {
  if (req?.query && typeof req.query[name] === "string") return req.query[name];
  try {
    return new URL(req.url, "http://localhost").searchParams.get(name) || "";
  } catch (_error) {
    return "";
  }
};

module.exports = { createRateLimiter, getClientId, getQueryParam, sendJson };
