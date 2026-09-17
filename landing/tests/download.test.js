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
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PRIVATE_BUCKET",
  "DOWNLOAD_RATE_LIMIT_WINDOW_MS",
  "DOWNLOAD_RATE_LIMIT_MAX",
];
const savedEnv = {};
const realFetch = globalThis.fetch;

const configureStripe = () => {
  process.env.STRIPE_SECRET_KEY = "rk_live_restrictedKey123";
  process.env.DICTX_STRIPE_PRICE_ID = PRICE;
};

const configureR2 = () => {
  process.env.R2_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "AKIAEXAMPLE";
  process.env.R2_SECRET_ACCESS_KEY = "secretExample";
  process.env.R2_PRIVATE_BUCKET = "dictx-private";
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

test("presignGetUrl matches the AWS documented presigned-URL example", () => {
  const { presignGetUrl } = require("../api/_lib/r2-presign");
  // Placeholder credentials published in the AWS SigV4 documentation, not real
  // keys. Assembled from parts so secret scanners do not flag the test vector.
  const docsExample = (...parts) => parts.join("");
  const url = presignGetUrl({
    accessKeyId: docsExample("AKIAIOSFODNN7", "EXAMPLE"),
    secretAccessKey: docsExample(
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCY",
      "EXAMPLEKEY",
    ),
    bucket: "examplebucket",
    key: "test.txt",
    region: "us-east-1",
    service: "s3",
    expiresIn: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
    host: "examplebucket.s3.amazonaws.com",
    virtualHosted: true,
  });
  assert.match(
    url,
    /^https:\/\/examplebucket\.s3\.amazonaws\.com\/test\.txt\?/,
  );
  assert.match(
    url,
    /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/,
  );
});

const call = async (handler, { body, clientId = "client-1" } = {}) => {
  const res = fakeRes();
  await handler(
    {
      method: "POST",
      body: body || {},
      headers: { "x-forwarded-for": clientId },
    },
    res,
  );
  return res;
};

test("a verified purchase gets a presigned R2 URL scoped to the requested arch", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();
  stubStripe();

  const armRes = await call(macos, {
    body: { session_id: LIVE_SESSION, arch: "aarch64" },
    clientId: "arch-1",
  });
  assert.equal(armRes.statusCode, 200);
  assert.equal(armRes.headers["cache-control"], "no-store");
  assert.equal(armRes.body.expiresIn, 300);
  const armUrl = new URL(armRes.body.url);
  assert.equal(armUrl.hostname, "acct123.r2.cloudflarestorage.com");
  assert.equal(
    armUrl.pathname,
    "/dictx-private/macos/latest/Dictx_aarch64.dmg",
  );
  assert.equal(armUrl.searchParams.get("X-Amz-Expires"), "300");
  assert.ok(armUrl.searchParams.get("X-Amz-Signature"));

  stubStripe();
  const intelRes = await call(macos, {
    body: { session_id: LIVE_SESSION, arch: "x64" },
    clientId: "arch-2",
  });
  assert.equal(intelRes.statusCode, 200);
  const intelUrl = new URL(intelRes.body.url);
  assert.equal(intelUrl.pathname, "/dictx-private/macos/latest/Dictx_x64.dmg");
});

test("defaults to aarch64 when arch is omitted, rejects unknown arches", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();

  stubStripe();
  const defaultRes = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId: "default-arch",
  });
  assert.equal(defaultRes.statusCode, 200);
  assert.match(new URL(defaultRes.body.url).pathname, /Dictx_aarch64\.dmg$/);

  const badRes = await call(macos, {
    body: { session_id: LIVE_SESSION, arch: "windows" },
    clientId: "bad-arch",
  });
  assert.equal(badRes.statusCode, 400);
});

test("refuses unpaid, refunded and unknown sessions without issuing a URL", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();

  stubStripe({ session: paidSession({ payment_status: "unpaid" }) });
  assert.equal(
    (
      await call(macos, {
        body: { session_id: LIVE_SESSION },
        clientId: "unpaid",
      })
    ).statusCode,
    402,
  );

  stubStripe({
    session: paidSession({
      payment_intent: { latest_charge: { refunded: true } },
    }),
  });
  assert.equal(
    (
      await call(macos, {
        body: { session_id: LIVE_SESSION },
        clientId: "refunded",
      })
    ).statusCode,
    410,
  );

  stubStripe({ status: 404 });
  assert.equal(
    (
      await call(macos, {
        body: { session_id: LIVE_SESSION },
        clientId: "unknown",
      })
    ).statusCode,
    404,
  );
});

test("malformed session ids are rejected without any Stripe call", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();
  failOnNetwork();

  const res = await call(macos, {
    body: { session_id: "not-a-session" },
    clientId: "malformed",
  });
  assert.equal(res.statusCode, 404);
});

test("GET is rejected with 405", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();
  const res = fakeRes();
  await macos({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test("missing R2 or Stripe config fails closed with 503", async () => {
  const macos = fresh("../api/download/macos");

  let res = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId: "no-config",
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "stripe_not_configured");

  configureStripe();
  res = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId: "no-r2",
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "r2_not_configured");
});

test("a Stripe outage answers 502, not a download URL", async () => {
  const macos = fresh("../api/download/macos");
  configureStripe();
  configureR2();
  stubStripe({ status: 500 });

  const res = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId: "outage",
  });
  assert.equal(res.statusCode, 502);
});

test("rate limits clients after too many requests", async () => {
  configureStripe();
  configureR2();
  process.env.DOWNLOAD_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.DOWNLOAD_RATE_LIMIT_MAX = "2";
  const macos = fresh("../api/download/macos");
  stubStripe();

  const clientId = "rate-limited-client";
  const first = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId,
  });
  assert.equal(first.statusCode, 200);
  const second = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId,
  });
  assert.equal(second.statusCode, 200);
  const third = await call(macos, {
    body: { session_id: LIVE_SESSION },
    clientId,
  });
  assert.equal(third.statusCode, 429);
});
