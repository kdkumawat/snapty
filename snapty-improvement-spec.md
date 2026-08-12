# Snapty Improvement Spec

**Status:** Spec (no code changes yet)
**Date:** August 12, 2026
**Scope:** Deep product, UX, interaction, performance, architecture, privacy, and roadmap audit of the entire Snapty codebase, informed by a 5-round product-strategy interview.

---

## 1. Mission & Context

Snapty is a browser-native screenshot editor: **annotate, style, and export screenshots entirely in the browser.** It is local-first, privacy-positioned, PWA-installable, and keyboard-first.

The mission for this spec:

> **Make Snapty the fastest, most polished way to turn a raw screenshot into a hand-drawn, shareable visual - without ever leaving the browser or uploading anything.**

The following sections record (a) verified codebase facts, (b) every product decision the owner made during the interview, and (c) a prioritized roadmap grounded in both.

---

## 2. Verified Codebase Facts

### 2.1 Stack & configuration
- Next.js 16 (App Router, **static export** via `output: "export"`), React 19, TypeScript 5.
- Konva / react-konva 19 for canvas rendering; Zustand 5 for state; Tailwind CSS v4; shadcn/ui primitives; lucide icons; framer-motion; cmdk (command palette); rough.js (hand-drawn); tesseract.js v6 (OCR).
- Deployed to Cloudflare Pages (`wrangler.toml` → `pages_build_output_dir = "out"`, static export). `functions/[[path]].ts` is a deliberate no-op (privacy: no image proxy).
- `next.config.ts`: `output: "export"`, `typescript.ignoreBuildErrors: true`, `reactStrictMode: false`, `images.unoptimized: true`.
- **No tests exist** - no test runner, no test files, no CI.

### 2.2 Routing & information architecture
- **Editor is the root URL `/`** (client-only shell). The marketing/landing page lives at `/info` (client-only too). `/editor` redirects to `/`. Legacy `#editor` hash handled in the store.
- History.pushState / replaceState swaps between `/` and `/info`; installed PWAs are pinned to the editor root.
- Editor shell (`src/components/editor/shell/editor-shell.tsx`) hosts: `EditorCanvas` (dynamic, `ssr: false`), `EmptyState`, `TopChrome` (toolbar + action cluster), floating properties panel/rail, `BottomChrome` (zoom / undo-redo / add-image), export/help/settings dialogs, command palette, context menu, autosave lifecycle, and two hidden file inputs.

### 2.3 State (Zustand, `src/store/editor-store.ts`)
- Single store: image + `imageDataURL` (PNG data-URL), `imageSize`, zoom, stage position, active tool, ~18 tool/style settings, elements, selection, step counter, canvas style, export prefs, dialog flags, locks, history.
- **Undo/redo = full snapshots.** Every mutation deep-clones the entire `elements` array (`JSON.parse(JSON.stringify(...))`) into `_history` (unbounded). Image data-URLs are shared by reference across snapshots (good) and only diverge on crop.
- Settings persist to `localStorage` (`snapty-settings`); hand-drawn flag in `snapty-tool-settings`; toolbar orientation in `snapty-toolbar`.
- **Every settings setter pushes a history entry when a selection exists** - slider drags (`setOpacity`, `setStrokeWidth`, …) fire per-change, so a single slider drag can create dozens of undo steps (verify - no debounce seen).
- Autosave writes full snapshots (incl. image data-URL) to IndexedDB (`snapty-autosave`) debounced 800ms - but **the shell clears autosave on mount, so sessions never restore** (intentional; owner decided to change this).
- `getImageToolScale`: annotation sizes scale up on large screenshots (baseline 1200px → 1×, cap 4×) - a thoughtful "annotation stays readable on big images" feature.

### 2.4 Canvas & tools (`editor-canvas.tsx`, ~2,700 lines)
- Stage with background image + annotation layer + transformer. Wheel zoom around cursor, two-finger pinch, space-to-pan, hand tool, marquee selection (Shift additive), snap guides (6px threshold) while dragging, arrow-key nudge (Shift = 10px).
- **18 tool types** (`types/editor.ts`): select, hand, magnifier, arrow, rectangle, rounded-rect, circle, diamond, line, pencil, highlighter, text, blur, pixelate, spotlight, step, eraser, crop. Toolbar shows 16; spotlight is palette/shortcut-only.
- Hand-drawn rendering via rough.js (multi-stroke, bowing, hachure fills, seeded per element id). Text defaults to handwritten Caveat font.
- **Blur/pixelate/spotlight are baked into per-element PNG data-URLs at commit time** (region of the source image), re-baked on geometry/intensity change. Blur = `ctx.filter`, pixelate = downscale/upscale. Spotlight = full-image dim overlay with cutout.
- Magnifier: custom component, allocation-free offscreen-canvas painting (rAF-coalesced), free bubble placement, corner-resize + connector-length handles, custom selection frame (skips Transformer).
- Text: click places a hidden textarea overlay; commit on blur/Escape; multiline; two font families only (handwritten/standard).
- Eraser: drag a box, **deletes whole intersecting annotations** (not pixel-erasing).
- Crop: marquee + confirm; bakes new image, shifts/rewrites annotation coordinates, undoable, snapshots store the active tool for image-changing undos.
- Transformer: rotation enabled, `keepRatio` varies by tool, custom bounds, anchors themed via CSS variables.

