# Dictx Commerce Migration (Gumroad -> Professional Checkout)

This runbook moves Dictx Pro sales to `https://buy.splitlabs.io` while keeping the OSS/free path unchanged.

## Scope

- Product: Dictx Pro (signed binaries + auto-updates)
- Price: `$29` one-time
- Free version: unchanged (GPL source build)

## 1) Domain + Checkout

1. Create `buy.splitlabs.io` DNS record and point it to your checkout provider.
2. Configure branded checkout:

- Product name: `Dictx Pro`
- Offer copy: `Signed binaries, auto-updates, and direct support`
- Price: `USD 29 one-time`

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

- `README` Pro links now point to `https://buy.splitlabs.io`
- In-app CTA links point to a shared `PRO_PURCHASE_URL`
- GitHub funding link points to `https://buy.splitlabs.io`

## 5) Migration Messaging

1. Send announcement to existing buyers.
2. Publish FAQ with key points:

- Existing licenses remain honored
- New purchases happen at `buy.splitlabs.io`
- Support contact stays unchanged

3. Use template:

- [customer-migration-email.md](/Users/nyk/repos/dictx/docs/commercial/customer-migration-email.md)

## 6) Validation Checklist

Before launch:

- Checkout success flow creates receipt + customer record
- Webhook signature validation works in production
- `dictx_pro` entitlement is granted/revoked correctly
- Customer portal access works from receipt email
- Purchase links from app + README resolve to `buy.splitlabs.io`

After launch:

- Track conversion rate from in-app CTA
- Track support tickets tagged `billing` and `license`
