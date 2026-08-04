/**
 * Cloudflare Pages catch-all.
 * Privacy-first: no image proxy / no server-side import.
 * Images are loaded entirely in the user's browser.
 */
export async function onRequest(context: { next: () => Promise<Response> }) {
  return context.next();
}
