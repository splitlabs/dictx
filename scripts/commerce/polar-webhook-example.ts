import { createHmac, timingSafeEqual } from "node:crypto";

type PolarEventData = {
  id?: string | number;
  product_id?: string | number;
  customer_email?: string;
  metadata?: Record<string, string>;
};

type PolarWebhookEvent = {
  type: string;
  data: PolarEventData;
};

type EntitlementChange = {
  customerEmail: string;
  entitlement: "dictx_pro";
  active: boolean;
  sourceEvent: string;
};

const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "";
const SIGNATURE_HEADER =
  process.env.POLAR_SIGNATURE_HEADER ?? "polar-signature";
const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);

const verifySignature = (payload: string, signatureHeader: string): boolean => {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;

  const computed = createHmac("sha256", WEBHOOK_SECRET)
    .update(payload, "utf8")
    .digest("hex");

  const provided = signatureHeader.trim();
  if (computed.length !== provided.length) return false;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(provided));
};

const toEntitlementChange = (
  event: PolarWebhookEvent,
): EntitlementChange | null => {
  const customerEmail =
    event.data.customer_email ?? event.data.metadata?.customer_email ?? "";
  if (!customerEmail) return null;

  if (event.type === "order.paid") {
    return {
      customerEmail,
      entitlement: "dictx_pro",
      active: true,
      sourceEvent: event.type,
    };
  }

  if (
    event.type === "order.refunded" ||
    event.type === "subscription.canceled"
  ) {
    return {
      customerEmail,
      entitlement: "dictx_pro",
      active: false,
      sourceEvent: event.type,
    };
  }

  return null;
};

const persistEntitlementChange = async (
  change: EntitlementChange,
): Promise<void> => {
  // TODO: Replace with DB write (e.g. Postgres/Supabase/SQLite)
  console.log(
    JSON.stringify({
      action: "entitlement_sync",
      ...change,
      at: new Date().toISOString(),
    }),
  );
};

Bun.serve({
  port: PORT,
  routes: {
    "/webhooks/polar": async (req: Request) => {
      const rawBody = await req.text();
      const signature = req.headers.get(SIGNATURE_HEADER) ?? "";

      if (!verifySignature(rawBody, signature)) {
        return new Response("invalid signature", { status: 401 });
      }

      let event: PolarWebhookEvent;
      try {
        event = JSON.parse(rawBody) as PolarWebhookEvent;
      } catch (_error) {
        return new Response("invalid json", { status: 400 });
      }

      const change = toEntitlementChange(event);
      if (change) {
        await persistEntitlementChange(change);
      }

      return new Response("ok", { status: 200 });
    },
  },
  fetch() {
    return new Response("not found", { status: 404 });
  },
});

console.log(`Polar webhook example listening on http://localhost:${PORT}`);
