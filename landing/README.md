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
- `/buy` runs `api/buy.js`: the Stripe Payment Link once Stripe is fully configured, otherwise the Polar checkout
- `/buy/success` shows the license key. Stripe purchases fetch it from `/api/pro/license`; earlier Polar purchases read it from the URL
- `/api/pro/license?session_id=cs_live_...` issues the `dxp-` license key for a verified Stripe purchase
- `/api/pro/verify` validates `dxp-` keys against Stripe and `lk_...` / `polar_cl_...` keys against Polar
- `/api/pro/early-access/claim` grants free Pro for the first 100 unique installs
- `/js/script.cookieless.js` and `/api/events` proxy DataFast first-party; `middleware.ts` reports AI crawler requests

## Stripe Managed Payments setup

Link is the seller of record, as for the other SplitLabs products on the same Stripe account.

1. Create the product **Dictx Pro** with a tax code Stripe labels "Eligible for Managed Payments" (downloadable software), and a one-time price of $29 USD.
2. Create a Payment Link for that price with Managed Payments on and quantity fixed at 1.
3. In the Payment Link, set **After payment** to redirect to `https://dictx.splitlabs.io/buy/success?session_id={CHECKOUT_SESSION_ID}`.
4. Create a restricted live key (`rk_live_...`) with read access to Checkout Sessions, Payment Intents, and Charges only.
5. Set the Stripe environment variables below in Vercel production.
6. Redeploy production once all four are set: Vercel applies environment variables only at deploy time. `/buy` then sends buyers to the Payment Link.

A purchase earns a key only when the session is live, complete and paid (or fully discounted), holds exactly one Dictx Pro price at quantity 1, and its charge is neither refunded nor disputed. The app re-verifies keys, so a refund or dispute turns Pro off on its next check. A Stripe outage returns an error, which the app treats as "keep current state".

If a buyer loses the key, find their Checkout Session id in Stripe and send them `https://dictx.splitlabs.io/buy/success?session_id=<id>`. It reissues the same key.

## Environment Variables (Vercel)

Stripe (all required before `/buy` switches):

- `STRIPE_SECRET_KEY`: restricted live read key (`rk_live_...`), Sensitive
- `DICTX_STRIPE_PRICE_ID`: the Dictx Pro price id (`price_...`)
- `DICTX_STRIPE_PAYMENT_LINK`: the canonical live Payment Link (`https://buy.stripe.com/...`, never `/test_`)
- `DICTX_LICENSE_SECRET`: 32+ character signing secret for license keys, Sensitive. **Rotating it invalidates every issued key.**
- `STRIPE_COMMERCE_MODE`: optional, `test` in non-production only; production always runs live

DataFast:

- `DATAFAST_WEBSITE_ID`: the public website id; enables crawler tracking in `middleware.ts`

Polar (verifies keys from earlier purchases; keep until those customers are migrated):

- `POLAR_ACCESS_TOKEN`: Polar API token
- `POLAR_ORGANIZATION_ID`: Polar organization id (`org_...`) used by license-key validation
- `POLAR_DICTX_BENEFIT_IDS`: optional comma-separated benefit IDs allowed for Dictx Pro activation
- `POLAR_DICTX_PRODUCT_IDS`: optional legacy fallback for checkout-key migration (`polar_cl_...`)
- `POLAR_API_BASE`: optional override (defaults to `https://api.polar.sh/v1`)

Rate limits and early access:

- `PRO_VERIFY_RATE_LIMIT_WINDOW_MS`: optional API rate-limit window
- `PRO_VERIFY_RATE_LIMIT_MAX`: optional API rate-limit max requests per client per window
- `UPSTASH_REDIS_REST_URL`: Upstash REST URL for early-access claim counter
- `UPSTASH_REDIS_REST_TOKEN`: Upstash REST token for early-access claim counter
- `DICTX_PRO_EARLY_ACCESS_LIMIT`: optional free-claim cap (defaults to `100`)
- `PRO_EARLY_ACCESS_RATE_LIMIT_WINDOW_MS`: optional rate-limit window for claim API
- `PRO_EARLY_ACCESS_RATE_LIMIT_MAX`: optional rate-limit max for claim API

## Tests

```bash
node --test landing/tests/
```
