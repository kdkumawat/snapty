<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Snapty

Browser-native screenshot editor. Next.js 16 (App Router) **static export** (`output: "export"` in `next.config.ts`) deployed to Cloudflare Pages via `@opennextjs/cloudflare`. React 19 + Konva/react-konva canvas editor + Zustand + Tailwind v4 + shadcn/ui.

## Commands

```bash
npm run dev          # next dev on port 3001 (tees output to dev.log)
npm run lint         # eslint .
npx tsc --noEmit     # typecheck — NO npm script exists; CI runs bunx tsc --noEmit
npm run build        # static export to out/
```

- There are **no tests**. Verification = lint → `tsc --noEmit` → build, in that order (matches `.github/workflows/ci.yml`).
- Package managers are split: both `bun.lock` and `package-lock.json` exist; README recommends Bun, CI uses `bun install --frozen-lockfile`, but `packageManager` is npm 10. Either works locally; don't regenerate the other manager's lockfile.

## Architecture

- `/` is the **landing page** (`src/components/landing/`); the editor lives at `/editor` (`src/app/editor/page.tsx` → `src/components/editor/editor-page-client.tsx`). Other routes: `/guide`, `/info`, `/privacy`.
- All editor state lives in one Zustand store: `src/store/editor-store.ts` (~1500 lines). Annotation geometry/rendering helpers are split under `src/lib/editor/`.
- `src/components/editor/` is organized into subdirs (`canvas/`, `chrome/`, `dialogs/`, `empty/`, `menus/`, `panels/`, `shell/`, `toolbar/`, `ui/`) — the structure table in README.md is stale (it still lists the old flat layout and a removed `api/import-url` route).
- Privacy-first: there is **no server-side image proxy**; images load entirely client-side (`functions/[[path]].ts`).

## Look

- One "sharp" visual language for the whole app, defined as tokens in the last block of `globals.css` (`html.editor-accent`, set on `<html>` by the root layout): ink `#17171a` on white paper, `--border` hairlines, floating surfaces drawn with a 1px rule plus a tight shadow (`--floating-shadow`), one keycap style for every `kbd` / `.snapty-kbd`, Bricolage Grotesque (`--font-display`, self-hosted in `public/fonts`) for h1/h2 and dialog titles, Assistant for UI.
- Colour: the accent is `NEXT_PUBLIC_EDITOR_ACCENT` (optional `NEXT_PUBLIC_EDITOR_ACCENT_DARK`), read in `src/config/brand.ts`, default `#f97316`. It is for tints, selected/pressed states and focus only. Anything solid that carries white content (primary buttons, logo square, favicon, PWA icons, manifest `theme_color`) uses the deepened form `--button-fill` = `oklch(0.52 0.19 47)` = `#b93300` (white on it is 5.9:1; white on `#f97316` is 2.8:1 and is not allowed). The static SVG/PNG icons hard-code `#b93300`; if the accent env changes, regenerate them.
- The selected tool stays a soft orange tint with a dark icon (`--accent-container`), never a solid fill.
- Editor icons and canvas rendering still follow Excalidraw: `src/components/editor/ui/excalidraw-icons.tsx`, Tabler icons under lucide's names in `ui/icons.tsx` (editor files import icons from `ui/icons`, not `lucide-react`), rough.js options and fonts.
- Theme: one control, `src/components/theme-toggle.tsx`: a single button that cycles System, Dark, Light and shows the current mode's icon (next-themes). Used by the landing nav and the editor main menu; Alt+Shift+D and the `snapty-toggle-theme` event cycle the same three states.
- Landing page: `src/components/landing/` is generated from the prototype in `prototypes/landing` by `prototypes/landing/tools/port.js` (`landing-page.tsx`, `landing.css` scoped under `.lp`, `marks.ts`), with behaviour in `use-landing-motion.ts`. Do not edit the generated files: change the prototype, run the port, then `tools/compare.js` (it must stay at 0 % difference). Films and before/after images live in `public/landing/`; `prototypes/landing/README.md` explains how they are recorded (real editor via Playwright) and composed (Hyperframes).

## Static export constraints

- No server routes/API/dynamic rendering. `images.unoptimized: true`.
- `NEXT_PUBLIC_*` vars are baked at build time.

## Cloudflare Pages

- `wrangler.toml` is the authoritative config; its `[vars]` hold plaintext env (Dashboard is for Secrets only). The former bare `wrangler.json` / `wrangler.jsonc` duplicates have been removed.
- `cf:build` wraps `next build` with `scripts/with-wrangler-env.mjs`, which injects `wrangler.toml [vars]` into env so NEXT_PUBLIC_* resolve during build. Use it (or set vars manually) for production-parity builds.
- `npm run cf:preview` builds + serves `out/` via wrangler; `npm run cf:deploy` deploys.
