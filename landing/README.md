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
- `/buy/success?session_id=cs_live_...` shows the license key, fetched from `/api/pro/license`
- `/api/pro/license?session_id=cs_live_...` issues the `dxp-` license key for a verified Stripe purchase
- `/api/pro/verify` validates `dxp-` keys against Stripe. Keys from the retired Polar checkout (`lk_...`, `polar_cl_...`) answer `410`, so apps that already activated one keep Pro
- `/api/pro/early-access/claim` answers `404 early_access_closed`. The "first 100 installs get Pro free" offer is retired: its claim store was never provisioned, so it only ever returned 500. Installed apps read 404 as "no grant" and carry on, so the route stays instead of 404ing as a missing file
- `/js/script.cookieless.js` and `/api/events` proxy DataFast first-party; `middleware.ts` reports AI crawler requests (Edge runtime: the Node.js runtime served every page as 500 on this project)

## Stripe Managed Payments

Link is the seller of record, as for the other SplitLabs products on the same Stripe account (`acct_1U0p1zIOmsupAvc3`).

Live objects:

- Product `prod_VGAwMgXh0UgB0w` "Dictx Pro", tax code `txcd_10202000` (Downloadable Software)
- Price `price_1UFeb2IOmsupAvc3VoCin47h`, $29 USD one-time
- Payment Link `plink_1UFebaIOmsupAvc3m6DV45ul`, Managed Payments on, after payment redirects to `https://dictx.splitlabs.io/buy/success?session_id={CHECKOUT_SESSION_ID}`

A purchase earns a key only when the session is live, complete and paid (or fully discounted), holds exactly one Dictx Pro price at quantity 1, and its charge is neither refunded nor disputed. The app re-verifies keys, so a refund or dispute turns Pro off on its next check. A Stripe outage returns an error, which the app treats as "keep current state".

If a buyer loses the key, find their Checkout Session id in Stripe and send them `https://dictx.splitlabs.io/buy/success?session_id=<id>`. It reissues the same key.

To set up again from scratch: create the product with a Managed Payments–eligible tax code, a one-time price, and a Payment Link with Managed Payments on and the redirect above; create a restricted live key with read access to Checkout Sessions, Payment Intents, and Charges; set the variables below; then **redeploy production**, because Vercel applies environment variables only at deploy time.

## Environment Variables (Vercel)

Stripe (all required, otherwise `/buy` shows "checkout unavailable"):

- `STRIPE_SECRET_KEY`: restricted live read key (`rk_live_...`), Sensitive
- `DICTX_STRIPE_PRICE_ID`: the Dictx Pro price id (`price_...`)
- `DICTX_STRIPE_PAYMENT_LINK`: the canonical live Payment Link (`https://buy.stripe.com/...`, never `/test_`)
- `DICTX_LICENSE_SECRET`: 32+ character signing secret for license keys, Sensitive. **Rotating it invalidates every issued key.**
- `STRIPE_COMMERCE_MODE`: optional, `test` in non-production only; production always runs live

DataFast:

- `DATAFAST_WEBSITE_ID`: the public website id; enables crawler tracking in `middleware.ts`

Rate limits:

- `PRO_VERIFY_RATE_LIMIT_WINDOW_MS`: optional API rate-limit window
- `PRO_VERIFY_RATE_LIMIT_MAX`: optional API rate-limit max requests per client per window

## Tests

```bash
node --test landing/tests/billing.test.js
```
