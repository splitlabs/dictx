/**
 * GET /buy (rewritten here by vercel.json)
 *
 * Sends buyers to the Stripe Managed Payments checkout once Stripe is fully
 * configured: a canonical live Payment Link, a valid restricted key, the
 * Dictx Pro price, and the license signing secret. Until all four are in
 * place it keeps sending buyers to the existing Polar checkout, so deploying
 * this change never breaks sales and a half-configured Stripe setup never
 * takes money it cannot turn into a license.
 */
const { stripeConfig } = require("./_lib/stripe-purchase");

const POLAR_CHECKOUT_URL =
  "https://buy.polar.sh/polar_cl_lchYpu4Y5BWTc1AbO05evqEZu3dXBAgvdenEy1PECGt";

const checkoutUrl = (config = stripeConfig()) =>
  config.ready && config.paymentLink ? config.paymentLink : POLAR_CHECKOUT_URL;

const handler = (_req, res) => {
  res.setHeader("cache-control", "no-store");
  res.redirect(307, checkoutUrl());
  return null;
};

module.exports = handler;
module.exports.checkoutUrl = checkoutUrl;
module.exports.POLAR_CHECKOUT_URL = POLAR_CHECKOUT_URL;
