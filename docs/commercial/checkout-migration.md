# Dictx Commerce: Stripe Checkout + Private R2 Download (Pattern A)

Dictx Pro is sold at `https://dictx.splitlabs.io/buy` through Stripe Managed
Payments, where Link is the seller of record. There are no license keys and
no in-app entitlement: a paid Checkout Session is a one-time proof of
purchase that unlocks a short-lived download link for the signed macOS DMG.
The GPL source build is unchanged and has full functionality. Polar was
retired on 2026-09-15; the license-key model (`dxp-...`) was retired when
this document was rewritten.

## Scope

- Product: Dictx Pro (signed, notarized macOS DMG)
- Price: `$29` one-time (tax added at checkout where applicable)
- Free version: unchanged (GPL source build, same features, unsigned)
- Everyone — free and paid — auto-updates from the same public feed at
  `https://updates.dictx.splitlabs.io/latest.json`

## Flow

1. `/buy` redirects to the live Stripe Payment Link (unchanged).
2. After payment, Stripe redirects to
   `https://dictx.splitlabs.io/buy/success?session_id={CHECKOUT_SESSION_ID}`.
3. The success page calls `/api/download/macos?session_id=...`.
4. The endpoint verifies the Checkout Session against Stripe (live, complete,
   paid or fully discounted, exactly one Dictx Pro price at quantity 1,
   charge not refunded or disputed) using the same logic as the retired
   license flow (`landing/api/_lib/stripe-purchase.js`).
5. On success, the endpoint mints a short-lived (five minute) SigV4 GET
   presigned URL for the private R2 object
   `macos/latest/Dictx_{arch}.dmg` (or a specific
   `macos/v{VERSION}/Dictx_{VERSION}_{arch}.dmg` key) and returns/redirects
   to it. Arch is negotiated from the request (`?arch=aarch64|x64`, default
   `aarch64`).
6. Re-downloads: the success page is bookmarkable and re-runs step 3–5 as
   long as the Checkout Session id is known. `/download` is a paste page for
   a lost bookmark — paste the Checkout Session id, get a fresh presigned
   URL. Neither page needs an account or a stored key.

No webhook is needed: authorization comes from re-verifying the live
Checkout Session on every download request, the same pattern the retired
license flow used.

## Storage contract

- Private bucket (`R2_PRIVATE_BUCKET`, never public): DMGs only.
  - `macos/v{VERSION}/Dictx_{VERSION}_{arch}.dmg`
  - `macos/latest/Dictx_{arch}.dmg` (stable pointer, refreshed by CI on
    every successful release)
- Public bucket (`R2_PUBLIC_BUCKET`, served at
  `https://updates.dictx.splitlabs.io`): updater artifacts and feed, safe to
  be world-readable — obtaining the app this way does not grant a receipt.
  - `macos/v{VERSION}/Dictx_{arch}.app.tar.gz` and `.app.tar.gz.sig`
  - `latest.json` — Tauri v2 static updater JSON:
    `{version, notes, pub_date, platforms: {"darwin-aarch64": {...}, "darwin-x86_64": {...}}}`
    where `signature` is the literal contents of the `.sig` file
- `arch` is `aarch64` (`aarch64-apple-darwin`) or `x64` (`x86_64-apple-darwin`)

## One-time infrastructure setup

1. Create two Cloudflare R2 buckets, e.g. `dictx-releases-private` and
   `dictx-releases-public`.
2. Attach the custom domain `updates.dictx.splitlabs.io` to the **public**
   bucket only (Cloudflare R2 → bucket → Settings → Custom Domains). Never
   attach a public domain to the private bucket.
3. Create two R2 API tokens:
   - **CI token**: Object Read & Write on both buckets. GitHub Actions only.
   - **Vercel token**: Object Read on the private bucket only. If the
     Vercel environment leaks, this token cannot replace DMGs or rewrite
     `latest.json`.
