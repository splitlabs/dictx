const assert = require("node:assert/strict");
const { test, afterEach } = require("node:test");

const download = require("../api/download/macos");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const asset = (name) => ({
  name,
  browser_download_url: `https://github.com/splitlabs/dictx/releases/download/v0.4.0/${name}`,
});

const release = (...names) => ({ assets: names.map(asset) });

const stubRelease = (body, status = 200) => {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
};

const fakeRes = () => ({
  statusCode: 0,
  headers: {},
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
  redirect(code, location) {
    this.statusCode = code;
    this.headers.location = location;
    return this;
  },
});

const visit = async (query = {}) => {
  const res = fakeRes();
  await download({ method: "GET", query }, res);
  return res;
};

test("picks the DMG for the requested architecture, never the other one", () => {
  const assets = release(
    "Dictx_0.4.0_x64.dmg",
    "Dictx_0.4.0_aarch64.dmg",
    "Dictx_0.4.0_x64-setup.exe",
  ).assets;
  assert.equal(
    download.pickMacDmgAsset(assets, "apple_silicon").name,
    "Dictx_0.4.0_aarch64.dmg",
  );
  assert.equal(
    download.pickMacDmgAsset(assets, "intel").name,
    "Dictx_0.4.0_x64.dmg",
  );
  const appleOnly = release("Dictx_0.4.0_aarch64.dmg").assets;
  assert.equal(download.pickMacDmgAsset(appleOnly, "intel"), null);
  const universal = release("Dictx_0.4.0_universal.dmg").assets;
  assert.equal(
    download.pickMacDmgAsset(universal, "intel").name,
    "Dictx_0.4.0_universal.dmg",
  );
});

test("redirects Apple silicon by default and Intel with arch=intel", async () => {
  stubRelease(release("Dictx_0.4.0_aarch64.dmg", "Dictx_0.4.0_x64.dmg"));
  let res = await visit();
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location, /aarch64\.dmg$/);
  assert.equal(res.headers["cache-control"], "no-store");

  res = await visit({ arch: "intel" });
  assert.match(res.headers.location, /x64\.dmg$/);
});

test("falls back to the release page when the architecture is missing or GitHub fails", async () => {
  stubRelease(release("Dictx_0.4.0_x64-setup.exe"));
  assert.equal((await visit()).headers.location, download.RELEASES_LATEST_URL);

  stubRelease(release("Dictx_0.4.0_aarch64.dmg"));
  assert.equal(
    (await visit({ arch: "intel" })).headers.location,
    download.RELEASES_LATEST_URL,
  );

  stubRelease({ message: "rate limited" }, 403);
  assert.equal((await visit()).headers.location, download.RELEASES_LATEST_URL);

  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  assert.equal((await visit()).headers.location, download.RELEASES_LATEST_URL);
});
