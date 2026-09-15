/**
 * GET /buy (rewritten here by vercel.json)
 *
 * Sends buyers to the Stripe Managed Payments checkout. It fails closed: if
 * the restricted key, the Dictx Pro price, the license signing secret, or a
 * canonical live Payment Link is missing or malformed, buyers see a short
 * "checkout unavailable" page instead of a checkout that could take money it
 * cannot turn into a license.
 */
const { stripeConfig } = require("./_lib/stripe-purchase");

const UNAVAILABLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Checkout unavailable · Dictx</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="panel hero">
        <h1>Checkout is temporarily unavailable</h1>
        <p class="lede">Please try again in a few minutes.</p>
        <p><a class="btn ghost" href="/">Back to Dictx</a></p>
      </section>
    </main>
  </body>
</html>
`;

const checkoutUrl = (config = stripeConfig()) =>
  config.ready && config.paymentLink ? config.paymentLink : "";

const handler = (_req, res) => {
  res.setHeader("cache-control", "no-store");
  const url = checkoutUrl();
  if (url) {
    res.redirect(307, url);
    return null;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(503).send(UNAVAILABLE_HTML);
  return null;
};

module.exports = handler;
module.exports.checkoutUrl = checkoutUrl;