4. Record the account id and each token's access key id and secret.
5. Add GitHub Actions repository secrets, using the CI token (used by
   `.github/workflows/release.yml` and `.github/workflows/build.yml`):
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_PRIVATE_BUCKET`
   - `R2_PUBLIC_BUCKET`
6. Add Vercel environment variables for the `landing` project, using the
   read-only Vercel token and scoped to **Production only**. A Preview
   deployment in Stripe test mode with these set would hand the real DMG to
   test-card checkouts; point Preview at a separate bucket holding a dummy
   file if you need to test downloads there, and keep Vercel Deployment
   Protection on for previews. Used by `/api/download/macos.js` and
   `/api/_lib/r2-presign.js` to presign private-bucket GET URLs:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_PRIVATE_BUCKET`
   - (Vercel does not need `R2_PUBLIC_BUCKET`; it never touches the public
     bucket)
7. Redeploy the `landing` Vercel project — env vars apply at deploy time
   only.
8. Confirm `src-tauri/tauri.conf.json`'s updater `endpoints` point at
   `https://updates.dictx.splitlabs.io/latest.json` and the updater
   `pubkey` matches the CI signing key (`TAURI_SIGNING_PRIVATE_KEY`).

Stripe setup (unchanged from the retired license flow): see
[landing/README.md](../../landing/README.md) for live object ids and
Stripe environment variables.

## Validation checklist

Automated:

- `landing/tests/download.test.js` passes: paid session → `200` with a
  presigned URL expiring in 300s; unpaid → `402`; refunded → `410`; unknown
  or malformed session id → `404`; wrong method → `405`; missing Stripe or
  R2 config → `503`; no Stripe call is made for a malformed session id.
- `landing/tests/billing.test.js` still passes (the `/buy` redirect logic is
  unchanged).
- `node --test landing/tests/`

Manual, after secrets are set and a release has published to R2 (do this in
Stripe test mode against a non-production deployment, or with a real $29
purchase if testing production):

1. Trigger a purchase through `/buy` (or a direct test-mode Checkout
   Session) and complete payment.
2. Confirm the redirect to `/buy/success?session_id=...` returns a working
   download link and the DMG downloads and opens.
3. Reload `/buy/success?session_id=...` (bookmark re-download) and confirm
   a fresh presigned URL is issued for the same session.
4. Go to `/download`, paste the same Checkout Session id, and confirm it
   also issues a working download link.
5. Refund or cancel the test charge in Stripe and confirm both `/buy/success`
   and `/download` now respond `410` for that session id.
6. Launch the installed app and confirm it checks
   `https://updates.dictx.splitlabs.io/latest.json` and can update in place
   (built-from-source and purchased installs both update from this feed).

## Risks (carried over from the plan)

- The Checkout Session id is a bearer re-download token: it must never be
  logged, sent as a referrer, or captured by analytics on the success or
  download pages. For that reason `/buy/success` loads no analytics, so
  DataFast no longer attributes revenue from that page. Vercel request logs
  still record the id from the `/buy/success` page URL; limit log access
  accordingly.
- A paid session whose charge Stripe does not return is refused
  (`provider_invalid`, 502) rather than assumed unrefunded. Confirm with the
  first test-mode purchase that Managed Payments sessions expand
  `payment_intent.latest_charge`; if they do not, every download fails.
- A 100% promotion code yields a free download (`no_payment_required`).
  Keep promotion codes off on the Payment Link unless that is intended.
- Rate limiting is in memory per serverless instance. Add a Vercel WAF
  rate-limit rule on `/api/download/*` before launch.
- PR and manual test builds are unsigned, so signed DMGs never appear in
  public workflow run artifacts.
- The public update bundle (`.app.tar.gz`) is not access-controlled, so a
  determined user can obtain a working, auto-updating build without paying.
  This is accepted under Pattern A: GPL already permits redistribution, and
  the paid product is the signed, notarized, one-click DMG plus support, not
  a technical restriction.
