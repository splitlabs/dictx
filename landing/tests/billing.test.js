const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");

const PRICE = "price_DictxPro123";
const LIVE_SESSION = "cs_live_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ";
const ENV_KEYS = [
  "VERCEL_ENV",
  "STRIPE_COMMERCE_MODE",
  "STRIPE_SECRET_KEY",
  "DICTX_STRIPE_PRICE_ID",
  "DICTX_STRIPE_PAYMENT_LINK",
];
const savedEnv = {};
const realFetch = globalThis.fetch;

const configureStripe = () => {
  process.env.STRIPE_SECRET_KEY = "rk_live_restrictedKey123";
  process.env.DICTX_STRIPE_PRICE_ID = PRICE;
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
    "a 100% promotion code still counts as paid",
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
  assert.equal(
    reason({
      session: paidSession({
        payment_intent: {
          latest_charge: {
            refunded: false,
            disputed: false,
            amount_refunded: 500,
          },
        },
      }),
    }),
    "refunded",
    "a partial refund also ends the download",
  );
  assert.equal(
    reason({ session: paidSession({ payment_intent: null }) }),
    "provider_invalid",
    "a paid session without a charge to check fails closed",
  );
  assert.equal(
    reason({ session: paidSession({ payment_intent: "pi_unexpanded" }) }),
    "provider_invalid",
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
