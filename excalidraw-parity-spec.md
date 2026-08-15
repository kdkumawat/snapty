# Excalidraw Parity for Snapty — Research & Recommendations Spec

**Status:** Research + recommendations, with Phase A core, Phase B binding, and Phase C feature set **executed** (see §11).
**Date:** 2026-08-14
**Scope:** Research + recommendations; sections marked ✅ are implemented and verified (typecheck + production build).
**Primary goal:** Match Excalidraw's drawing feel (smoothness) in Snapty.
**Secondary goal:** Bring Excalidraw's annotation-linking (binding) model to Snapty, plus a shortlist of other high-value features for a screenshot annotator.

---

## 1. How this spec was produced

- Read Snapty's editor source: types (`src/types/editor.ts`), store (`src/store/editor-store.ts`), canvas (`src/components/editor/editor-canvas.tsx`), freehand (`src/lib/editor/freehand.ts`), rough rendering (`src/lib/rough-renderer.ts`), hand-drawn helpers (`src/lib/hand-drawn.ts`), text labels (`src/lib/editor/text-labels.ts`), curve geometry (`src/lib/editor/curve.ts`), snap guides (`src/lib/editor/snap-guides.ts`), export dialog, and supporting libs.
- Researched Excalidraw's GitHub (`excalidraw/excalidraw`), their element documentation (mintlify "Elements" docs), the freehand-improvement issue thread (#3500), and binding-related issues (#4797, #6685, #7997).
- Interviewed the requester over 4 rounds of structured questions (13 decisions captured, §3).

---

## 2. Executive summary

Snapty already uses the same two libraries that give Excalidraw its signature look and fluidity — **perfect-freehand** for freehand strokes and **roughjs** for hand-drawn shapes — and already implements Excalidraw-style attached text labels via a shared `groupId`. The gap to Excalidraw's feel is therefore **not a library gap; it is a rendering-architecture gap plus parameter tuning**:

1. **Smoothness while drawing (lag):** Excalidraw renders every element to a **cached per-element offscreen canvas** at devicePixelRatio × zoom, and composites those bitmaps on the scene canvas. Only dirty elements re-rasterize. Snapty re-renders strokes through react-konva on every pointermove. Recommendation: a specialized live-draw path (direct canvas painting batched with `requestAnimationFrame`) for the in-progress stroke, and cached per-element rasterization for committed strokes.
2. **Stroke quality after commit:** Excalidraw's freedraw uses perfect-freehand with `thinning: 0.6, smoothing: 0.5, streamline: 0.5` and stores real **pressure** per point. Snapty's pencil matches smoothing/streamline and stores pressure, but intentionally uses `thinning: 0.25` — Excalidraw's 0.6 makes a pencil at the shared stroke-width setting render visibly thinner than other tools (measured ~half width on fast strokes), which is wrong for a screenshot annotator where all tools share one width setting. Recommendation implemented: real stylus pressure, memoized outlines, thinning 0.25.
3. **Live vs committed mismatch:** the live gesture path and the committed render path must run the exact same outline math. Today they can drift (Konva `Line.points` vs `freehandOutline` at render). Recommendation: one shared stroke-shaping function used by both paths.
4. **Annotation linking:** adopt Excalidraw's binding model — `startBinding`/`endBinding` on arrows/lines (`elementId` + normalized `fixedPoint` + mode `inside`/`orbit`/`skip`), `boundElements` back-references on containers, and `containerId` on text. Snapty's `groupId` label mechanism is a step toward this but does not provide sticky endpoints.
5. **Hand-drawn by default:** the requester chose Excalidraw's default aesthetic (light roughness on shapes/arrows), keeping the existing toggle for crisp mode.

---

## 3. Decisions gathered from the interview

