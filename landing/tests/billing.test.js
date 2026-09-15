const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");

const SECRET = "a".repeat(64);
const PRICE = "price_DictxPro123";
const LIVE_SESSION = "cs_live_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ";
const ENV_KEYS = [
  "VERCEL_ENV",
  "STRIPE_COMMERCE_MODE",
  "STRIPE_SECRET_KEY",
  "DICTX_STRIPE_PRICE_ID",
  "DICTX_LICENSE_SECRET",
  "DICTX_STRIPE_PAYMENT_LINK",
];
const savedEnv = {};
const realFetch = globalThis.fetch;

const configureStripe = () => {
  process.env.STRIPE_SECRET_KEY = "rk_live_restrictedKey123";
  process.env.DICTX_STRIPE_PRICE_ID = PRICE;
  process.env.DICTX_LICENSE_SECRET = SECRET;
};

const paidSession = (overrides = {}) => ({
  id: LIVE_SESSION,
  livemode: true,
  status: "complete",
  payment_status: "paid",
  payment_intent: {
    id: "pi_1",
    latest_charge: { id: "ch_1", refunded: false, disputed: false },
  },
  ...overrides,
});

const oneProItem = (overrides = {}) => ({
  data: [{ quantity: 1, price: { id: PRICE }, ...overrides }],
  has_more: false,
});

const stubStripe = ({
  session = paidSession(),
  items = oneProItem(),
  status = 200,
} = {}) => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (status !== 200) return new Response("{}", { status });
    const body = String(url).includes("/line_items") ? items : session;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return calls;
};

const failOnNetwork = () => {
  globalThis.fetch = async (url) => {
    throw new Error(`unexpected network call: ${url}`);
  };
};

const fakeRes = () => ({
  statusCode: 0,
  headers: {},
  body: undefined,
  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  redirect(code, location) {
    this.statusCode = code;
    this.headers.location = location;
    return this;
  },
});

const fresh = (path) => {
  delete require.cache[require.resolve(path)];
  return require(path);
};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  globalThis.fetch = realFetch;
});

test("license keys round-trip, reject tampering, and fit the verify charset", () => {
  const { issueLicenseKey, parseLicenseKey } = require("../api/_lib/license");
  const key = issueLicenseKey(LIVE_SESSION, SECRET);
  assert.match(key, /^[A-Za-z0-9_-]{8,128}$/);
  assert.deepEqual(parseLicenseKey(key, SECRET), { sessionId: LIVE_SESSION });
  assert.equal(parseLicenseKey(key, "b".repeat(64)), null);
  const flipped = key.slice(0, -1) + (key.endsWith("0") ? "1" : "0");
  assert.equal(parseLicenseKey(flipped, SECRET), null);
  assert.equal(
    parseLicenseKey(key.replace("cs_live_a1", "cs_live_z9"), SECRET),
    null,
  );
  assert.equal(parseLicenseKey("lk_abcdef123456", SECRET), null);
});

test("purchase classification is exact and fail-closed", () => {
  const { classifyPurchase } = require("../api/_lib/stripe-purchase");
  const base = {
    lineItems: oneProItem(),
    priceId: PRICE,
    expectedLivemode: true,
  };
  const reason = (input) => classifyPurchase({ ...base, ...input }).reason;

  assert.equal(classifyPurchase({ ...base, session: paidSession() }).ok, true);
  assert.equal(
    classifyPurchase({
      ...base,
      session: paidSession({ payment_status: "no_payment_required" }),
    }).ok,
    true,
    "a 100% promotion code still earns the license",
  );
  assert.equal(
    reason({ session: paidSession({ payment_status: "unpaid" }) }),
    "unpaid",
  );
  assert.equal(reason({ session: paidSession({ status: "open" }) }), "unpaid");
  assert.equal(
    reason({ session: paidSession({ livemode: false }) }),
    "test_session",
  );
  assert.equal(
    reason({
      session: paidSession(),
      lineItems: oneProItem({ price: { id: "price_other" } }),
    }),
    "wrong_order",
  );
  assert.equal(
    reason({ session: paidSession(), lineItems: oneProItem({ quantity: 2 }) }),
    "wrong_order",
  );
  assert.equal(
    reason({
      session: paidSession(),
      lineItems: { data: [], has_more: false },
    }),
    "wrong_order",
  );
  assert.equal(
    reason({
      session: paidSession({
        payment_intent: { latest_charge: { refunded: true } },
      }),
    }),
    "refunded",
  );
  assert.equal(
    reason({
      session: paidSession({
        payment_intent: { latest_charge: { refunded: false, disputed: true } },
      }),
    }),
    "refunded",
  );
});

test("production forces live mode whatever STRIPE_COMMERCE_MODE says", () => {
  const {
    commerceMode,
    sessionIdPattern,
  } = require("../api/_lib/stripe-purchase");
  process.env.STRIPE_COMMERCE_MODE = "test";
  assert.equal(commerceMode(), "test");
  process.env.VERCEL_ENV = "production";
  assert.equal(commerceMode(), "live");
  assert.equal(sessionIdPattern().test("cs_test_a1B2c3D4e5F6g7H8"), false);
});

