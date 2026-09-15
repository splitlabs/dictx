# Dictx Commerce: Stripe Managed Payments

Dictx Pro is sold at `https://dictx.splitlabs.io/buy` through Stripe Managed Payments, where Link is the seller of record. The OSS/free path is unchanged. Polar was retired on 2026-09-15.

## Scope

- Product: Dictx Pro (signed binaries, in-app auto-updates, priority support)
- Price: `$29` one-time (tax added at checkout where applicable)
- Free version: unchanged (GPL source build)

## Checkout

- `/buy` redirects to the live Payment Link, or shows "checkout unavailable" if Stripe is not fully configured.
- After payment Stripe redirects to `https://dictx.splitlabs.io/buy/success?session_id={CHECKOUT_SESSION_ID}`.
- The success page calls `/api/pro/license`, which verifies the Checkout Session and shows the `dxp-` license key.

Setup, live object ids, and environment variables: [landing/README.md](../../landing/README.md).

## License + Entitlements

Activation flow in the app:

- User opens **Settings -> About -> Activate Dictx Pro** and enters the `dxp-` key.
- The app verifies against `https://dictx.splitlabs.io/api/pro/verify`.
- On success, the app stores the entitlement and enables updater checks.
- The app re-verifies on refresh; a refund or dispute turns Pro off, a Stripe outage keeps the current state.
- Keys from the retired Polar checkout (`lk_...`, `polar_cl_...`) answer `410`, so apps that already activated one keep Pro. New activations with them fail.
- Early-adopter promo: the first 100 unique installs can auto-claim free Pro via `POST /api/pro/early-access/claim`.

No webhook is needed: entitlement comes from re-verifying the live Checkout Session.

## Validation Checklist

- `/buy` redirects to the Stripe Payment Link (307).
- A completed checkout lands on `/buy/success` and shows a `dxp-` key.
- `/api/pro/verify` returns `{ active: true }` for that key and `{ active: false }` for a tampered one.
- `/api/pro/license` returns `404` for an unknown session and `410` for a refunded one.
- `landing/tests/billing.test.js` passes.