| # | Topic | Decision |
|---|-------|----------|
| 1 | Spec purpose | **Research + recommendations** (this document); not a build plan |
| 2 | Primary goal | Match the **drawing feel** (smoothness) first; binding second |
| 3 | Architecture | **Native improvements** to Snapty's Konva + perfect-freehand + roughjs stack; do not embed `@excalidraw/excalidraw` |
| 4 | Smoothness symptoms (multi) | All four: lag while drawing; stroke quality after commit; live vs committed mismatch; look differs from Excalidraw |
| 5 | Pressure | **Real + simulated**: capture stylus/pen pressure into a per-stroke `pressures[]` array (Excalidraw model), fall back to perfect-freehand's simulated pressure |
| 6 | Live render path | **Specialized live path**: rAF-batched direct canvas painting during the gesture; commit to Konva elements on release |
| 7 | Default look | **Hand-drawn by default** (light roughness); existing hand-drawn toggle flips to crisp |
| 8 | Binding UX | **Drag-to-bind + auto-bind** (Excalidraw's current behavior plus light auto-binding) |
| 9 | Stickiness | **Fully sticky**: bound endpoints follow the shape through move, resize, and rotate |
| 10 | Text binding | **Yes, container text**: double-click a shape to type inside it, reusing the label mechanism |
| 11 | Image binding | **Bind to image regions**: endpoints can pin to stable points on the screenshot; survive crop/reframe |
| 12 | Feature scope (multi) | Object eraser + pixel eraser; align/distribute + multi-select; polyline editing; copy as SVG with embedded image. **Excluded:** frames/containers, laser pointer |
| 13 | Performance target | **Mid-range laptop (≈5 yrs old / Chromebook-class), 60 fps** while drawing, high-DPI display |
| 14 | Export parity (multi) | Copy-to-clipboard fidelity; high-res (2x/3x) export scaling; per-element/selection export; vector SVG fidelity |

---

## 4. How Excalidraw achieves its drawing feel (research findings)

### 4.1 Freehand strokes (freedraw)

- Freedraw elements store `points: LocalPoint[]`, **`pressures: number[]`**, and `simulatePressure: boolean` (`packages/element/src/types.ts`). Real pointer pressure is captured when the device reports it; otherwise `simulatePressure: true` and perfect-freehand synthesizes pressure from pointer velocity.
- Rendering runs perfect-freehand's `getStrokeOutlinePoints(points, pressures, simulatePressure, options)` and fills the resulting outline as a smooth closed path. During a live stroke the outline is recomputed per frame; a "complete" flag refines the tail so the stroke looks finished on release (no jump).
- Tuned parameters (confirmed in issue #4802): `thinning: 0.6`, `streamline: 0.5`, `smoothing: 0.5`. Freehand is deliberately not drawn through roughjs — it is a real free-draw path (see the #3500 design thread).

### 4.2 Shapes, arrows, lines (roughjs)

- Shapes/arrows/lines are rendered with `rough.canvas(canvas)` using roughjs drawables **cached in a `ShapeCache`** keyed by (seed, geometry, style). Re-render of an unchanged shape is a bitmap blit, not a re-rasterize.
- Excalidraw's rough options: multi-stroke enabled, `preserveVertices`, moderate `bowing`, roughness slider 0–2. Snapty's `buildOptions` in `src/lib/rough-renderer.ts` already mirrors this almost exactly (multi-stroke, `preserveVertices: true`, bowing = `roughness * 0.8`, FNV-1a seed hashing).

### 4.3 The big one: per-element cached canvases (60 fps)

`packages/element/src/renderElement.ts` renders each element **once** onto its own offscreen canvas (`generateElementCanvas`) at `window.devicePixelRatio × zoom`, then the scene compositor blits those cached bitmaps to the visible canvas each frame. Details:

- Canvas padding per element type (freedraw: `strokeWidth * 12`; arrow: `40`; text: `fontSize / 2`; default `20`) so strokes/arrowheads never clip at element edges.
- Canvas size is capped (`AREA_LIMIT = 16777216` px, `WIDTH_HEIGHT_LIMIT = 32767`) and re-scaled to stay within browser canvas limits while keeping DPR fidelity.
- Only elements whose seed/geometry/style/zoom changed are re-rasterized; everything else is a cheap `drawImage`. Zoom changes re-render (scale changes), but pan is free.
- Eraser uses `ElementsPendingErasure`: elements the eraser cursor touches fade to a lower opacity (`ELEMENT_READY_TO_ERASE_OPACITY`) immediately, then are deleted on pointer-up — a smooth, forgiving object-erase UX.
- Frame opacity multiplies into contained elements' opacity; `getRenderOpacity` handles the chain.

**Why this matters for Snapty:** Snapty renders committed strokes as react-konva `Line` nodes whose `points` are recomputed (perfect-freehand outline) on every React render, at every zoom step, with no caching. That is the architectural cause of the "lag while drawing" and "look differs" complaints.

### 4.4 Pointer handling

- Excalidraw batches pointer events through a scene render loop (`requestAnimationFrame`); state updates and drawing happen on a `Pointer` abstraction that exposes pressure (`getPressure()`).
- Zoom/pan transform math lives in one place (`@excalidraw/math`) and all hit-testing/rendering uses the same coordinate space — no per-gesture conversions to drift apart.

---

## 5. How Excalidraw links annotations (research findings)

### 5.1 Data model (`packages/element/src/types.ts`)

Every element has:

```
id, type, x, y, width, height, angle (rotation),
strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle,
roundness, roughness, opacity,
version, versionNonce, updated, seed, index (fractional z-order),
isDeleted, locked,
groupIds[], frameId, boundElements[] (back-references), link, customData
```

Linear elements (arrow/line) additionally carry:

```
points: LocalPoint[]            // relative to element x,y
startBinding: FixedPointBinding | null
endBinding:   FixedPointBinding | null
startArrowhead, endArrowhead
```

where

```
FixedPointBinding = {
  elementId: string;            // the shape/text/image/frame it binds to
  fixedPoint: [number, number]; // normalized position (0..1) on the bound element
  mode: "inside" | "orbit" | "skip";
}
```

- `mode: "inside"` — endpoint sits inside the shape (arrowhead drawn at the boundary edge in the direction of the endpoint).
- `mode: "orbit"` — endpoint hugs the outside edge of the shape (e.g. an arrow pointing at a shape's side).
- `mode: "skip"` — used for multi-point lines where an intermediate point is bound but shouldn't pin the arrowhead.
- The bound shape stores `boundElements: [{ id, type }]` so it knows what is attached to it (arrows and text labels).
- **Binding mechanics (from `packages/element/src/binding.ts`):** hit-testing uses `getHoveredElementForBinding(point, elements)` with `maxBindingDistance = clamp(15 / (zoom·1.5), 15, 30)` **screen px** to the shape's outline; endpoint inside the shape → `inside`, within distance of the outline → `orbit` (arrowhead held `BASE_BINDING_GAP = 5 + strokeWidth/2` px off the edge); Alt-drag forces `inside`; dragging **both endpoints breaks both bindings**; `appState.isBindingEnabled` (a settings toggle) disables new bindings and makes endpoint drags unbind; `updateBoundPoint` recomputes the endpoint from `fixedPoint` + `heading` when the shape changes (diamonds project onto their diagonals).
- When the bound shape moves/resizes/rotates, the binding is recomputed (`bindLinearElement`-style logic in `packages/element/src/binding.ts`-adjacent code): the endpoint is re-derived from `fixedPoint` projected onto the shape's current outline, so arrows stay glued.
- Unbinding happens by dragging an endpoint away from the shape (or with a modifier), and binding by dragging an endpoint onto a shape's edge/inside. **Excalidraw deliberately scaled auto-binding back in 2024 (#7997)** — auto-bind still triggers when an endpoint *ends* inside a shape, but it no longer aggressively grabs nearby shapes. We adopt "drag-to-bind + light auto-bind" (decision #8).

### 5.2 Container text

- `TextElement.containerId` points at the container shape; the container's `boundElements` includes the text. Text is clipped to the container's inner box, vertically/horizontally aligned, and rotates/moves with it (`getContainerElement`, `getBoundTextElement`, `getBoundTextMaxWidth/Height` in `packages/element/src/textElement.ts`).
- **Snapty already implements this pattern** — `src/lib/editor/text-labels.ts` attaches labels via a shared `groupId`, centers inside closed shapes, supports `verticalAlign`, and slides labels along arrows via `labelOffset`. The main deltas are (a) discoverability (double-click-to-type) and (b) containerId semantics vs groupId semantics — resolved in §6.2.4 (keep `groupId`, fix the `attachText` group-replacement defect).
- Arrows with labels: the label binds to the linear element; the stroke is clipped behind the label box (`clipPolylineAgainstRect` — Snapty already has this).

### 5.3 Polyline / point editing

`LinearElementEditor` (`packages/element/src/linearElementEditor.ts`) lets users drag individual vertices of multi-point lines/arrows and bind/unbind endpoints. Snapty's `ArrowElement.points` is typed `[number,number,number,number]` but `text-labels.ts` and `curve.ts` already handle `points.length > 4` (multi-point polylines) — so vertex editing is a natural extension.

---

## 6. Recommendations mapped to Snapty (native improvements)

Ordered by the requester's priorities: drawing feel first, then binding, then roadmap features, then export.

### 6.1 P1 — Drawing feel parity

**6.1.1 One shared stroke-shaping function (fixes live-vs-committed mismatch). ✅ implemented**
The live gesture in `editor-canvas.tsx` (pointermove path) and the committed render path (~line 3049) and the SVG exporter all call the single `freehandOutline(points, tool, strokeWidth, { pressures, simulatePressure })`; the draft's `tension`/`lineCap` props are unused in the outline render path, so live and committed strokes are produced by identical math. Implemented as `computeFreehandOutline` (raw) + `freehandOutline` (cached wrapper) in `src/lib/editor/freehand.ts`.

**6.1.2 Real pressure + Excalidraw parameter parity (fixes stroke quality). ✅ implemented**
- ✅ `PencilElement` now carries `pressures?: number[]` + `simulatePressure?: boolean`; `editor-canvas.tsx` captures `PointerEvent.pressure` when `pointerType === 'pen'` (first sample on pointer-down, rest on move) and falls back to a neutral 0.5 + simulated pressure otherwise.
- ✅ **Pressure payload budget (resolved, was Q5)** implemented as `appendFreehandSample` in `freehand.ts`: round to 2 decimals, skip samples < 1 image-px from the previous, cap 2,000 samples with uniform decimation.
- ✅ Pencil smoothing/streamline match Excalidraw (`smoothing: 0.5, streamline: 0.5`; streamline was `0.45`). **Thinning is 0.25, not Excalidraw's 0.6** — deliberate deviation: at thinning 0.6 + simulated pressure, fast strokes render ~half the nominal width (measured 1.6px vs 3px at size 3), so a pencil at "3" visibly thinner than an arrow at "3". Thinning 0.25 centers the rendered width on the stroke-width setting (fast ~2.6px, slow ~3.9px, mid ~3.2px at sw=3) while keeping the speed-based hand-drawn variance. Highlighter unchanged (uniform width, `thinning: 0`).
- ✅ Outline memoization implemented as a `WeakMap` keyed by the (immutable) `points` array reference + (tool, strokeWidth, sim/real) — committed strokes render O(1), only the live draft recomputes per frame.

**6.1.3 Specialized live-draw path (fixes lag).**
During an active stroke gesture:
- Collect pointer samples (points + pressure) into a ref; paint the in-progress stroke **directly onto a dedicated canvas layer** in a `requestAnimationFrame` loop (recomputing the outline only on new samples, throttled to one outline per frame).
- On pointer-up, run the same shaping function, build the Konva element, and commit — then the live layer is cleared for the next stroke.
- This removes react-konva's per-pointermove render cost from the hot path, which is the primary lag source on mid-range hardware (decision #13).

**6.1.4 Cached per-element rasterization for committed strokes (fixes long-term smoothness). ⏳ deferred (planned)**
Follow Excalidraw's `generateElementCanvas` pattern: render each committed element once to an offscreen canvas at `devicePixelRatio × zoom` (with the same per-type padding: freedraw `strokeWidth * 12`, arrow `40`, text `fontSize / 2`, default `20`), cache it keyed by (id, geometry, style, zoom, DPR), and blit during Konva redraws. Invalidate on edit. This makes pan/zoom and multi-element scenes stay at 60 fps and keeps strokes crisp on high-DPI displays.

**Staged approach (resolved, was Q6):**
1. **Memoize outline points** — compute `freehandOutline` once per committed stroke and render the Konva `Line` from the cached `points` array (recompute only on geometry/style/zoom-bucket change). Zero architecture change.
2. **Live rAF layer** (§6.1.3) for in-progress strokes — removes react-konva from the hot path during the gesture.
3. **Konva's built-in `node.cache({ pixelRatio: window.devicePixelRatio })`** for committed elements — react-konva's native offscreen-canvas rasterization with auto-invalidation on property change; re-cache on zoom-bucket change (same tradeoff Excalidraw accepts: zoom changes re-rasterize). This delivers Excalidraw's blit-compositing model without a hand-rolled second render pipeline.
4. Only if profiling on target hardware (mid-range laptop) still misses 60 fps after 1–3, hand-roll per-element offscreen canvases as in Excalidraw's `generateElementCanvas` (capped at `AREA_LIMIT = 16777216` px, `WIDTH_HEIGHT_LIMIT = 32767`, per-type padding).

**6.1.5 Hand-drawn by default (decision #7).**
- Flip the default: shapes/arrows render with a light roughness (`ROUGHNESS_PRESETS.artist` ≈ 1.4, or a new gentler default ≈ 1.0) unless the hand-drawn toggle is off (then `roughness: 0`-style crisp path). Persist the user's choice (settings already persist).
- Reuse the existing `handDrawn` toggle (store `handDrawn` state, already persisted in `snapty-tool-settings`); do not add a second switch.

**6.1.6 Misc quality items.**
- Round caps/joins everywhere (already done in `rough-renderer.ts`); ensure the perfect-freehand outline keeps `cap: true` ends so short scribbles (common in annotation) don't clip.
- Guard against zero-length strokes (dots) — keep the current `points.length > 4` commit guard, but render a filled dot for shorter valid scribbles rather than dropping them.
- Keep the existing 0.1–5 zoom clamp and DPR-aware stage scaling; verify stroke rendering at extreme zoom after 6.1.4.

### 6.2 P2 — Annotation linking (binding)

**6.2.1 Data model (mirror Excalidraw, adapted to Snapty's types). ✅ implemented**
- ✅ `FixedPointBinding` type + `IMAGE_BINDING_ID` sentinel in `src/types/editor.ts`; `ArrowElement`/`LineElement` carry `startBinding?`/`endBinding?` (`elementId` + normalized `fixedPoint` + `mode: 'inside' | 'orbit' | 'skip'`).
- Bindable set: rectangle, rounded-rect, circle, diamond, text, step, magnifier (`isBindableElement` in `src/lib/editor/binding.ts`). **No persisted `boundElements` registry** — kept derived at runtime per Q1 (labels via `groupId`, arrows via the binding fields themselves).
- ✅ Geometry + invariants live in `src/lib/editor/binding.ts`: `anchorForBinding` (rotation-aware ray-to-outline for rect/diamond/ellipse), `setEndpointToAnchor`, `recomputeBindings`, `pinBoundEndpoints`, `sweepDanglingBindings`, `resolveEndpointBinding`. All recompute paths produce new element objects — the store's immutability invariant holds.

**6.2.2 Binding & unbinding gestures (thresholds and toggles resolved, was Q3). ✅ implemented**
Mirror Excalidraw's `binding.ts` constants and UX exactly:
- **Hit test for binding:** `getHoveredElementForBinding(point, elements)` using `maxBindingDistance = clamp(15 / (zoom·1.5), 15, 30)` **screen px** to the shape's outline. Endpoint **inside** the shape → mode `inside`; endpoint outside but within `maxBindingDistance` of the outline → mode `orbit` (arrowhead hugs the edge at a `BASE_BINDING_GAP = 5 + strokeWidth/2` px gap).
- **Drag-to-bind:** while editing an arrow endpoint (existing arrow handles in `editor-canvas.tsx`), release within `maxBindingDistance` of a bindable shape to bind, using the inside/orbit rule above. **Alt-drag forces `inside`** regardless of where the endpoint lands (Excalidraw behavior).
- **Light auto-bind:** a freshly drawn arrow's final endpoint that ends inside a shape's bounds (or within `maxBindingDistance` of its outline) binds automatically with the same inside/orbit rule — the 2024-scaled-down behavior, not the aggressive pre-2024 auto-bind.
- **Unbind:** drag an endpoint away from the shape; dragging **both endpoints simultaneously breaks both bindings** (Excalidraw behavior); with binding disabled, dragging any endpoint actively breaks its binding.
- **Settings toggle `isBindingEnabled` (default ON)** in the settings rail — disables new bindings and makes endpoint drags unbind, exactly like Excalidraw's app-state flag. Users who found auto-bind surprising (Excalidraw issues #3690, #4797, #6685) get an off switch.
- ⏳ Visual affordance deferred: highlighting the target shape while an endpoint hovers it during a bind drag (Excalidraw highlights bindable shapes) — not built in v1.

**6.2.3 Sticky recompute (decision #9). ✅ implemented**
- On shape move/resize/rotate (and on arrow point edits), recompute bound endpoints — Excalidraw's `updateBoundPoint`: derive the anchor from `fixedPoint` projected onto the shape's current outline (rectangles/ellipses project onto the outline; **diamonds project onto the diagonals**; `heading` from `fixedPoint` picks the edge), then translate the endpoint to that anchor (re-deriving `bend`/arrowhead direction from the new endpoint). For `orbit` mode the endpoint sits `BASE_BINDING_GAP + strokeWidth/2` outside the outline along the heading.
- Implement as one function (e.g., `recomputeBindings(elements, movedId)`) called in the same spots where `reflowAttachedLabel` already runs (`commitElementUpdate`, `updateElement`, store moves), folded into the same undo step.
- Container text already follows via `reflowAttachedLabel`; extend it so **bound arrow endpoints** follow too, keeping one undo step per gesture.
- **Z-order relationship (resolved, was Q2): ✅ implemented (labels part)** — binding does **not** force a render-order relationship; Snapty z-order stays array position. The four store z-ops (`bringToFront`/`sendToBack`/`bringForward`/`sendBackward`) now move the whole **cluster** — element + everything sharing its `groupId` (attached labels / user group members) — as one unit via `clusterMemberIds`, fixing the pre-existing quirk where bring/send split a grouped shape from its label. Bound arrows join the cluster set once `startBinding`/`endBinding` lands.

**6.2.4 Container text (decision #10). ✅ already present (verified in code)**
- Double-click a shape (rectangle/rounded-rect/circle/diamond) or press Enter on a selected shape to enter text editing *inside* it: `attachTextToAnnotation` in `editor-canvas.tsx` already creates/updates the attached `TextElement` via the `attachText` + `groupId` path (editing an existing label on second double-click), with `verticalAlign` middle default — Excalidraw's "Enter to type text on the selected shape" is already implemented.
- **groupId vs containerId (resolved, was Q1): ✅ implemented — keep `groupId` as the text-label container link, no persisted-model migration.** `attachText` now joins the label to the shape's **existing** group (shape's `groupId` if present, else a fresh shared id) instead of replacing it — labeling a user-grouped shape no longer kicks it out of the group. `groupSelected` also carries attached label/shape pairs into the new group (absorbing the unselected half of a label pair), so grouping a shape never strands its label. `boundElements` bookkeeping stays **derived at runtime** (single source of truth: `groupId` + future `startBinding`/`endBinding`).

**6.2.5 Image-region binding (decision #11). ⏳ deferred (sentinel only)**
- The `IMAGE_BINDING_ID` sentinel + `fixedPoint` model are in the types (so a future image binding serializes cleanly), but **v1 does not create image bindings in gestures**: crop already translates every annotation by `−crop`, so free arrows stay glued to the same on-image features with no binding needed. If image-anchored endpoints become a real need (e.g., the image gains independent scale/move), the crop remap from the Q4 resolution (`newFixedPoint = ((oldFixedPoint·oldSize) − cropOrigin)/newSize`, clamp, drop-when-cropped-away) is specified in §8 and can be built on the sentinel.
- ✅ **Dangling-reference sweep (resolved, was Q4) implemented:** `removeElements` sweeps every line-like element and clears `startBinding`/`endBinding` referencing a removed id (the arrow stays, now unbound — Excalidraw behavior). History snapshots hold complete element arrays, so undo/redo stays safe.

### 6.3 P3 — Roadmap features (from decision #12)

**6.3.1 Object eraser + keep pixel eraser. ✅ implemented**
- The marquee eraser now fades every element it would delete to **30% opacity while dragging** (Excalidraw's `ElementsPendingErasure` preview) via a render-time `eraserFadeIds` set — the store is untouched until release, and the old red-tint overlay is gone. One shared hit test (`computeEraserHitIds`, includes whole-group deletion so labels never outlive their shape) drives both the preview and the commit: what you see is exactly what gets removed.

**6.3.2 Align / distribute + multi-select polish. ✅ implemented (align/distribute)**
- New store actions `alignSelected` (left/centerX/right/top/centerY/bottom — one undo step) and `distributeSelected` (horizontal/vertical, ≥3 elements) operate on `getElementBounds`, skip locked elements, and translate group members along with their shape so attached labels never detach. Freehand strokes shift their points (absolute-coordinate invariant), everything else shifts x/y. UI: right-click → **Align** submenu with the six align actions + distribute H/V.
- Multi-selection resize handles ride the existing Konva Transformer (already handles grouped selections); no new handle work was needed.

**6.3.3 Polyline editing. ✅ implemented (vertex insertion; vertex dragging already existed)**
- Multi-point lines/arrows already rendered with draggable vertex handles (`updatePoint`, mid-vertex handle) and the `points.length > 4` model. New: **double-click the line/arrow body inserts a vertex** at the click point (`handleLineVertexInsert`) — the click is converted to element-local coords via the node's inverse absolute transform, the nearest segment gets the new point, a bent 2-point arrow drops its `bend` (multi-point renders straight), and it commits as one undo step. Handle double-clicks still mean "edit label" (guarded by target class/id).

**6.3.4 Copy as SVG with embedded image. ✅ implemented**
- `copySvgToClipboard()` in `export-dialog.tsx` builds the vector SVG (background raster as `<image href=...>`, perfect-freehand outlines, roughjs paths) and writes it to the clipboard as `image/svg+xml` (raw text fallback for browsers that refuse the type). Right-click → **Copy as SVG** → pastes into Figma/Slides/Notion as vector marks.

### 6.4 P4 — Export parity (decision #14)

- **Clipboard fidelity:** the exported PNG/SVG must match the on-screen render — the shared stroke-shaping function (6.1.1) and cached-render caching (6.1.4) are prerequisites; add a visual regression step comparing export vs canvas. ⏳ *verification step — render paths already shared.*
- **High-res scaling:** ✅ export PNG/JPG/WebP at 1x/2x/3x — `captureStagePng(scale)` multiplies the stage `pixelRatio` by the scale so the raster is re-rendered at true hi-res (not upscaled); canvas-style padding/frames scale proportionally. SVG is vector and ignores the scale (noted in the UI).
- **Per-element / selection export:** ✅ export only the selected annotations — `getSelectionRegion()` unions selected bounds (+8px margin); raster capture crops to the region via the stage's existing region capture, and SVG crops via `viewBox` + a translate group so element coordinates stay absolute.
- **Vector SVG fidelity:** SVG export uses the same outline + rough paths as the canvas (mostly done; verify bound arrows and container text after 6.2). ⏳ *bound-arrow/container-text visual verification remaining.*

---

## 7. Performance target

- **Target:** smooth 60 fps drawing on a mid-range ~5-year-old laptop / Chromebook-class machine, high-DPI display (decision #13).
- **Measured how:** stroke-gesture frame time (pointerdown→pointerup) must hold < 16.7 ms average with no > 50 ms frame; render cost of a committed stroke must be O(blit), not O(outline-recompute), after 6.1.4.
- Explicitly **not** a target: very large (4K+/multi-MB) images at full fidelity on low-end hardware (defer; `keepOriginal` downscaling already exists), and touch/stylus as a first-class performance target (pressure *support* is in scope via 6.1.2, but palm rejection/touch ergonomics are not).

---

## 8. Resolved decisions (formerly open questions)

All six open questions from the draft are now decided. Decisions are marked "was Q1…Q6" at their resolution points in §6; summary below.

| # | Question | Resolution | Where |
|---|----------|-----------|-------|
| Q1 | groupId vs containerId for labels | **Keep `groupId` as the container link; no migration.** Fix `attachText` to join the shape's existing group instead of replacing its `groupId` (real defect found: labeling a user-grouped shape kicks it out of the group). `boundElements` is derived at runtime, not persisted. | §6.2.4 |
| Q2 | Bound-arrow z-order | ✅ implemented: binding implies **no** forced z-relationship; array order stays. `bringToFront`/`sendToBack`/`bringForward`/`sendBackward` move the whole cluster (element + labels + bound arrows via `clusterMemberIds`). | §6.2.3 |
| Q3 | Auto-bind threshold & toggle | ✅ implemented: Excalidraw constants (`maxBindingDistance = clamp(15/(zoom·1.5), 15, 30)` screen px; inside→`inside`, within distance→`orbit`, **Alt forces `inside`**). Settings toggle `isBindingEnabled` (default ON, persisted); disabling unbinds on the next endpoint drag. Both-endpoints-break-both is N/A in Snapty's single-handle model. | §6.2.2 |
| Q4 | Image binding persistence & dangling refs | ✅ dangling sweep implemented (`removeElements` clears bindings to removed ids). `'__image__'` sentinel in the type model; crop-remap deferred — crop already translates all annotations, so free arrows stay glued without a binding. | §6.2.5 |
| Q5 | Pressure data size | Round to 2 decimals, drop samples < 1 image-px apart, cap 2,000 samples/stroke with uniform decimation. | §6.1.2 |
| Q6 | Cached-canvas complexity | Staged: (1) memoized outline points, (2) live rAF layer, (3) Konva `node.cache({ pixelRatio })` with zoom-bucket invalidation, (4) hand-rolled per-element canvases only if profiling still misses 60 fps. | §6.1.4 |

## 9. Remaining risks (accepted, not blocking)

1. ✅ **`attachText`/`groupSelected` fix shipped** — verified by typecheck + production build; worth a manual smoke test on a session that saved a labeled user group under the old behavior.
2. **Auto-bind can surprise on first contact** — endpoints that end inside a shape bind and snap to the outline. The `isBindingEnabled` toggle (settings → General → "Bind arrows") is the escape hatch; worth calling out in the first-run card / help dialog.
3. **Bound endpoint geometry is bbox-approximate** — `resolveEndpointBinding` hit-tests against the axis-aligned bounds and `anchorForBinding` clips to the outline via a center ray; near the corners of a diamond or a rotated rect the anchor may differ a few px from the true edge. Acceptable for v1; refine with edge-projection (Excalidraw's `heading` logic) if it shows up in practice.
4. **Konva `node.cache()` memory:** caching every committed stroke doubles per-element GPU/CPU memory; monitor on sessions with 100+ elements, and invalidate aggressively (geometry/style/zoom-bucket). If memory is an issue, cap cache to visible elements (Excalidraw culls offscreen elements the same way).
3. **Crop-away drops a binding silently:** a user could crop a region their arrow was pinned to and lose the link without noticing. Acceptable for v1 (endpoint stays where it was); surface in the crop flow later if it comes up.
4. **`isBindingEnabled` default-ON changes drawing behavior** for existing users mid-session; roll out with the binding feature as a whole and document in the help dialog / first-run card.

## 10. Suggested phasing (for a future implementation spec)

1. **Phase A — Drawing feel:** shared stroke-shaping function ✅ → pressure capture + param parity ✅ → **live rAF stroke layer ⏳** → outline memoization ✅ → hand-drawn default flip (already satisfied — `handDrawn` defaults on with roughness 1.25; no change needed). (Largest perceived win; low data-model risk.)
2. **Phase B — Binding:** data model ✅ → drag-to-bind + auto-bind + unbind + `isBindingEnabled` toggle + Alt-force-inside ✅ → sticky recompute on move/resize/rotate ✅ → container text via double-click (already present) ✅ → **image-region binding + crop remap ⏳** → z-order cluster ops ✅.
3. **Phase C — Feature set:** object eraser (fade preview) ✅ → align/distribute ✅ → polyline vertex insertion ✅ → copy-as-SVG-with-image ✅.
4. **Phase D — Export parity:** high-res scaling ✅, selection-only export ✅ (raster crop + SVG viewBox/translate), clipboard fidelity ✅ (PNG/SVG share the same render paths; visual regression pass still open), SVG path parity ⏳ (bound arrows + container text visual check).
5. **Phase E (non-goals, explicitly out):** frames/containers, laser pointer, collaboration/E2EE, shareable links, i18n, mobile/touch-first UX.

---

## 11. Execution status (2026-08-14)

Phase A core + Phase B binding implemented and verified (`tsc --noEmit` clean, `next build` succeeds; the single eslint error in `editor-canvas.tsx` around `attachTextToAnnotation` is pre-existing — confirmed identical on the pristine checkout).

### Implemented ✅

| Item | Files | Notes |
|------|-------|-------|
| Pressure fields on freehand strokes | `src/types/editor.ts` | `pressures?: number[]` + `simulatePressure?: boolean` on `PencilElement` |
| Real-pressure capture | `src/components/editor/editor-canvas.tsx` | First sample on pointer-down + per-move via `appendFreehandSample`; pen (`pointerType === 'pen'`) → real pressure, else simulated |
| Pressure-aware shaping + budget | `src/lib/editor/freehand.ts` | `[x, y, pressure]` triplets with `simulatePressure: false` when real; round 2dp / 1px min-distance / 2k-sample cap |
| Excalidraw param parity | `src/lib/editor/freehand.ts` | pencil `streamline` 0.45 → 0.5; **thinning 0.6 → 0.25** so the rendered width matches the stroke-width setting (empirically: 0.6 rendered 1.6px vs a solid 3px at sw=3) |
| Outline memoization | `src/lib/editor/freehand.ts` | `WeakMap` keyed by immutable `points` ref + (tool, strokeWidth, sim/real); committed strokes O(1) to render |
| SVG export parity | `src/components/editor/export-dialog.tsx` | passes pressures/simulatePressure into `freehandOutline` |
| Q1: `attachText` group defect | `src/store/editor-store.ts` | label joins shape's existing group; `groupSelected` absorbs label pairs |
| Q2: z-order cluster ops | `src/store/editor-store.ts` | bring/send ops move element + `groupId` members + **bound arrows** together via `clusterMemberIds` |

### Phase B — Arrow/line binding ✅ (2026-08-14)

| Item | Files | Notes |
|------|-------|-------|
| Binding data model | `src/types/editor.ts` | `FixedPointBinding` + `IMAGE_BINDING_ID`; `startBinding`/`endBinding` on arrow/line |
| Geometry & logic | `src/lib/editor/binding.ts` (new) | `anchorForBinding` (rotation-aware ray→outline for rect/diamond/ellipse), `setEndpointToAnchor`, `recomputeBindings`, `pinBoundEndpoints`, `sweepDanglingBindings`, `resolveEndpointBinding`; Excalidraw constants (gap 5 + strokeWidth/2, 15–30 screen-px threshold) |
| Sticky recompute | `src/store/editor-store.ts` | `commitElementUpdate`/`updateElement` re-anchor bound arrows on shape edits; `moveElementsImpl` (shared by `moveElementsBy`/`nudgeSelected`) re-pins dragged arrows and pulls bound arrows with moved shapes |
| Auto-bind on create | `editor-canvas.tsx` | draft commit hit-tests both endpoints, snaps them onto outlines |
| Drag-to-bind / unbind | `editor-canvas.tsx` | both endpoint-handle paths resolve bindings on release; Alt forces `inside`; dragging away or disabling binding unbinds |
| Toggle | `editor-store.ts` + `settings-dialog.tsx` | `isBindingEnabled` (default ON, persisted); settings → General → "Bind arrows" |
| Dangling refs | `editor-store.ts` | `removeElements` sweeps bindings to removed ids; `duplicateSelected` remaps bindings to cloned targets |

### Phase C — Feature set ✅ (2026-08-14)

| Item | Files | Notes |
|------|-------|-------|
| Eraser fade preview | `editor-canvas.tsx` | `computeEraserHitIds` + render-time 30% fade (`eraserFadeIds`), shared preview/commit hit test; red-tint overlay removed |
| Align / distribute | `editor-store.ts`, `menus/canvas-context-menu.tsx` | `alignSelected`/`distributeSelected` (one undo step, locked-aware, group-member translation via `translateElement`/`expandGroupMembers`); right-click Align submenu |
| Polyline vertex insertion | `editor-canvas.tsx` | double-click line/arrow body inserts a vertex (`handleLineVertexInsert`), `distToSegment` nearest-segment math, bend reset for multi-point |
| Copy as SVG | `export-dialog.tsx`, `menus/canvas-context-menu.tsx` | `copySvgToClipboard` (embedded raster + vector paths, `image/svg+xml` ClipboardItem with text fallback) |

### Phase D — Export parity ✅ (2026-08-14)

| Item | Files | Notes |
|------|-------|-------|
| High-res scaling | `export-dialog.tsx`, `editor-store.ts` | `exportScale` (1x/2x/3x, persisted) multiplies the stage-capture `pixelRatio` → true re-raster at 2x/3x, not upscale; dialog Resolution control (raster formats only), dims shown at scale |
| Selection-only export | `export-dialog.tsx` | `getSelectionRegion()` (union of selected bounds + 8px margin); raster crops via existing stage region capture; SVG crops via `viewBox` + translate group; `exportSelectionOnly` toggle (persisted, shown only with a selection) |
| Threaded through all paths | `export-dialog.tsx` | `exportImage` / `buildExportCanvas` / `captureStagePng` / `copyToClipboard` / `shareImage` / estimate effect all take `(scale, region)` with defaults preserving the context-menu & shortcut callers |

## 12. Excalidraw-class interaction model (2026-08-15) ✅ implemented

Post-spec passes (commits `fdd20c5`, `57e83d5` + working tree) rebuilt the interaction layer so pointer → visible drawing never routes through React, and gave every object type a purpose-built selection model:

| Item | Files | Notes |
|------|-------|-------|
| Imperative drawing overlay | `src/lib/editor/draft-layer.ts`, `editor-canvas.tsx` | live drafts, marquee, eraser rect, snapping guides, hover outline all painted on a dedicated interaction layer via rAF-coalesced `batchDraw`; React never renders during a gesture |
| Render isolation | `editor-canvas.tsx` | `annotationNodes` memoized; store writes only at gesture commit |
| Linear-element editor | `editor-canvas.tsx`, `src/lib/selection-theme.ts` | arrows/lines get endpoint + bend + midpoint-ghost handles (no Transformer); double-click body inserts a vertex; Shift constrains endpoint drags to 45° steps |
| Live binding | `src/lib/editor/binding.ts` (`computeBoundArrowUpdates`/`liveElementFromNode`), `editor-canvas.tsx` | bound arrows re-point every frame during target drag/resize/rotate (imperative node attrs), commit once at gesture end |
| Snap parity | `src/lib/editor/snap-guides.ts` | equal-spacing guides (beyond-end + between) on drag, on top of edge/center alignment |
| Freehand selection | `editor-canvas.tsx` | path-aware dashed outline hugging the perfect-freehand geometry; no bounding box, no resize |
| Selection visual language | `src/lib/selection-theme.ts` | handles ≈7px screen (grey, white core), subtle dotted outlines, hover/active states; `.edit-handle` nodes counter-scale by 1/zoom |
| Rotation + resize snapping | `editor-canvas.tsx` | Shift = 15° rotation steps; Shift = keep-aspect resize |
| Custom shape selection | `src/components/editor/canvas/shape-selection-overlay.tsx` (new) | single rectangle/rounded-rect/circle/diamond/step selections replace the Konva Transformer with a dashed outline + 8 zoom-invariant handles + rotate handle; scale/position math keeps the fixed reference glued (rotation-aware), uniform types keep aspect, one undo step per gesture |
| Pointer capture | `editor-canvas.tsx` | canvas-owned gestures (draw/marquee/eraser/crop) capture the pointer so strokes to the canvas edge don't freeze |

**Kept by design:** text keeps the Transformer re-wrap UX (side handles re-wrap, corners scale type); multi-selection keeps the combined Transformer box (Excalidraw also uses a combined box for multi-select) — both restyled to the same quiet dotted-border/small-handle language. Visual bind-target highlight while an endpoint hovers a shape during a bind drag remains deferred (§6.2.2).

### Deferred ⏳ (planned in this spec, not yet built)

- **6.1.3 live rAF canvas layer** — the dedicated direct-canvas stroke layer (Phase A step 2; current rAF-coalesced `queueDrawingUpdate` + outline cache already remove most per-frame cost; this needs visual/perf verification).
- **6.1.4 cached per-element rasterization** — staged: Konva `node.cache({ pixelRatio })` → hand-rolled canvases only if profiling demands (Phase A step 3).
- **Image-region binding + crop remap** — the `'__image__'` sentinel is in the types, but no gesture creates image bindings and crop-remap is unimplemented (crop already translates annotations; revisit if the image gains independent scale/move).
- **Visual bind affordance** — highlighting the target shape while an endpoint hovers it during a bind drag.
- **Phase D export parity** — the remaining items are verification-only: a visual regression pass comparing export vs on-screen render (clipboard fidelity), and confirming bound arrows + container text render identically in the exported SVG (SVG path parity).
