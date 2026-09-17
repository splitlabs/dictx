# Dictx Landing (Vercel)

Deploy this folder as a separate Vercel project.

## Vercel Settings

- Root Directory: `landing`
- Framework Preset: `Other`
- Build Command: _(empty)_
- Output Directory: _(empty)_

## Domain

Attach `dictx.splitlabs.io` to this Vercel project.

## Routes

- `/` serves `landing/index.html`
- `/buy` runs `api/buy.js`: redirects to the Stripe Payment Link, or shows "checkout unavailable" if Stripe is not fully configured
- `/buy/success?session_id=cs_live_...` shows Apple Silicon / Intel download buttons that call `/api/download/macos`. Bookmark this page to re-download later
- `/download` lets a buyer paste that page's URL (or the bare `cs_live_...` id) to get a fresh download link, plus a `/buy` CTA and a link to build from source
- `POST /api/download/macos` `{ session_id, arch }` (`arch` is `aarch64` or `x64`, default `aarch64`) verifies the Stripe Checkout Session server-side and returns a 300-second presigned R2 URL for the signed DMG. No license keys: the session id is the re-download token, and it is never logged
- `/js/script.cookieless.js` and `/api/events` proxy DataFast first-party; `middleware.ts` reports AI crawler requests (Edge runtime: the Node.js runtime served every page as 500 on this project)

## Stripe Managed Payments

Link is the seller of record, as for the other SplitLabs products on the same Stripe account (`acct_1U0p1zIOmsupAvc3`).

Live objects:

- Product `prod_VGAwMgXh0UgB0w` "Dictx Pro", tax code `txcd_10202000` (Downloadable Software)
- Price `price_1UFeb2IOmsupAvc3VoCin47h`, $29 USD one-time
- Payment Link `plink_1UFebaIOmsupAvc3m6DV45ul`, Managed Payments on, after payment redirects to `https://dictx.splitlabs.io/buy/success?session_id={CHECKOUT_SESSION_ID}`

A purchase earns a download only when the session is live, complete and paid (or fully discounted), holds exactly one Dictx Pro price at quantity 1, and its charge is neither refunded nor disputed. There is no license key and no in-app entitlement: the Checkout Session id itself is the re-download token, verified against Stripe on every request.

If a buyer loses their success-page link, find their Checkout Session id in Stripe and send them `https://dictx.splitlabs.io/download` to paste it in, or `https://dictx.splitlabs.io/buy/success?session_id=<id>` directly.

To set up again from scratch: create the product with a Managed Payments–eligible tax code, a one-time price, and a Payment Link with Managed Payments on and the redirect above; create a restricted live key with read access to Checkout Sessions, Payment Intents, and Charges; set the variables below; then **redeploy production**, because Vercel applies environment variables only at deploy time.

## R2 (private DMG storage)

The signed macOS DMGs live in a private Cloudflare R2 bucket, keyed
`macos/latest/Dictx_{arch}.dmg` (`arch` is `aarch64` or `x64`). `/api/download/macos`
presigns a 300-second GET URL with `api/_lib/r2-presign.js`, a small SigV4
query-auth implementation using only `node:crypto` (verified against the AWS
documented presigned-URL test vector in `tests/download.test.js`), so no AWS
SDK or presigning dependency is needed for one signature.

## Environment Variables (Vercel)

Stripe (all required, otherwise `/buy` and downloads show "unavailable"):

- `STRIPE_SECRET_KEY`: restricted live read key (`rk_live_...`), Sensitive
- `DICTX_STRIPE_PRICE_ID`: the Dictx Pro price id (`price_...`)
- `DICTX_STRIPE_PAYMENT_LINK`: the canonical live Payment Link (`https://buy.stripe.com/...`, never `/test_`)
- `STRIPE_COMMERCE_MODE`: optional, `test` in non-production only; production always runs live

R2 (all required, otherwise downloads answer 503):

- `R2_ACCOUNT_ID`: Cloudflare account id
- `R2_ACCESS_KEY_ID`: R2 API token access key id, Sensitive
- `R2_SECRET_ACCESS_KEY`: R2 API token secret, Sensitive
- `R2_PRIVATE_BUCKET`: the private bucket name holding the DMGs

DataFast:

- `DATAFAST_WEBSITE_ID`: the public website id; enables crawler tracking in `middleware.ts`

Rate limits:

- `DOWNLOAD_RATE_LIMIT_WINDOW_MS`: optional API rate-limit window for `/api/download/macos`
- `DOWNLOAD_RATE_LIMIT_MAX`: optional API rate-limit max requests per client per window

## Tests

```bash
node --test landing/tests/
```
