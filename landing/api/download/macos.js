const GITHUB_OWNER = "splitlabs";
const GITHUB_REPO = "dictx";
const GITHUB_API_BASE = "https://api.github.com";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

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

const redirectTo = (res, location) => {
  if (res && typeof res.redirect === "function") {
    res.setHeader("cache-control", "no-store");
    res.redirect(302, location);
    return null;
  }

  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
  });
};

const pickMacDmgAsset = (assets) => {
  const dmgAssets = (assets || []).filter((asset) => {
    const name = String(asset?.name || "").toLowerCase();
    return name.endsWith(".dmg");
  });

  if (dmgAssets.length === 0) {
    return null;
  }

  // Prefer Apple Silicon naming first, then universal / generic DMG.
  return (
    dmgAssets.find((asset) => /aarch64|arm64/.test(String(asset?.name || "").toLowerCase())) ||
    dmgAssets.find((asset) => /universal/.test(String(asset?.name || "").toLowerCase())) ||
    dmgAssets[0]
  );
};

const handler = async (req, res) => {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const apiUrl = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const releaseResponse = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "dictx-landing-download-resolver",
      },
    });

    if (!releaseResponse.ok) {
      return redirectTo(res, RELEASES_LATEST_URL);
    }

    const release = await releaseResponse.json();
    const asset = pickMacDmgAsset(release?.assets);

    if (!asset?.browser_download_url) {
      return redirectTo(res, RELEASES_LATEST_URL);
    }

    return redirectTo(res, asset.browser_download_url);
  } catch (error) {
    return redirectTo(res, RELEASES_LATEST_URL);
  }
};

module.exports = handler;
