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
 * DataFast. Returning nothing passes the request through to the static file
 * or function untouched. No-op until DATAFAST_WEBSITE_ID is set.
 */
// Node.js runtime: Vercel deprecated Edge for Routing Middleware.
export const config = {
  runtime: "nodejs",
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
}