### 2.5 UI surfaces
- **Floating toolbar** (top center): 16 tools + OCR + palette, double-click to sticky-pin a tool, re-click cycles that tool's primary setting (e.g., press A twice → dash cycle). Tooltips show letters/digits.
- **Properties panel** (left): expanded card or collapsed icon rail with popovers; registry-driven (`tool-settings.ts` + `settings-sync.ts` - one source of truth for which settings each tool has, applied on select/hydrate). Layers, lock, duplicate, delete, copy/paste style (in-memory only).
- **Action cluster** (top right): capture screen, copy, download menu (PNG/JPG/WebP/SVG + transparent toggle), share, settings, close image (with confirm). On mobile reduced to settings + close; actions move into the settings sheet.
- **Bottom chrome**: zoom pill (out / % / in; click % toggles fit↔100%), undo/redo pill, add-image pill.
- **Toolbar tips**: contextual one-liner under the toolbar ("Drag to draw. Press A again to cycle stroke style.").
- **Settings drawer** (right, slide-in): theme (light/dark/system), hand-drawn toggle, dot grid, image/annotation locks, canvas styling (padding 0–120, bg style none/solid/gradient/glass + color, corner radius 0–48, shadow toggle), shortcuts/about links, "Reset tools".
- **Export dialog**: format (PNG/JPG/WebP/SVG), quality slider (10–100), transparent toggle, dimensions + **debounced real size estimate (runs the full export pipeline)**, download/copy/share. Canvas styles (padding/radius/shadow/bg/frame) are applied **again in the export pipeline**.
- **Command palette** (`Ctrl/Cmd+K`): tools, actions (capture, open, overlay, export, OCR, settings, clear, reset, shortcuts, fit, 100%, undo/redo, clear annotations), theme switching.
- **Context menu** (right-click): copy, paste, extract text, duplicate, delete, group/ungroup, layer order, lock, copy/paste style.
- **Empty state**: logo, "Drop an image anywhere · 100% local", Open / Paste / Capture screen / Help / About + URL import row + hidden file input.
- Landing (`/info`): hero, scenario demo (auto-rotating mock screenshots), feature grid, CTAs; hand-drawn typography; GitHub + theme toggle; "Instant, Local / Nothing Uploaded / Keyboard-First".

### 2.6 Export pipeline
1. `captureStagePng()` - `stage.toDataURL` at `1/scaleX` pixelRatio over content bounds (image + annotation overflow), transformers hidden.
2. If any canvas style (padding/radius/shadow/bg/frame) → `renderWithCanvasStyle()` re-rasterizes on a second canvas.
3. PNG → blob via fetch; JPG/WebP → decode + re-encode on a third canvas at chosen quality.
4. SVG → hand-built string (rough.js **not** applied - shapes export clean; magnifiers rasterized).
- So a JPG export = 3–4 rasterizations. Deterministic filenames (`snapty-export.png`), no timestamp.
- Copy writes PNG to clipboard via `ClipboardItem`.

