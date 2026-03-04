# Dictx Commerce Migration (Gumroad -> Professional Checkout)

This runbook moves Dictx Pro sales to `https://dictx.splitlabs.io/buy` while keeping the OSS/free path unchanged.

## Scope

- Product: Dictx Pro (signed binaries + auto-updates)
- Price: `$29` one-time
- Free version: unchanged (GPL source build)

## 1) Domain + Checkout

1. Create `dictx.splitlabs.io` as your Vercel custom domain and serve the landing site there.
2. Deploy the dedicated Vercel landing project from `landing/`:

- Root Directory: `landing`
- Framework Preset: `Other`
- Build Command: empty
- Output Directory: empty

3. Configure branded checkout:

- Product name: `Dictx Pro`
- Offer copy: `Signed binaries, auto-updates, and direct support`
- Price: `USD 29 one-time`
- Success URL: `https://dictx.splitlabs.io/buy/success?checkout_id={CHECKOUT_ID}`

3. Enable customer portal for:

- Receipts/invoices
- Download access
- Billing/profile management

## 2) License + Entitlements

Define one entitlement key:

- `dictx_pro`

Entitlement grants:

- Access to release downloads
- Auto-update eligibility
- Priority support queue (if enabled)

Activation flow in app:

- User opens **Settings -> About -> Upgrade to Dictx Pro**
- User enters license key (`polar_cl_...`)
- App verifies against `https://dictx.splitlabs.io/api/pro/verify`
- On success, app stores active entitlement and enables updater checks

## 3) Webhook Processing

Use a webhook endpoint to sync purchases to your entitlement store.

Events to handle:

- `order.paid` (grant entitlement)
- `subscription.active` (if you add annual support plans)
- `order.refunded` or `subscription.canceled` (revoke entitlement)

Implementation reference:

- [scripts/commerce/polar-webhook-example.ts](/Users/nyk/repos/dictx/scripts/commerce/polar-webhook-example.ts)

## 4) App + Repo Link Updates

Completed in this repo:

- `README` Pro links now point to `https://dictx.splitlabs.io/buy`
- In-app CTA links point to a shared `PRO_PURCHASE_URL`
- GitHub funding link points to `https://dictx.splitlabs.io/buy`

## 5) Migration Messaging

1. Send announcement to existing buyers.
2. Publish FAQ with key points:

- Existing licenses remain honored
- New purchases go through `https://dictx.splitlabs.io/buy` (redirect target managed in `landing/vercel.json`)
- Support contact stays unchanged

3. Use template:

- [customer-migration-email.md](/Users/nyk/repos/dictx/docs/commercial/customer-migration-email.md)

## 6) Validation Checklist

Before launch:

- Checkout success flow creates receipt + customer record
- Webhook signature validation works in production
- `dictx_pro` entitlement is granted/revoked correctly
- `landing/api/pro/verify` returns `{ active: true }` only for valid paid checkout key
- Customer portal access works from receipt email
- Purchase links from app + README resolve to `https://dictx.splitlabs.io/buy`

After launch:

- Track conversion rate from in-app CTA
- Track support tickets tagged `billing` and `license`