test("/buy redirects only to a fully configured canonical live link, else 503", () => {
  const buy = fresh("../api/buy");
  const visit = () => {
    const res = fakeRes();
    buy({ method: "GET" }, res);
    assert.equal(res.headers["cache-control"], "no-store");
    return res;
  };

  let res = visit();
  assert.equal(res.statusCode, 503, "nothing configured");
  assert.match(res.body, /Checkout is temporarily unavailable/);
  assert.doesNotMatch(res.body, /polar/i);

  process.env.DICTX_STRIPE_PAYMENT_LINK = "https://buy.stripe.com/abc123";
  assert.equal(visit().statusCode, 503, "a link alone is not enough");

  configureStripe();
  res = visit();
  assert.equal(res.statusCode, 307);
  assert.equal(res.headers.location, "https://buy.stripe.com/abc123");

  for (const bad of [
    "https://buy.stripe.com/test_abc123",
    "http://buy.stripe.com/abc123",
    "https://evil.example/abc123",
    "https://buy.stripe.com/abc123?prefilled_email=x",
  ]) {
    process.env.DICTX_STRIPE_PAYMENT_LINK = bad;
    assert.equal(visit().statusCode, 503, bad);
  }
});

test("the license endpoint issues keys only for verified purchases", async () => {
  const license = fresh("../api/pro/license");
  const { parseLicenseKey } = require("../api/_lib/license");
  let client = 0;
  const call = async (sessionId) => {
    const res = fakeRes();
    client += 1;
    await license(
      {
        method: "GET",
        query: { session_id: sessionId },
        headers: { "x-forwarded-for": `license-${client}` },
      },
      res,
    );
    return res;
  };

  assert.equal((await call(LIVE_SESSION)).statusCode, 503, "not configured");

  configureStripe();
  const calls = stubStripe();
  const ok = await call(LIVE_SESSION);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(parseLicenseKey(ok.body.licenseKey, SECRET), {
    sessionId: LIVE_SESSION,
  });
  assert.ok(
    calls.every((url) =>
      url.startsWith("https://api.stripe.com/v1/checkout/sessions/"),
    ),
  );

  stubStripe({
    session: paidSession({
      payment_intent: { latest_charge: { refunded: true } },
    }),
  });
  assert.equal((await call(LIVE_SESSION)).statusCode, 410);
  stubStripe({ status: 404 });
  assert.equal((await call(LIVE_SESSION)).statusCode, 404);
  stubStripe({ status: 500 });
  assert.equal((await call(LIVE_SESSION)).statusCode, 502);
  assert.equal((await call("cs_test_a1B2c3D4e5F6g7H8")).statusCode, 404);
  assert.equal((await call("not-a-session")).statusCode, 404);
});

const postVerify = async (verify, licenseKey, clientId) => {
  const res = fakeRes();
  await verify(
    {
      method: "POST",
      body: { licenseKey },
      headers: { "x-forwarded-for": clientId },
    },
    res,
  );
  return res;
};

test("verify checks Stripe keys and keeps outages non-revoking", async () => {
  const verify = fresh("../api/pro/verify");
  const { issueLicenseKey } = require("../api/_lib/license");
  configureStripe();
  const key = issueLicenseKey(LIVE_SESSION, SECRET);

  stubStripe({ status: 500 });
  let res = await postVerify(verify, key, "verify-1");
  assert.equal(res.statusCode, 502, "an outage is an error, not a revocation");

  stubStripe();
  res = await postVerify(verify, key, "verify-2");
  assert.deepEqual([res.statusCode, res.body.active], [200, true]);

  res = await postVerify(verify, key.slice(0, -2) + "00", "verify-3");
  assert.deepEqual([res.statusCode, res.body.active], [200, false]);
});

test("retired Polar keys answer 410 without any network call", async () => {
  const verify = fresh("../api/pro/verify");
  configureStripe();
  failOnNetwork();
  for (const [index, key] of [
    "lk_legacyKey12345",
    "polar_cl_abcdef123",
  ].entries()) {
    const res = await postVerify(verify, key, `polar-${index}`);
    // 410 is an error to installed apps, so an already-activated Polar
    // customer keeps Pro instead of being switched off by the retirement.
    assert.deepEqual([res.statusCode, res.body.error], [410, "polar_retired"]);
  }
  const unknown = await postVerify(verify, "somethingElse123", "polar-x");
  assert.deepEqual([unknown.statusCode, unknown.body.active], [200, false]);
});

test("a refunded Stripe purchase deactivates on the next verification", async () => {
  const verify = fresh("../api/pro/verify");
  const { issueLicenseKey } = require("../api/_lib/license");
  configureStripe();
  stubStripe({
    session: paidSession({
      payment_intent: { latest_charge: { refunded: true } },
    }),
  });
  const res = await postVerify(
    verify,
    issueLicenseKey(LIVE_SESSION, SECRET),
    "verify-5",
  );
  assert.deepEqual(
    [res.statusCode, res.body.active, res.body.reason],
    [200, false, "refunded"],
  );
});
