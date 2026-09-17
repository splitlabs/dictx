/**
 * Shared client logic for the download flow (buy/success and /download
 * paste-your-link pages). Both pages POST the Stripe Checkout Session id to
 * /api/download/macos and redirect the browser to the presigned R2 URL it
 * returns. The session id never appears in a query string, a link href, or
 * an analytics call from this script.
 */
window.DictxDownload = (function () {
  var SESSION_ID_PATTERN = /cs_(?:live|test)_[A-Za-z0-9]{10,200}/;

  /** Accepts a full success-page URL or a bare Checkout Session id. */
  function extractSessionId(input) {
    var value = String(input || "").trim();
    if (!value) return "";
    try {
      var url = new URL(value);
      var fromQuery = url.searchParams.get("session_id");
      if (fromQuery && SESSION_ID_PATTERN.test(fromQuery)) {
        return SESSION_ID_PATTERN.exec(fromQuery)[0];
      }
    } catch (_error) {
      // Not a URL; fall through to a bare-id match below.
    }
    var match = SESSION_ID_PATTERN.exec(value);
    return match ? match[0] : "";
  }

  var STATUS_MESSAGES = {
    402: "Your payment is still being confirmed. Try again in a minute.",
    404: "We could not find that purchase. Double-check the link, or open an issue on GitHub.",
    410: "This purchase was refunded, so no download is issued.",
    429: "Too many attempts. Wait a minute and try again.",
    502: "Stripe is temporarily unavailable. Try again shortly.",
    503: "Downloads are temporarily unavailable. Try again shortly.",
  };
  var FALLBACK_MESSAGE =
    "Something went wrong. Try again, or open an issue on GitHub.";

  function messageForStatus(status) {
    return STATUS_MESSAGES[status] || FALLBACK_MESSAGE;
  }

  /**
   * Requests a presigned download URL and returns
   * { ok, url, status, error }.
   */
  function requestDownload(sessionId, arch) {
    return fetch("/api/download/macos", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, arch: arch }),
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            return { response: response, body: body };
          });
      })
      .then(function (result) {
        if (result.response.ok && result.body && result.body.url) {
          return { ok: true, url: result.body.url };
        }
        return {
          ok: false,
          status: result.response.status,
          error: (result.body && result.body.error) || "unknown_error",
        };
      })
      .catch(function () {
        return { ok: false, status: 0, error: "network_error" };
      });
  }

  /**
   * Wires up a pair of download buttons (aarch64 primary, x64 secondary)
   * against a getter for the current session id, an aria-live status
   * element, and an optional callback fired right before navigation.
   */
  function wireButtons(options) {
    var buttons = options.buttons; // [{ el, arch }]
    var statusEl = options.statusEl;
    var getSessionId = options.getSessionId;
    var onStart = options.onStart;

    var setStatus = function (text) {
      if (statusEl) statusEl.textContent = text;
    };

    buttons.forEach(function (entry) {
      entry.el.addEventListener("click", function () {
        var sessionId = getSessionId();
        if (!sessionId) {
          setStatus("Paste your purchase link first.");
          return;
        }
        if (typeof onStart === "function") onStart(entry);
        buttons.forEach(function (b) {
          b.el.disabled = true;
        });
        setStatus("Preparing your download...");
        requestDownload(sessionId, entry.arch).then(function (result) {
          if (result.ok) {
            setStatus("Starting your download...");
            window.location.assign(result.url);
            return;
          }
          buttons.forEach(function (b) {
            b.el.disabled = false;
          });
          setStatus(messageForStatus(result.status));
        });
      });
    });
  }

  return {
    extractSessionId: extractSessionId,
    messageForStatus: messageForStatus,
    requestDownload: requestDownload,
    wireButtons: wireButtons,
  };
})();
