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
- `/buy` redirects to Polar checkout
- `/api/pro/verify` validates a Polar license key (`polar_cl_...`) for in-app Pro activation

## Environment Variables (Vercel)

- `POLAR_ACCESS_TOKEN`: Polar API token
- `POLAR_DICTX_PRODUCT_IDS`: optional comma-separated product IDs allowed for Dictx Pro activation
- `POLAR_API_BASE`: optional override (defaults to `https://api.polar.sh/v1`)

## Polar Checkout Success URL

Set the product checkout success URL to:

- `https://dictx.splitlabs.io/buy/success?checkout_id={CHECKOUT_ID}`
