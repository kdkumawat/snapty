/**
 * The app's brand color: selection frames, active tools, sliders, primary
 * buttons, links. Every tint is derived from it in globals.css
 * (`html.editor-accent`, set on <html> in the root layout), so this is the
 * only value to change.
 *
 * Set NEXT_PUBLIC_EDITOR_ACCENT (and optionally NEXT_PUBLIC_EDITOR_ACCENT_DARK)
 * in `.env.local` or wrangler.toml `[vars]`; they are baked in at build time.
 */
export const EDITOR_ACCENT = process.env.NEXT_PUBLIC_EDITOR_ACCENT || '#f97316';
export const EDITOR_ACCENT_DARK = process.env.NEXT_PUBLIC_EDITOR_ACCENT_DARK || '';