### 2.7 Privacy & data flow
- All image processing is client-side. No server API routes (functions file is a no-op). URL import fetches directly in-browser (`mode: 'cors'`), so CORS-strict hosts fail - by design.
- **GA4 loads via gtag.js** (third-party request) when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (it is, in `wrangler.toml`). Fonts (Geist/Caveat) are self-hosted at build via `next/font` (no runtime font CDN). OCR wasm/traineddata resolve from `/tesseract/...` (public dir) - **verify**: `public/tesseract/` only contains core wasm; `worker.min.js` and `lang-data/` may 404 → tesseract.js may fall back to CDN on first run (contradicts "offline OCR" claim). sw.js caches `.traineddata.gz` + wasm.
- Headers: `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo blocked), immutable static cache.
- Share uses `navigator.share` (user-initiated OS handoff); clipboard via async Clipboard API.

### 2.8 PWA & offline
- Manifest: standalone, `window-controls-overlay`, maskable + any icons (192/512/svg), `handle_links: not-preferred`, launch handler. **`screenshots: []` and no `shortcuts`.**
- `sw.js` (v4.9): network-first navigation, cache-first `_next/static` + fonts + wasm/traineddata, cache purge on activate, `NEW_VERSION_READY` → update toast (`update-toast.tsx`).
- Precache: `/`, `/editor`, manifest, favicon, icons (small).

### 2.9 Dependencies (from `package.json`)
Heavy boilerplate residue - **~25 packages appear unused** (verify with knip/depcheck before deleting): `@prisma/client`, `prisma`, `next-auth`, `@mdxeditor/editor`, `react-markdown`, `react-syntax-highlighter`, `recharts`, `@tanstack/react-table`, `@tanstack/react-query`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `zod`, `input-otp`, `embla-carousel-react`, `vaul`, `date-fns`, `@dnd-kit/*`, `react-resizable-panels`, `sharp`, `uuid`, `use-image`, `@reactuses/core`, `sonner` (app uses shadcn toast), `z-ai-web-dev-sdk`, `next-intl`, plus many unimported `@radix-ui/*` packages. `src/lib/db.ts` (Prisma singleton) is dead code.
- Actually used beyond Next/React: konva, react-konva, zustand, tailwind stack, lucide, framer-motion, cmdk, roughjs, tesseract.js, next-themes, class-variance-authority, clsx, tailwind-merge, tw-animate-css, @radix-ui (dialog, tooltip, slider, switch, toast, label, separator, context-menu, slot at least).

---

## 3. Interview Decision Log (authoritative)

### Round 1 - Vision
| Decision | Choice |
|---|---|
| Visual identity | **Keep the hand-drawn identity.** Excalidraw-style strokes, hachure fills, handwritten Caveat text stay the default. Crisp mode remains a toggle, never the default. |
| Primary audience | **Developers & PMs, support & success agents, general casual users.** (Marketers and privacy-professionals are NOT primary segments.) |
| North star | **Speed to first useful result** - capture → paste → annotate → copy in under 30 seconds. |
| Anti-vision (guardrails) | **All five:** no account-required cloud, no collaboration platform, no full image editor, no AI-heavy assistant, no feature bloat. |

### Round 2 - Privacy & trust
| Decision | Choice |
|---|---|
| Analytics | **Keep GA + disclose.** Add a privacy/trust page stating exactly what's collected; refine copy so "100% local" and GA coexist honestly. |
| Session recovery | **Ask to recover.** On reload, if an IndexedDB snapshot exists, show "Recover last session?" (restore image + annotations + view on confirm). |
| URL import | **Keep client-only** (no server proxy). Improve error copy and offer paste/file fallback; accept CORS failures. |
| AI boundary | **AI later, if ever.** Park AI/heuristics (auto-blur, beautify, smart crop). On-device OCR stays as the only AI. |

### Round 3 - Editor UX & scope
| Decision | Choice |
|---|---|
| Mobile | **Full editing parity** - every tool + gesture on phones/tablets (pinch, touch draw/transform). |
| Beautify | **Curated presets + manual controls.** 3–5 hand-tuned one-click styles (padding/radius/shadow/bg) with sliders still available. |
| Tool clutter | **Hide Diamond and Rounded rectangle by default** (submenu/keyboard-only). Keep spotlight hidden (as today). Keep magnifier, OCR, crop, eraser, all others visible. |
| Export hero | **Copy is the hero.** One click / Cmd+C → clipboard. Download/share secondary; dialog for tweaks. |
| SVG export | **Keep and fix fidelity** - rough.js SVG paths so hand-drawn shapes export sketchy; fix text/frames/magnifier. |

### Round 4 - Engineering & performance
| Decision | Choice |
|---|---|
| Image limits | **Cap with opt-out.** Auto-downscale past ~4096px longest side with a toast; "Keep original" toggle in Settings. |
| Undo model | **Optimize snapshots.** Keep full-snapshot simplicity, add depth cap (~100) + cheaper snapshots. No op-based history. |
| Device frames | **Editable browser chrome, modern iPhone variants, iPad/tablet, Android/Pixel.** (Not terminal, not Windows 11.) |
| Testing | **None for now** - manual QA at this stage; note recommended future suite. |
| Tech debt | **Full cleanup:** remove unused deps, enable reactStrictMode, fail builds on TS errors, add CI (lint + typecheck + tests when they exist). |

### Round 5 - Positioning & discoverability
| Decision | Choice |
|---|---|
| Default route | **Landing at `/`, editor at `/editor`** (preserve deep link). |
| SEO spend | **Server-render the landing**, add sitemap + docs pages targeting "screenshot editor / annotate screenshot" queries. |
| Onboarding | **Interactive first-run** - a 10-second annotated sample screenshot the user can play with, with callouts. |
| PWA | **Polish the install experience** - manifest screenshots, shortcuts ("New from clipboard"), offline assurance, better icons. |

---

## 4. Current Product Assessment

Snapty today is a **genuinely impressive single-surface editor**: one page, no accounts, paste → annotate → copy in ~4 interactions, with a distinctive hand-drawn personality, a strong settings registry, a real export pipeline (4 formats + clipboard + share), OCR, screen capture, PWA/offline, and both themes. It is closer to "CleanShot-in-the-browser" than any web tool in its category.

**What it is NOT yet:** optimized for cold-start discovery (client-only pages, editor at the root), hardened at scale (unbounded history clones, no image caps, double/triple rasterized export), tested, or fully accessible. Dependencies carry heavy unused boilerplate.

---

## 5. Product Strengths - DO NOT CHANGE

1. **Hand-drawn identity** - rough.js multi-stroke rendering, seeded jitter, handwritten Caveat font, hand-drawn magnifier rings. This is the differentiator.
2. **Paste-anywhere capture** - empty state drop zone, Cmd+V, OS screenshot workflows, `snapty-open-file` events.
3. **Registry-driven tool settings** (`tool-settings.ts` + `settings-sync.ts`) - single source of truth; selection hydration, scale invariance, and mobile/desktop parity all derive from it. Keep this architecture.
4. **Keyboard-first implementation** - letter+digit tool shortcuts, cycling on re-press, space-pan, nudge, group/lock/duplicate, Cmd+C/E/0/1. Consistent and documented in the help dialog.
5. **Toolbar tips** - contextual one-liners that teach without onboarding.
6. **Image-tool scaling** (`getImageToolScale`) - annotations stay readable on huge screenshots.
7. **Custom magnifier** - Shottr-class spyglass with free bubble placement, allocation-free painting.
8. **Baked blur/pixelate/spotlight** - effect regions are committed as bitmaps; SVG/PNG export stays correct without re-derivation.
9. **Undo includes crop + step counter** - image-changing undos restore tool + badge counter correctly (rarely done right).
10. **Responsive properties UI** - panel ↔ icon rail with hysteresis + session pinning.
11. **Privacy mechanics** - no server routes, client-only URL fetch, camera/mic/geo blocked, self-hosted fonts.
12. **Static-export simplicity** - deployable anywhere, offline-capable, no DB.

---

## 6. Critical Problems (highest impact)

### P0 - must fix
1. **Client-only rendering + editor at `/` kills discoverability.** Both `/` and `/info` are `'use client'` with `ssr:false` dynamic shells; the root HTML is an empty canvas for crawlers. Decision: swap routes and server-render the landing.
2. **Privacy claim vs. GA4.** UI says "Nothing Uploaded / 100% local" while gtag.js phones home. Decision: keep GA + disclose → add a trust/privacy page and honest copy (e.g., "Your images never leave your device. We only see anonymous page visits.").
3. **Sliders spam undo history.** Any setting slider with a selection pushes a history entry per tick. Dragging opacity 40 steps = 40 undo entries. Fix: commit-on-release (pointerup / debounce) for settings changes.
4. **Unbounded history snapshots + full JSON clone per edit.** O(n·k) work/memory with dense annotations; no depth cap. Decision: cap ~100 + cheapen snapshots.
5. **`typescript.ignoreBuildErrors: true` + `reactStrictMode: false`.** Builds silently ship type errors; strict-mode is off in a state-heavy editor. Decision: full cleanup (strictMode on, errors fail builds).

### P1 - major improvement
6. **Export pipeline re-rasterizes 2–4× per export** (stage → styled canvas → re-encode). JPG/WebP of a 4K image can take seconds + spike memory. Optimize: single-pass rasterize + encode, cache styled canvas, worker offload.
7. **No image-size guardrails** - 100MP phone shots / 8K images freeze the editor and balloon `imageDataURL`. Decision: cap with opt-out.
8. **Eraser deletes whole elements**, surprising users who expect pixel erasing. At minimum: preview affected elements + clearer messaging; decide later if a pixel eraser is worth it (likely not for v1 of fix - annotate-only erasing is standard in this category's web tools).
9. **SVG export infidelity** (clean shapes, no rough.js, text without font fidelity). Decision: fix fidelity.
10. **Session recovery missing** despite autosave already writing. Decision: "Recover last session?" prompt.

### P2/P3 - polish
11. Deterministic export filenames; no timestamp; no OCR progress beyond spinner; no undo of canvas-style changes (style changes are NOT in history today - `setCanvasStyle` doesn't push history; verify whether that's desired).
12. No keyboard access to Transformer anchors / magnifier handles; viewport `userScalable: false`.
13. Missing manifest screenshots + shortcuts; no first-run sample; no interactive onboarding.
14. Dead deps + dead `db.ts`; `DEPLOYMENT.md` references an OpenNext adapter the config no longer uses (static export now).

---

## 7. UX Audit (feature by feature)

### 7.1 Import & first impression
- Empty state is good: drop anywhere, Open/Paste/Capture/Help/About + URL. URL import is buried below the fold of the card; CORS errors message is decent.
- **Gap (speed north star):** after paste, the image appears centered via `resetView` - good. But nothing tells the user "press A to draw an arrow"; toolbar tips only show tool behavior, not "what to do first".
- Decision: interactive first-run sample after first image load (dismissible).

### 7.2 Editor information architecture
- Floating toolbar + left panel + right settings drawer + bottom pills = dense but consistent. Toolbar tips teach tools. Command palette is excellent.
- **Cognitive overload risk:** 16 visible tools + OCR + palette in one pill; Diamond/Rounded-rect hidden per decision; magnifier stays (it's a signature).
- Right-click context menu duplicates panel actions - fine, but keyboard equivalents are missing for layer order (no shortcuts for bring-forward/send-back).

### 7.3 Tool-by-tool review (20-point checklist applied per tool)
| Tool | Verdict | Notes / gaps |
|---|---|---|
| Select | Strong | Marquee, shift-additive, snap guides, nudge, transformer. No zoom-to-selection shortcut; no align/distribute. |
| Hand / Space | Strong | Space-to-pan restores prior tool; wheel zoom around cursor; pinch works. |
| Arrow / Line | Strong | Bendable (drag middle handle), tangent-correct arrowheads, dashed/dotted, roughness. Shift doesn't snap to 45° - **consider** (Excalidraw parity) or leave (marker-style freedom). |
| Rectangle / Rounded-rect | Strong | Corner radius live; Shift square; Alt center. Rounded-rect hidden per decision. |
| Circle / Diamond | Good | Same behavior. Diamond hidden per decision. |
| Pencil | Good | Live wobble; round caps; pressure not supported (canvas Pointer Events could add tilt/pressure cheaply - optional). |
| Highlighter | Good | Uses `highlighterWidth`; semi-transparent; no "straighten highlight" - fine. |
| Text | **Needs work** | Only 2 fonts; no bold/italic; no alignment UI (`align` exists in the type); auto-width box; multiline ok; no per-text color picker beyond stroke swatch. Decision scope: add size presets, bold/italic, alignment - do NOT add a font picker with web fonts (privacy: self-host only, keep 2 families + sizes). |
| Step numbers | Strong | Counter restored by undo; start-number + reset; auto-size. |
| Blur / Pixelate | Strong | Baked bitmaps, re-bake on change, intensity sliders. **Privacy check:** re-baking keeps regions private; blur radius min 2. Good. |
| Spotlight | Good | Opacity only; dim overlay + hole. Fine as hidden tool. |
| Eraser | **Controversial** | Deletes whole elements; add preview of what will be erased + better cursor; keep element-level semantics (documented) rather than pixel erasing. |
| Magnifier | Signature | Great; keep. Selection frame + handles custom; ensure keyboard alternative isn't required (canvas tools are pointer-first). |
| Crop | Strong | Undoable, annotation-aware. Confirm overlay could show final aspect; fine as-is. |
| OCR | Good | Offline intent; verify lang-data actually resolves locally (see §2.7) or OCR may hit CDN on first run. |

### 7.4 Canvas styling (padding / radius / shadow / bg / frames)
- Settings drawer sliders are capable but **not discoverable as "beautify"** - decision: add curated presets (one-click): e.g. *Clean White Card*, *Gradient Glow*, *Soft Glass*, *Dark Terminal* (bg + frame combos). Sliders remain for fine-tuning.
- Live canvas already honors padding (resetView accounts for it); **verify** that live rendering and export rendering of radius/shadow/bg are pixel-identical (two code paths today - drift risk).
- Device frames: browser (static URL bar), iPhone, MacBook exist and are drawn only at export. Decision: frame system with **editable browser chrome, iPhone variants (notch/dynamic island), iPad, Android/Pixel**; frames must preview live (render frame in the live view, not only at export).

### 7.5 Undo/redo & history
- Correct semantics for elements, image, tool-on-crop, step counter. Gaps: settings sliders spam entries (P0); canvas-style changes not in history; depth unbounded (P0/P1).
- Decision: cap ~100; slider changes commit once per gesture; style changes become one undo step.

### 7.6 Zoom & navigation
- Wheel-around-cursor, pinch, fit, 100%, % pill, space-pan - near-native feel already. Missing: zoom-to-selection shortcut (store method exists, `zoomToSelection` is unwired from the keyboard).

### 7.7 Export
- Copy is hero (decision). Add: filename with timestamp or customizable name; remember last format+quality per session (format already persisted); **size estimate stays** (it's a differentiator); batch export is a DON'T (bloat).
- Cmd+E opens dialog; keep. Consider Cmd+Enter → quick download with current defaults (optional, P2).

### 7.8 Onboarding (decision: interactive first-run)
- After the first image loads (once per install), overlay a dismissible, **playable annotated sample** (the existing `landing-scenario-demo` mock could be reused on-canvas) with 3 callouts: "Press A for arrows · Drag to draw", "N = numbered steps", "Cmd+C = copy your finished shot". Dismiss → never shows again. Toolbar tips already cover per-tool.

---

## 8. Interaction Audit (mouse / keyboard / touch)

**Already right:** pointer-drag drawing with thresholds, marquee, shift-constrain, alt-from-center, space-pan, arrow nudge, double-click sticky tool, re-press cycles settings, Esc exits, context menu, snap guides, keyboard-first tool switching.

**Gaps to close:**
1. Settings sliders should commit on release (undo hygiene - P0).
2. Keyboard equivalents for layer order + lock/unlock in the shortcuts map (P2).
3. Touch parity: verify Transformer anchors work with touch (Konva supports it) and magnifier handles on coarse pointers (custom `useHandleDrag` listens on window - verify touch cancel paths) (P1 under "full mobile parity").
4. `Cmd+Shift+4`-style flow polish: after screen capture, jump straight to Crop tool (currently lands on capture tool? verify default active tool after capture) (P2).
5. Pointer-event pressure/tilt for pencil - cheap win, optional (P3).
6. Eraser: live highlight of elements that would be deleted (P1).

---

## 9. Visual Design Audit

- **Tokens** (`globals.css`): warm-neutral light (`--canvas #F4F3F1`, accent orange `#EA580C`) and dark (`#141414` canvas, `#F97316`) - coherent, premium, distinct from shadcn defaults. Keep.
- **Typography:** Geist Sans/Mono + Caveat (handwritten) - good pairing; `font-hand` utility used consistently for brand voice.
- **Consistency:** floating surfaces, pills, icon buttons, kbd chips, panel sections, toasts are consistent. Watch: some inline styles/raw hex in device-frame drawing (export) vs tokens (live UI) - centralize frame colors.
- **Hand-drawn identity:** toolbar/empty-state/landing all use it; canvas cursors are custom SVG with halo (visible on light+dark) - a rare, well-executed detail.
- **Contrast checks:** muted-foreground (#78716C on #F4F3F1 ≈ 4.5:1) ok; tiny 7–11px labels on rail buttons are a readability risk for older users - acceptable for a power surface, but ensure touch targets ≥ 44px on coarse pointers (done via CSS).
- Decision: no visual overhaul; preserve tokens; ensure any new preset/onboarding surfaces match the token system.

---

## 10. Performance Audit

| Area | Finding | Fix |
|---|---|---|
| History | Full `JSON` clone per mutation, unbounded | Cap 100 + cheapen (see §6/§14) |
| Slider commits | History entry per tick | Commit on release |
| Export | 2–4 rasterizations, main-thread | Single-pass + worker + cache styled canvas |
| Drawing | Pencil/highlighter point arrays append per pointermove; Konva redraws | Already rAF-friendly in magnifier; verify pencil path not allocating per move; throttle point sampling |
| Memory | Image held as PNG data-URL (×1, shared by history refs - good); autosave writes full snapshot to IndexedDB per edit | Cap images (decision); debounce autosave (already 800ms); store Blob/ImageBitmap + lazy data-URL |
| Image load | `blobToImage` decode on main thread; no downscale | Cap + opt-out; consider `createImageBitmap` |
| React renders | Store is one big object; components subscribe narrowly (mostly fine); `elements` array diff on every draw | Keep narrow selectors; consider `useShallow` where arrays are read |
| OCR | First-run ~3MB wasm/traineddata (offline-cached after) | Verify local resolution; show progress; lazy-load only on demand (already dynamic import) |
| Startup | `ssr:false` dynamic shells → editor bundle is large (Konva + rough + tesseract) | Route split: landing (server-rendered, no Konva) vs editor chunk; code-split tesseract (already), rough.js (already in canvas chunk) |

**60fps promise:** keep pointer-move work allocation-light; measure with a perf benchmark later (testing decision defers automated benchmarks, but ad-hoc profiling is fine).

---

## 11. Architecture Audit

**Strong:** settings registry (`tool-settings` / `settings-sync`) with scale-invariant two-way mapping; shared geometry modules (`curve`, `magnifier-geometry`, `selection`) reused by canvas + export + SVG; window-event plumbing for file pickers/OCR (simple pub/sub); responsive panel with pinning; static export; privacy-clean no-op function.

**Weak:**
- `editor-canvas.tsx` (~2,700 lines) - the interaction layer has grown monolithic (drawing, selection, text editing, OCR trigger, baking, rendering, zoom). Recommend splitting into: `useCanvasInteractions`, `useEffectBaking`, render helper modules - **only if it improves maintainability; don't churn for its own sake**.
- Store is a single giant interface (50+ members) - acceptable for this app size; keep, but group setters behind the registry pattern.
- Two canvas-style render paths (live vs export) - deduplicate into one composable renderer to prevent drift.
- Dead code: `db.ts`, unused deps, `use-image`, `sonner`, legacy re-export shims (`editor-page.tsx`, `toolbar.tsx`). Clean per decision.
- `next.config` flags (strictMode off, ignoreBuildErrors) - flip per decision, then fix surfaced issues.

---

## 12. Accessibility Audit

**Present:** aria-labels on icon buttons, tooltips, kbd hints, focus-visible rings, Esc handling, dialog titles, `aria-pressed`, `role=dialog`, reduced-motion safe (mostly transform/opacity), high-contrast cursors.

**Gaps:**
1. `viewport maximumScale:1, userScalable:false` - blocks pinch-zoom (WCAG 1.4.4). Remove `userScalable`/`maximumScale` (app is canvas-based; browser zoom + our own pinch coexist).
2. Canvas interactions (drawing, transformer, magnifier handles) are pointer-only; screen readers get nothing from the stage. Pragmatic goal: **surrounding UI fully accessible + keyboard-operable alternatives for selection/transform** (arrows already nudge; add Tab-into-selection + Delete + Enter-to-edit-text where feasible) - don't promise full canvas a11y.
3. Settings drawer is a custom `motion.aside` with no focus trap/restore; swap to the Radix Dialog pattern used elsewhere or add trap + return focus.
4. `Select`/`Input` for step numbering is a native number input - good. Color input native - good.
5. Toast region: `aria-live` via shadcn toaster - verify.
6. Focus visibility on canvas after tool switch: ensure the last-focused button keeps a visible ring.

---

## 13. Privacy Audit (post-decision target state)

**Guaranteed local:** images, annotations, effects (baked locally), exports (user-initiated), history, autosave (IndexedDB), OCR (if served locally - **verify**), fonts (self-hosted), URL import (client-only).

**Network requests that exist:** GA4 pageviews (keep + disclose); sw.js fetch of your own origin; OCR first-run wasm/traineddata (should be own origin); `navigator.share` handoff (user-initiated); user pasted URLs (client-only).

**Actions:**
1. Add **Trust & Privacy page** (`/privacy` or info section): what's local, what GA collects (anonymous page views), cookies used by GA, no image upload ever, how to disable (settings toggle "Usage analytics" that stops loading gtag).
2. Make GA loading **conditional + disclosed** in Settings ("Send anonymous usage data" - default ON per decision to keep insights, but documented and switchable; if the switch is ON and GA is what the owner wants, the disclosure page is the contract).
3. Re-verify OCR paths resolve locally; if they fall back to CDN, vendor the worker + lang-data into `public/tesseract/`.
4. Keep headers strict; add `Cross-Origin-Resource-Policy` / `Referrer-Policy` if missing on assets.

---

## 14. PWA & Offline Audit

**Keep:** static-export + sw.js network-first nav / cache-first assets, update toast, standalone + window-controls-overlay CSS, safe-area handling.

**Polish (per decision):**
1. Manifest: add `screenshots` (editor screenshots, `form_factor: "wide"/"narrow"`) - required for richer install prompts; add `shortcuts` (e.g., "New from clipboard" → `/editor?action=paste`, "Settings" → `/editor?action=settings`).
2. Improve icons if needed (maskable already present).
3. Offline assurance: empty-state copy "Works offline - install me" when `navigator.onLine === false`.
4. Session recovery ties into PWA: "Recover last session?" on reload in standalone mode especially.

---

## 15. Competitive Benchmark (mental model, web-verifiable later)

- **CleanShot / Shottr (desktop):** the interaction gold standard - capture-to-annotate-to-copy in seconds, bendable arrows, magnifier, scoped blurs, pin-to-screen. Snapty already matches arrow-bend, magnifier, baked blur, Cmd+C copy. **What they can't do: run in a browser, zero-install, cross-platform, privacy-static-deploy.**
- **Snagit / Skitch:** step tools, redaction, library. Snagit's step numbering = Snapty's `step` tool.
- **Excalidraw / tldraw:** the hand-drawn visual language Snapty borrows; they are whiteboards, not screenshot tools - Snapty must not chase whiteboard features (align/distribute are nice, but not a canvas grid/rulers system).
- **Web competitors (e.g., generic "annotate screenshot" sites):** almost all upload to servers; Snapty's local processing is the wedge. Their UI is uniformly worse.
- **Figma-style UI patterns to adopt sparingly:** smart guides (have), zoom around cursor (have), commit-on-release settings (adopt), canvas dot-grid (have).
- **Explicitly avoid:** accounts, cloud sync, collaboration, marketplace of templates, AI chat.

---

## 16. Snapty North Star

> **"The fastest way to turn a raw screenshot into a hand-drawn, shareable visual - fully on your device."**

### Core principles
1. **Speed is the product.** Every flow measured in clicks/seconds to a useful result; copy-to-clipboard is the default finish.
2. **Hand-drawn is the identity.** Sketchy strokes and handwritten labels are the brand; crisp is a mode, never the default.
3. **Privacy is a promise, not a slogan.** No uploads, no accounts, no server image paths; any telemetry is disclosed and switchable.
4. **Manual control first.** Heuristics/AI only if they remove friction from the core job - parked until the core is world-class.
5. **No bloat.** Every feature must serve "annotate a screenshot"; when in doubt, don't build it.
6. **Keyboard-first, pointer-everywhere.** Everything reachable by keyboard; nothing requires it.

---

## 17. Ideal UX (target flow)

```text
Capture (Cmd+Shift+4 / Win+Shift+S / Capture button / paste / drop)
      ↓
Image lands centered, at fit zoom, ready to draw (0–1s)
      ↓
First-run only: dismissible playable sample + 3 callouts
      ↓
Draw (arrows/rects/steps/text/blur) - tooltips teach as you go
      ↓
One-click Beautify presets (optional): frame, bg, shadow, radius
      ↓
Cmd+C / Copy button → clipboard in <300ms  (or Download/Share)
```

**Friction removals:** single keystroke from paste to first annotation; copy is one click; no dialog needed for the default path; export dialog only for choices; recovery prompt instead of data loss on reload.

---

## 18. Magic Moments (≥10, code-informed)

1. Paste a screenshot → it appears perfectly centered at fit zoom, ready to draw.
2. Custom tool cursors (halo SVG) that stay visible on any screenshot, light or dark.
3. Bendable arrows (drag the middle handle) with tangent-correct arrowheads - Shottr-class.
4. Magnifier spyglass with live-following bubble and pixel-grid overlay while dragging.
5. Press the same tool key twice → setting cycles (A A = dash, P P = width) - power-user delight.
6. Hand-drawn strokes stay stable (seeded jitter) across redraws and exports.
7. Step numbers that never skip a number, even after undo/redo.
8. One-click Beautify preset turns a flat screenshot into a framed, shadowed, gradient-backed card.
9. Cmd+C → clipboard image in under 300ms, toast confirms; paste into Slack/Docs/Linear.
10. "Recover last session?" saves a 20-minute annotation session from a refresh.
11. Offline: installed PWA opens and OCRs with zero network.
12. Crop that's undoable and keeps your annotations aligned - undo restores the pre-crop image and tool.
13. The contextual toolbar tip line that always tells you what your current tool does next.
14. Screen capture → straight to Crop tool for the region you actually wanted.

---

## 19. Feature Improvements & New Features

### Improvements (existing)
- Route swap: landing at `/`, editor at `/editor` (+ keep `/info` alias for legacy links).
- Server-render landing + sitemap + docs pages ("screenshot editor", "annotate screenshot online", "blur screenshot online", "free screenshot editor no upload").
- Trust & Privacy page + GA disclosure + analytics toggle.
- Session recovery prompt (IndexedDB snapshot exists → offer restore; clear on explicit discard).
- Settings sliders commit one undo step per gesture.
- History depth cap (~100) + cheaper snapshots.
- Export: single-pass rasterize, cached styled-canvas, worker encode; filenames with timestamp; remember format/quality.
- Beautify presets (3–5 curated canvas styles) in Settings + quick-apply from action cluster.
- Device-frame system: editable browser chrome, iPhone (notch + dynamic island), iPad, Android/Pixel; live preview on canvas.
- SVG fidelity: rough.js SVG paths, correct text/frames/magnifier.
- Interactive first-run onboarding (playable sample + callouts).
- PWA: manifest screenshots + shortcuts; offline empty-state copy.
- Eraser: highlight elements before deletion.
- Image cap (default ~4096px) with "keep original" toggle + toast.
- OCR: verify/vendor local lang-data; progress UI.
- Cleanup: unused deps, dead code, strictMode on, builds fail on TS errors, CI.
- Text tool: size presets, bold/italic, alignment (uses existing `align`), keep 2 font families (self-hosted).

### New features (high value only)
1. **Zoom-to-selection shortcut** (store method exists - wire it: Cmd+2 or `z`? - pick non-conflicting key, e.g., `Cmd+Shift+1` reserved? `zoomToSelection` currently unwired).
2. **Copy-style/paste-style already exist** - keep; optionally persist across sessions (P3).
3. **Keyboard equivalents for layer order** (e.g., `]`/`[` bring/send, `Cmd+]` front/back) - P2.
4. **"New from clipboard" PWA shortcut + URL params** (`/editor?action=paste`) - P2.
5. **Export preset memory** per format (already format+quality persisted; extend to transparent flag) - P1.
6. **Undo for canvas-style changes** (style mutations become one history step) - P1.

### DON'T BUILD (guardrails)
- Accounts, sync, cloud storage, comments/collaboration, team workspaces.
- Full image editor (layers, pixel retouching, filters library, RAW, masks beyond current tools).
- AI assistant / chat / auto-caption / background removal (parked by decision).
- Marketplace, template library, plugin system.
- Batch/multi-page export, PDF export (out of job), rulers/guides system, custom fonts from web (privacy), animation/video export.
- Terminal & Windows-11 frames (decision: not prioritized).

---

## 20. Prioritized Roadmap

### P0 - Must fix (correctness / trust / discoverability)
| # | Problem (evidence) | Impact | Solution | Complexity |
|---|---|---|---|---|
| 1 | Client-only root at `/` with editor shell; landing at `/info`; no sitemap | Search engines see empty canvas; no cold traffic | Swap routes; server-render landing; sitemap + robots | M |
| 2 | GA loads while UI claims "Nothing uploaded / 100% local" | Trust damage for privacy audience | Privacy page, honest copy, analytics toggle | S |
| 3 | Slider drags create many undo entries (`setOpacity` etc. push per tick) | Undo UX broken for styling | Commit-on-release / debounced history push | S |
| 4 | `ignoreBuildErrors:true`, `reactStrictMode:false`, dead deps | Latent bugs ship; dev experience poor | Full cleanup per decision; CI lint+typecheck | M |
| 5 | Session data silently lost on reload (autosave deleted on mount) | Users lose 20-min edits | "Recover last session?" prompt | S |

### P1 - Major improvement
| # | Problem | Impact | Solution | Complexity |
|---|---|---|---|---|
| 6 | Export re-rasterizes 2–4×; slow on big images | Export feels slow; memory spikes | Single-pass pipeline + worker + cache | M |
| 7 | No image-size cap → freeze on 8K/100MP | Editor unusable on phone shots | Cap ~4096 + opt-out toggle + toast | S |
| 8 | Unbounded full-clone history | Slow undo/redo with dense annotations | Depth cap ~100 + cheapen snapshots | M |
| 9 | SVG exports clean (not hand-drawn), magnifier rasterized | Feature promise broken | rough.js SVG paths + fixes | M |
| 10 | Beautify requires 4 sliders; frames render only at export | Users can't make it look good fast | Curated presets + live frame preview | M |
| 11 | Eraser deletes whole elements without preview | Destructive surprise | Highlight targets + better cursor | S |
| 12 | Mobile parity incomplete (verify magnifier handles, transformer touch, pinch+drag edge cases) | Tablet/phone users blocked | Touch pass across tools | M |
| 13 | OCR may fetch lang-data from CDN (paths 404) | Offline OCR claim breaks | Vendor worker+lang-data locally | S |

### P2 - Polish
- Zoom-to-selection shortcut; layer-order shortcuts (`]`/`[`); filename timestamps; export preset memory; undo for canvas-style changes; first-run interactive onboarding; PWA screenshots+shortcuts; offline empty-state copy; text tool bold/italic/alignment + size presets; live browser-chrome frame; analytics toggle UX in Settings; settings drawer focus trap (a11y).

### P3 - Nice to have
- Pointer pressure/tilt for pencil; pencil point-sampling throttle; copy-style persistence across sessions; `Cmd+Enter` quick download; toolbar tips on mobile bottom; screen-capture → auto-activate Crop.

---

## 21. Technical Roadmap (sequence)

1. **Phase A - Trust & correctness (P0):** GA disclosure + privacy page + analytics toggle; slider commit-on-release; session recovery prompt; route swap with server-rendered landing; enable strictMode + `ignoreBuildErrors:false`, fix surfaced issues; delete dead deps/code; add CI.
2. **Phase B - Export & data (P1):** single-pass export pipeline + styled-canvas cache; image cap with opt-out; history cap + cheapen snapshots; verify/vendor OCR assets.
3. **Phase C - Product polish (P1/P2):** beautify presets; device-frame system with live preview; SVG fidelity; eraser preview; first-run onboarding; PWA screenshots/shortcuts; text tool upgrades; touch parity pass.
4. **Phase D - Growth & maintenance:** sitemap + docs pages; keyboard extras (zoom-to-selection, layers); export memory; perf profiling on large images; then automated tests if volume justifies.

**Architecture guardrails while building:** keep the settings registry single-source; share geometry between canvas/export/SVG (do not fork); keep everything client-side; extend the window-event pub/sub for new actions (clipboard/new-file) so mobile sheets and desktop stay in sync.

---

## 22. Design System Roadmap

- Preserve tokens (warm neutrals + orange accent, `--canvas/--surface/--border`, floating-shadow, duration vars).
- Add a **Presets spec**: each beautify preset = a `CanvasStyle` record + label + mini-preview swatch (render a tiny version of the image with the style applied).
- **Frame system spec:** frames as layered SVG/canvas drawables with editable fields (browser URL, device model), theme-aware colors (light/dark variants), live + export using one renderer.
- Interaction tokens: tooltips, kbd chips, pills, icon buttons already consistent - codify cursor spec (SVG halo cursors) and selection accent (CSS-var driven) as documented patterns.
- A11y tokens: maintain ≥ 4.5:1 muted-foreground, 44px coarse-pointer targets, focus rings on all controls.

---

## 23. Performance Roadmap

- **Input:** slider commit-on-release; pencil point throttle (~every 1–2 pointermove or rAF-coalesce like the magnifier); verify no per-frame allocations in draw paths.
- **Render:** memoize element renderers by props; batch store updates during drags (`updateElementSilent` + commit pattern - already used; extend to all drags); consider `useShallow` selectors for arrays.
- **Memory:** cap image size (default 4096) with opt-out; share data-URLs across history (already); autosave writes Blob → convert to data-URL lazily on restore.
- **Export:** one rasterization pass; cache the styled canvas per (image, style, format) key; move encode to a Worker where possible; show progress for large exports.
- **Measure:** ad-hoc profiling now (perf marks around export, paste-to-ready, drag FPS); automated perf benchmarks only when testing is adopted.

---

## 24. Testing Roadmap (deferred by decision)

Owner chose **manual QA for now**. When the team is ready (suggest after Phase A/B), the minimum high-value suite:
- **Unit:** `curve`, `magnifier-geometry`, `selection` bounds, history transitions (incl. crop undo + step counter), `settings-sync` mapping + scale invariance.
- **E2E (Playwright):** paste → annotate → copy/download round-trip; URL import error path; session recovery; theme toggle; PWA install smoke.
- **Visual regression:** tool states, dialogs, both themes, export dialog.
- **Performance smoke:** 4096px image + 100 annotations: load, draw, undo, export timing budget.

---

## 25. Snapty 2.0 - Feature Specification Summary

1. **Routing:** `/` = server-rendered marketing landing (SEO-first), `/editor` = app (deep-link preserved, `/info` redirects), sitemap + docs.
2. **Trust:** privacy page, disclosed + switchable analytics, zero uploads, "Recover last session?".
3. **Speed:** paste→annotate→copy < 30s; Copy is the hero action; export pipeline fast even on 4K.
4. **Identity:** hand-drawn defaults everywhere (shapes, text, magnifier rings, cursors); crisp mode available.
5. **Beautify:** curated one-click presets + manual sliders; live device frames (browser/iPhone/iPad/Android) with editable chrome.
6. **Tools:** 16 visible (Diamond, Rounded-rect hidden); text upgraded (sizes, bold/italic, alignment); eraser previews targets; magnifier/crop/spotlight/OCR retained.
7. **Undo:** capped, single-step-per-gesture, style-aware, image-and-tool correct.
8. **Mobile:** full parity across tools and gestures.
9. **PWA:** screenshots, shortcuts, offline copy, session recovery.
10. **Engineering:** strictMode on, type-checked builds, CI, no dead deps, maintained registry/geometry single-sources.

---

## 26. Open Questions / Deferred (for later rounds)

1. Exact beautify preset names/looks (propose 4–5; owner picks).
2. Default filename convention (`snapty-export-2026-08-12.png` vs configurable).
3. Whether the analytics toggle defaults ON or OFF (privacy vs insight tradeoff - owner leaned keep-GA, so default ON + disclosed, but confirm).
4. Whether undo should cover canvas-style changes (recommended yes - one step).
5. 45° snapping on Shift for arrows/lines (recommend: keep current freedom; revisit with data).
6. Pencil pressure support (cheap; nice for tablets - confirm interest).
7. Competitive deep-dive (CleanShot/Shottr/Snagit feature-by-feature) - can be a follow-up research task.
8. OCR quality improvements (multi-language, `langPath` vendor) - scope for later.

---

## 27. Sources

- Full repository read: store, canvas, all components/hooks/lib, configs, PWA, landing, metadata, headers, deployment docs.
- Interview: 5 rounds, 22 decisions (see §3).
- No code was changed in producing this spec.
