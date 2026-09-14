import { trackAICrawlerRequest } from "@datafast/ai-crawl";

// Provided by the Vercel runtime; declared so type-checking the middleware
// does not require @types/node in this dependency-free static project.
declare const process: { env: Record<string, string | undefined> };

/**
 * DataFast bot traffic (datafa.st/docs/bot-traffic-tracking) as Vercel
 * Routing Middleware for this static project.
 *
 * A local user-agent check on document requests; only known AI crawlers
 * produce one background POST, scheduled with context.waitUntil and never
 * awaited, so humans never trigger a network call and no response waits on
 * DataFast. The request always passes through to the static file or function
 * untouched. No-op until DATAFAST_WEBSITE_ID is set.
 */
// Edge runtime on purpose. Vercel warns that Edge is deprecated for Routing
// Middleware, but on this static "Other" project the Node.js runtime served
// every matched page as a 500 on preview, while Edge served 200.
export const config = {
  matcher: [
    "/((?!api/|js/|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?|ttf)$).*)",
  ],
};

export default function middleware(
  request: Request,
  context: { waitUntil(promise: Promise<unknown>): void },
) {
  const websiteId = process.env.DATAFAST_WEBSITE_ID?.trim();
  if (websiteId) trackAICrawlerRequest(request, context, { websiteId });
  // Pass through untouched. This is exactly what next() from @vercel/functions
  // returns, so the pass-through does not depend on runtime defaults.
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
