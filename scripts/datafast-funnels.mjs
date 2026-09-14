#!/usr/bin/env node
/**
 * Create the Dictx landing's DataFast conversion funnels through the Account API.
 *
 * Funnels are dashboard objects, not code, so this is the one place their
 * definitions live in the repo. Idempotent: existing funnels (by name) are left
 * alone and reported; nothing is ever deleted or updated. Run again after adding
 * a funnel below.
 *
 *   DATAFAST_ADMIN_TOKEN=dft_... node scripts/datafast-funnels.mjs [--dry-run]
 *
 * The token comes from DataFast: Account settings -> API, scopes websites:read,
 * funnels:read, funnels:write. It is an account credential: never commit it,
 * never put it in Vercel; it is only needed on the machine running this script.
 *
 * Step semantics (datafa.st/docs/api/account/funnels/create): pageview steps
 * match a URL path, goal steps match a goal *name* only. The landing is
 * static HTML, so goals come from data-fast-goal attributes and the buy-click
 * handler in landing/index.html.
 */

const API = "https://datafa.st/api/v1/admin";
const DOMAIN = process.env.DATAFAST_SITE_DOMAIN ?? "dictx.splitlabs.io";
const DRY_RUN = process.argv.includes("--dry-run");

// Names are stable identifiers: renaming one here creates a second funnel.
export const FUNNELS = [
  {
    // buy_pro_click is sent by the landing's click handler; payment is the
    // provider goal DataFast emits once the payment provider is connected.
    name: "Landing to Pro purchase",
    steps: [
      { name: "Landing", type: "pageview", url: "/" },
      { name: "Buy Pro clicked", type: "goal", goalName: "buy_pro_click" },
      { name: "Payment", type: "goal", goalName: "payment" },
    ],
  },
  {
    name: "Pricing to purchase",
    steps: [
      { name: "Saw pricing", type: "goal", goalName: "scroll_pricing" },
      { name: "Buy Pro clicked", type: "goal", goalName: "buy_pro_click" },
      { name: "Payment", type: "goal", goalName: "payment" },
      {
        name: "License key copied",
        type: "goal",
        goalName: "license_key_copied",
      },
    ],
  },
  {
    name: "Landing to download",
    steps: [
      { name: "Landing", type: "pageview", url: "/" },
      { name: "Download DMG", type: "goal", goalName: "download_dmg" },
    ],
  },
];

async function api(path, init = {}) {
  const token = process.env.DATAFAST_ADMIN_TOKEN;
  if (!token) throw new Error("DATAFAST_ADMIN_TOKEN is not set");
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(
        json,
      ).slice(0, 300)}`,
    );
  }
  return json;
}

async function main() {
  const websites = (await api("/websites")).data ?? [];
  const site = websites.find(
    (w) => (w.domain ?? w.hostname ?? "").replace(/^www\./, "") === DOMAIN,
  );
  if (!site) {
    throw new Error(
      `no DataFast website for ${DOMAIN}; have: ${websites
        .map((w) => w.domain ?? w.hostname)
        .join(", ")}`,
    );
  }
  const websiteId = site._id ?? site.id;
  const existing = (await api(`/websites/${websiteId}/funnels`)).data ?? [];
  const byName = new Map(existing.map((f) => [f.name, f]));

  for (const funnel of FUNNELS) {
    if (byName.has(funnel.name)) {
      console.log(
        `= ${funnel.name} (exists, ${
          byName.get(funnel.name).steps?.length ?? "?"
        } steps)`,
      );
      continue;
    }
    if (DRY_RUN) {
      console.log(
        `+ ${funnel.name} (would create: ${funnel.steps
          .map((s) => s.goalName ?? s.url)
          .join(" -> ")})`,
      );
      continue;
    }
    await api(`/websites/${websiteId}/funnels`, {
      method: "POST",
      body: JSON.stringify(funnel),
    });
    console.log(`+ ${funnel.name} (created)`);
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
