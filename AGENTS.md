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

## Static export constraints

- No server routes/API/dynamic rendering. `images.unoptimized: true`.
- `NEXT_PUBLIC_*` vars are baked at build time.

## Cloudflare Pages

- `wrangler.toml` is the authoritative config; its `[vars]` hold plaintext env (Dashboard is for Secrets only). `wrangler.json` / `wrangler.jsonc` are bare duplicates without `[vars]`.
- `cf:build` wraps `next build` with `scripts/with-wrangler-env.mjs`, which injects `wrangler.toml [vars]` into env so NEXT_PUBLIC_* resolve during build. Use it (or set vars manually) for production-parity builds.
- `npm run cf:preview` builds + serves `out/` via wrangler; `npm run cf:deploy` deploys.
