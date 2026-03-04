const POLAR_API_BASE = process.env.POLAR_API_BASE || "https://api.polar.sh/v1";
const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN || "";
const POLAR_ORGANIZATION_ID = process.env.POLAR_ORGANIZATION_ID || "";
const ALLOWED_PRODUCT_IDS = (process.env.POLAR_DICTX_PRODUCT_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOWED_BENEFIT_IDS = (process.env.POLAR_DICTX_BENEFIT_IDS || "")
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
const LICENSE_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const LEGACY_CHECKOUT_ID_PATTERN = /^polar_cl_[A-Za-z0-9]+$/;
const requestBuckets = new Map();

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

const isLicenseGranted = (payload) => {
  const status = (payload?.status || "").toLowerCase();
  if (status !== "granted") {
    return false;
  }

  const expiresAt = payload?.expires_at;
  if (!expiresAt) {
    return true;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs > Date.now();
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

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  if (!POLAR_ACCESS_TOKEN) {
    return sendJson(res, 500, { error: "missing_polar_access_token" });
  }

  if (!POLAR_ORGANIZATION_ID) {
    return sendJson(res, 500, { error: "missing_polar_organization_id" });
  }

  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return sendJson(res, 429, { error: "rate_limited" });
  }

  const body = await readBody(req);
  const licenseKey = (body.licenseKey || body.checkoutId || "").trim();

  if (!licenseKey) {
    return sendJson(res, 400, { error: "licenseKey_required" });
  }

  if (licenseKey.length > MAX_LICENSE_KEY_LENGTH) {
    console.warn("pro_verify_invalid_key_length", { clientId });
    return sendJson(res, 400, { error: "invalid_license_key" });
  }

  if (!LICENSE_KEY_PATTERN.test(licenseKey) && !LEGACY_CHECKOUT_ID_PATTERN.test(licenseKey)) {
    console.warn("pro_verify_invalid_key_format", { clientId });
    return sendJson(res, 400, { error: "invalid_license_key" });
  }

  try {
    if (LEGACY_CHECKOUT_ID_PATTERN.test(licenseKey)) {
      const checkoutResponse = await fetch(
        `${POLAR_API_BASE}/checkouts/${encodeURIComponent(licenseKey)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (checkoutResponse.status === 404) {
        return sendJson(res, 404, { active: false });
      }

      if (!checkoutResponse.ok) {
        const text = await checkoutResponse.text();
        console.warn("pro_verify_polar_checkout_error", {
          status: checkoutResponse.status,
          clientId,
        });
        return sendJson(res, 502, { error: "polar_api_error", detail: text });
      }

      const checkout = await checkoutResponse.json();
      const productId =
        checkout.product_id == null ? "" : String(checkout.product_id);
      const productAllowed =
        ALLOWED_PRODUCT_IDS.length === 0 || ALLOWED_PRODUCT_IDS.includes(productId);
      const paid = statusLooksPaid(checkout.status, checkout.paid);

      return sendJson(res, 200, {
        active: Boolean(productAllowed && paid),
        mode: "legacy_checkout",
      });
    }

    const validateResponse = await fetch(`${POLAR_API_BASE}/license-keys/validate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: licenseKey,
        organization_id: POLAR_ORGANIZATION_ID,
      }),
    });

    if (validateResponse.status === 404 || validateResponse.status === 422) {
      return sendJson(res, 200, { active: false, mode: "license_key" });
    }

    if (!validateResponse.ok) {
      const text = await validateResponse.text();
      console.warn("pro_verify_polar_license_error", {
        status: validateResponse.status,
        clientId,
      });
      return sendJson(res, 502, { error: "polar_api_error", detail: text });
    }

    const license = await validateResponse.json();
    const benefitId = license?.benefit_id == null ? "" : String(license.benefit_id);
    const benefitAllowed =
      ALLOWED_BENEFIT_IDS.length === 0 || ALLOWED_BENEFIT_IDS.includes(benefitId);
    const granted = isLicenseGranted(license);

    return sendJson(res, 200, {
      active: Boolean(benefitAllowed && granted),
      mode: "license_key",
    });
  } catch (error) {
    console.warn("pro_verify_internal_error", { clientId });
    return sendJson(res, 500, {
      error: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

module.exports = handler;
