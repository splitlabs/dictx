/**
 * Dictx Pro purchases through Stripe Managed Payments (Link is the seller of
 * record), verified server-side from the Checkout Session.
 *
 * Fail-closed by construction: a purchase counts only when the session is in
 * the expected mode, complete and paid, contains exactly one Dictx Pro price
 * at quantity 1, and its charge is neither refunded nor disputed. Anything the
 * checker does not recognise is a refusal, never an entitlement.
 *
 * Test mode exists for non-production only: VERCEL_ENV=production forces live,
 * whatever STRIPE_COMMERCE_MODE says, so no production configuration can
 * accept a test session.
 */
const STRIPE_API = "https://api.stripe.com/v1";

const commerceMode = () => {
  if (process.env.VERCEL_ENV === "production") return "live";
  return (process.env.STRIPE_COMMERCE_MODE || "").trim() === "test"
    ? "test"
    : "live";
};

const sessionIdPattern = (mode = commerceMode()) =>
  mode === "test"
    ? /^cs_(?:live|test)_[A-Za-z0-9]{10,200}$/
    : /^cs_live_[A-Za-z0-9]{10,200}$/;

const secretKeyPattern = (mode = commerceMode()) =>
  mode === "test"
    ? /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+$/
    : /^(?:sk|rk)_live_[A-Za-z0-9_]+$/;

/** A public Payment Link must be a canonical live buy.stripe.com link. */
const isCanonicalPaymentLink = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "buy.stripe.com" &&
      /^\/[A-Za-z0-9]+$/.test(url.pathname) &&
      !url.pathname.startsWith("/test_") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch (_error) {
    return false;
  }
};

const stripeConfig = () => {
  const mode = commerceMode();
  const secretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  const priceId = (process.env.DICTX_STRIPE_PRICE_ID || "").trim();
  const paymentLink = (process.env.DICTX_STRIPE_PAYMENT_LINK || "").trim();
  const missing = [];
  if (!secretKeyPattern(mode).test(secretKey))
    missing.push("STRIPE_SECRET_KEY");
  if (!/^price_[A-Za-z0-9]+$/.test(priceId))
    missing.push("DICTX_STRIPE_PRICE_ID");
  return {
    mode,
    secretKey,
    priceId,
    paymentLink: isCanonicalPaymentLink(paymentLink) ? paymentLink : "",
    ready: missing.length === 0,
    missing,
  };
};

const stripeGet = async (path, secretKey) => {
  let response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
  } catch (_error) {
    return { status: 0 };
  }
  if (!response.ok) return { status: response.status };
  try {
    return { status: 200, body: await response.json() };
  } catch (_error) {
    return { status: 0 };
  }
};

const fail = (reason) => ({ ok: false, reason });

const classifyPurchase = ({
  session,
  lineItems,
  priceId,
  expectedLivemode,
}) => {
  if (!session || typeof session !== "object") return fail("provider_invalid");
  if (session.livemode !== expectedLivemode) return fail("test_session");

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  if (session.status !== "complete" || !paid) return fail("unpaid");

  const items = Array.isArray(lineItems?.data) ? lineItems.data : [];
  if (lineItems?.has_more || items.length !== 1) return fail("wrong_order");
  const [item] = items;
  if (item?.price?.id !== priceId || item.quantity !== 1) {
    return fail("wrong_order");
  }

  const paymentIntent =
    session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : null;
  const charge =
    paymentIntent &&
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
  // A paid session must expose its charge, or refunds and disputes cannot be
  // checked; refuse rather than assume. Free (100% discount) sessions have none.
  if (session.payment_status === "paid" && !charge) {
    return fail("provider_invalid");
  }
  if (
    charge &&
    (charge.refunded === true ||
      charge.disputed === true ||
      Number(charge.amount_refunded) > 0)
  ) {
    return fail("refunded");
  }

  return { ok: true, sessionId: session.id };
};

const purchaseForSession = async (sessionId, config = stripeConfig()) => {
  if (!sessionIdPattern(config.mode).test(sessionId || "")) {
    return fail("malformed_session");
  }
  const id = encodeURIComponent(sessionId);
  const sessionResult = await stripeGet(
    `/checkout/sessions/${id}?expand%5B%5D=payment_intent.latest_charge`,
    config.secretKey,
  );
  if (sessionResult.status === 404) return fail("invalid_session");
  if (sessionResult.status !== 200) return fail("provider_unavailable");
  if (sessionResult.body?.id !== sessionId) return fail("provider_invalid");

  const itemsResult = await stripeGet(
    `/checkout/sessions/${id}/line_items?limit=5&expand%5B%5D=data.price`,
    config.secretKey,
  );
  if (itemsResult.status !== 200) return fail("provider_unavailable");

  return classifyPurchase({
    session: sessionResult.body,
    lineItems: itemsResult.body,
    priceId: config.priceId,
    expectedLivemode: config.mode === "live",
  });
};

module.exports = {
  classifyPurchase,
  commerceMode,
  isCanonicalPaymentLink,
  purchaseForSession,
  sessionIdPattern,
  stripeConfig,
};
