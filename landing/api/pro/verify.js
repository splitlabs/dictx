const POLAR_API_BASE = process.env.POLAR_API_BASE || "https://api.polar.sh/v1";
const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN || "";
const ALLOWED_PRODUCT_IDS = (process.env.POLAR_DICTX_PRODUCT_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.PRO_VERIFY_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);
const RATE_LIMIT_MAX = Number.parseInt(
  process.env.PRO_VERIFY_RATE_LIMIT_MAX || "20",
  10,
);
const MAX_LICENSE_KEY_LENGTH = 128;
const LICENSE_KEY_PATTERN = /^polar_cl_[A-Za-z0-9]+$/;
const requestBuckets = new Map();

const readBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return {};
    }
  }
  return req.body;
};

const statusLooksPaid = (status, paid) => {
  if (paid === true) return true;
  const value = (status || "").toLowerCase();
  return (
    value === "succeeded" ||
    value === "confirmed" ||
    value === "paid" ||
    value === "completed"
  );
};

const getClientId = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return forwarded[0] || "unknown";
  }
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const [first] = forwarded.split(",");
    return first.trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!POLAR_ACCESS_TOKEN) {
    res.status(500).json({ error: "missing_polar_access_token" });
    return;
  }

  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const body = readBody(req);
  const licenseKey = (body.licenseKey || body.checkoutId || "").trim();

  if (!licenseKey) {
    res.status(400).json({ error: "licenseKey_required" });
    return;
  }

  if (licenseKey.length > MAX_LICENSE_KEY_LENGTH) {
    console.warn("pro_verify_invalid_key_length", { clientId });
    res.status(400).json({ error: "invalid_license_key" });
    return;
  }

  if (!LICENSE_KEY_PATTERN.test(licenseKey)) {
    console.warn("pro_verify_invalid_key_format", { clientId });
    res.status(400).json({ error: "invalid_license_key" });
    return;
  }

  try {
    const response = await fetch(
      `${POLAR_API_BASE}/checkouts/${encodeURIComponent(licenseKey)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.status === 404) {
      res.status(404).json({ active: false });
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      console.warn("pro_verify_polar_api_error", {
        status: response.status,
        clientId,
      });
      res.status(502).json({ error: "polar_api_error", detail: text });
      return;
    }

    const checkout = await response.json();
    const productId =
      checkout.product_id == null ? "" : String(checkout.product_id);
    const productAllowed =
      ALLOWED_PRODUCT_IDS.length === 0 || ALLOWED_PRODUCT_IDS.includes(productId);
    const paid = statusLooksPaid(checkout.status, checkout.paid);

    res.status(200).json({ active: Boolean(productAllowed && paid) });
  } catch (error) {
    console.warn("pro_verify_internal_error", { clientId });
    res.status(500).json({
      error: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};
