/**
 * GET /api/download/macos[?arch=intel]
 *
 * Redirects to the macOS DMG in the latest GitHub release. Apple silicon is
 * the default; `arch=intel` picks the x64 build. When the latest release has
 * no DMG for that architecture, it redirects to the release page instead of
 * handing out a build for the wrong Mac or an older, unsigned release.
 */
const GITHUB_OWNER = "splitlabs";
const GITHUB_REPO = "dictx";
const GITHUB_API_BASE = "https://api.github.com";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

const ARCH_PATTERNS = {
  apple_silicon: /(aarch64|arm64)/,
  intel: /(x64|x86_64|intel)/,
};

const resolveArch = (value) =>
  String(value || "").toLowerCase() === "intel" ? "intel" : "apple_silicon";

const sendJson = (res, statusCode, payload) => {
  res.setHeader("cache-control", "no-store");
  res.status(statusCode).json(payload);
  return null;
};

const redirectTo = (res, location) => {
  res.setHeader("cache-control", "no-store");
  res.redirect(302, location);
  return null;
};

/** Pick the DMG for one architecture, or a universal DMG, never the other arch. */
const pickMacDmgAsset = (assets, arch = "apple_silicon") => {
  const dmgs = (assets || []).filter((asset) =>
    String(asset?.name || "")
      .toLowerCase()
      .endsWith(".dmg"),
  );
  const name = (asset) => String(asset?.name || "").toLowerCase();
  return (
    dmgs.find((asset) => ARCH_PATTERNS[arch].test(name(asset))) ||
    dmgs.find((asset) => /universal/.test(name(asset))) ||
    null
  );
};

const getQueryArch = (req) => {
  if (req?.query && typeof req.query.arch === "string") return req.query.arch;
  try {
    return new URL(req.url, "http://localhost").searchParams.get("arch");
  } catch (_error) {
    return "";
  }
};

const handler = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const arch = resolveArch(getQueryArch(req));

  try {
    const releaseResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "dictx-landing-download-resolver",
        },
      },
    );
    if (!releaseResponse.ok) return redirectTo(res, RELEASES_LATEST_URL);

    const release = await releaseResponse.json();
    const asset = pickMacDmgAsset(release?.assets, arch);
    if (!asset?.browser_download_url)
      return redirectTo(res, RELEASES_LATEST_URL);

    return redirectTo(res, asset.browser_download_url);
  } catch (_error) {
    return redirectTo(res, RELEASES_LATEST_URL);
  }
};

module.exports = handler;
module.exports.pickMacDmgAsset = pickMacDmgAsset;
module.exports.RELEASES_LATEST_URL = RELEASES_LATEST_URL;
