# Snapty vs Excalidraw — Interaction Architecture Gap Analysis

Pass date: 2026-08. Excalidraw reference: `master` at analysis time
(packages are `excalidraw`, `element`, `math` — the 2025 consolidation moved
`element/` out of the excalidraw package; `LinearElementEditor` now lives in
`packages/element/src/linearElementEditor.ts`, elbow arrows in
`packages/element/src/elbowArrow.ts`, snapping in `packages/excalidraw/snapping.ts`).

This is the gap analysis required by the "Rebuild the Interaction Model" pass.
It compares **behavioral architecture**, not just feature existence, and it is
the basis for the rewrites that follow. It also names the differences that
remain after implementation instead of hiding them.

---

## 1. What Excalidraw actually does (current source, verified)

### 1.1 Element geometry model

- Every element is plain data. Linear elements store `points: LocalPoint[]`
  **normalized so points[0] = [0, 0]**; the element's `x, y` is the path
  origin. Curvature (`roundness`) is a per-segment renderer concern layered on
  top of the *same* polyline data — the points are always real vertices.
- Arrows are `ExcalidrawArrowElement` with `elbowed: boolean`. Elbow arrows
  additionally carry `fixedSegments: FixedSegment[]` (user-fixed segments that
  survive re-routing) and `startIsSpecial` / `endIsSpecial` (which hide the
  first/last segment when a bound elbow arrow moves from a horizontal to a
  vertical side of its target).
- Bindings are `FixedPointBinding { elementId, focusPoint: [x, y] (normalized
  0..1 in the target's local box), gap }` on start/end. The focus point is
  **user-visible and user-movable**: the editor renders a dashed connection
  line from the arrow endpoint to the focus point and a small circle that can
  be dragged to move the attachment around the shape.
- Text on arrows/lines is a real `TextElement` with `containerId` pointing at
  the linear element (bound text). `getBoundTextElement` is the canonical
  lookup; the label reflows on every linear element mutation, including live
  drag frames.

### 1.2 Interaction state

- One `interactionState` object in App state holds the gesture: `interactive`,
  `dragging`, `resizing`, `rotating`, `scrolling`, `editing`, `multiSelecting`
  — a small finite set, not a soup of booleans.
- `selectedLinearElement: LinearElementEditor | null` is a first-class editor
  **object** owning: `elementId`, `isEditing`, `selectedPointsIndices`,
  `lastUncommittedPoint`, `segmentMidPointHoveredCoords`,
  `draggedFocusPointBinding`, `hoveredFocusPointBinding`, `customLineAngle`,
  and an `initialState` snapshot captured at gesture start. Point selection
  (shift-click), point dragging, midpoint hover and midpoint→vertex
  conversion all live in this one object.
- `POINT_HANDLE_SIZE = 10` screen px. Handle radius is 5 px idle, 10 px while
  `isEditing`. **Midpoint handles render at radius 5 (POINT_HANDLE_SIZE / 2)**,
  white fill with a purple outline, and only for elbow arrows or 2-point
  elements (or while editing / when bound text exists). Midpoint handles are
  always shown for 2-point elements — that is the primary "bend" affordance,
  and dragging one converts the midpoint into a real vertex.

### 1.3 Pointer pipeline

- `App.tsx` routes every canvas pointer event through one handler pair that
  reads `interactionState` + the hit test, and owns the gesture for its whole
  lifetime (pointer capture on the canvas). Konva is not the event backbone in
  Excalidraw; the app is. Node drags are imperative node mutations, not
  React state.
- During a gesture, the geometry mutates **imperatively** (canvas refs) and is
  committed to the scene store at gesture end; bound elements re-derive in the
  same pass (`updateBoundElements` walks the binding index, not the whole
  scene).

### 1.4 Linear element editing semantics (verified in `linearElementEditor.ts`)

- Segment midpoints: `getEditorMidPoints` returns one per segment, skipping
  too-short segments. Hover hit-testing is screen-space:
  `(POINT_HANDLE_SIZE + 1) / zoom`.
- Dragging a midpoint (`handlePointDragging` → `createPointAt`): the element
  **gains a real point at the pointer position** and the drag continues on
  that point — the `A ── B → A ──●── B` transition is continuous because the
  point IS the drag.
- Vertices drag with `updateBoundPoint` for bound ends (endpoint follows the
  target outline + focus point) and angle locking (`customLineAngle`, shift)
  for free ends.
- Points can be selected (shift-click), dragged together, and deleted (Delete
  key / alt-click while editing).
- Elbow arrows: interior vertices are NOT point handles; each segment shows a
  midpoint handle, and segments can be dragged as whole segments
  (`fixedSegments`). Routing is an A* search over a dynamic grid that avoids
  bindable shapes (`routeElbowArrow`, `generateDynamicAABBs`). Bound elbow
  endpoints re-route live when the target moves/resizes/rotates.

### 1.5 Binding (`binding.ts`, `arrows/focus.ts`)

- `updateBoundElements` — when a bindable element mutates, all arrows bound to
  it are re-derived from the binding metadata (live, per frame, via the scene
  store mutation path).
- Focus point dragging (`handleFocusPointDrag`): dragging the dashed-anchor
  circle updates `binding.focusPoint` in normalized target-local space; the
  endpoint follows on the same frame.
- Snap distance is screen-space: `maxBindingDistance_simple` = clamp(15/zoom…)
  — same convention Snapty already adopted.
- `snapToMid` — endpoint snapping to edge midpoints of the target.

### 1.6 Selection / transform

- Generic elements: 8 resize handles + 1 rotate handle, all screen-space
  sized, drawn on the interactive canvas (not DOM). Dashed selection outline.
- Rotation snapping: `shouldRotateWithDiscreteAngle` — with Shift held,
  rotation snaps to 15° steps (or grid-snapped). Plain rotation is free.
- Multi-selection: one bounding box, one gesture; `getSelectionFromElements`
  for outline.

### 1.7 Snapping (`snapping.ts`)

- Alignment + equal-spacing guides are computed from **reference snap points**
  (corners + edge midpoints + centers of non-selected elements) and rendered
  imperatively on the interactive layer. `snapDraggedElements`,
  `snapResizingElements`, `snapNewElement`. Snap distance zoom-aware.

### 1.8 Freehand

- Freedraw is `points + pressures`; selection hit-test is stroke-distance
  based; the selected stroke shows the raw path highlighted, not a fat box.

---

## 2. Snapty current architecture (verified in this repo)

- Store: Zustand (`elements: EditorElement[]`), commit-on-pointerup history
  (`pushHistory`), `updateElementSilent` (no history) + `commitElementUpdate`
  (history + label reflow + `recomputeBindings` when the edited element is
  bindable).
- Render: React-Konva stage with a Background layer, an Annotation layer
  (`renderElement` switch over element types), a Transformer/selection layer,
  and an imperative `DraftLayer` (raw Konva nodes, rAF-batched) for drafts,
  marquee, eraser rect, snap guides, binding preview, hover outline, label
  anchor dot.
- Linear elements: `points: [sx, sy, ex, ey]` local + scalar `bend`
  (quadratic Bézier) OR `points.length > 4` straight polyline. Both coexist;
  selection bounds, export, labels and clipping all handle both.
- Linear editing: inline in the arrow/line render case. Handles are Konva
  `Circle`s (endpoint / bend / middle-vertex / midpoint ghosts). Dragging the
  bend handle writes `bend` (quadratic curve) — **not a vertex**. Multi-point
  polylines show midpoint ghosts that DO insert real vertices.
- Binding: `FixedPointBinding { elementId, fixedPoint, mode: inside|orbit }`
  — matches Excalidraw's data shape. `recomputeBindings` re-anchors bound
  endpoints when a target commits (move/resize/rotate). Live target drags
  re-point bound arrows imperatively (`applyLiveBindingsForTarget`).
  Endpoint drags snap + preview binding (`snapEndpointForBinding`).
- Labels: text with `groupId` + `labelOffset`/`labelOffsetY`; reflows on
  arrow/label mutations.
- Snapping: `snap-guides.ts` — alignment + equal spacing for drags, rendered
  imperatively.
- Selection: `shape-selection-overlay.tsx` custom overlay for box shapes
  (dashed outline, 8 handles + rotate, imperative drags); arrows/lines use
  inline handles; text/images still use Konva Transformer.

---

## 3. Gap table

| # | Interaction | Excalidraw behavior | Snapty behavior | Architectural difference | Fix |
|---|-------------|--------------------|-----------------|--------------------------|-----|
| 1 | Rectangle creation | Drag from corner; preview on interactive canvas | Draft on DraftLayer, committed at up — matches | — | none |
| 2 | Rectangle selection | Dashed outline, screen-space handles on canvas | Custom overlay (dashed outline + handles) | small (rotating: snaps 15° w/ Shift) | none (rotate snap already) |
| 3 | Rectangle dragging | Whole-element translate, snap guides live | Konva node drag + snap guides | none | — |
| 4 | Rectangle resize | 8 handles, imperative, bound arrows re-derive per frame | Overlay handles, imperative, `applyLiveBindingsForTarget` | none | — |
| 5 | Rectangle rotation | Free + 15° snap w/ Shift | Overlay rotate, 15° snap w/ Shift | none | — |
| 6 | Multi-selection | One bounding box, one gesture | One box + one gesture (Transformer for some types) | visual only | — |
| 7 | Arrow creation | Drag; endpoint magnetic snap to shapes | Draft + binding preview + commit-time auto-bind | none | — |
| 8 | Arrow endpoint drag | Drag vertex; bound endpoint follows outline | Drag handle; binding resolve on release; shift 45° snap | close; Excalidraw locks the *existing* angle | shift should lock current segment angle (customLineAngle) |
| 9 | Arrow body drag | Move whole element | Node drag (whole element) | none | — |
| 10 | Arrow binding | FixedPointBinding; focus point visible + draggable; dashed line | FixedPointBinding; no focus-point UI | **missing focus-point interaction** | add focus point indicator + drag |
| 11 | Bound target move | `updateBoundElements` per frame | `applyLiveBindingsForTarget` per frame | none | — |
| 12 | Bound target resize | Same, live | Same, live | none | — |
| 13 | Bound target rotate | Same, live | Same, live (anchorForBinding rotates fp) | none | — |
| 14 | Arrow bending | Midpoint → **real vertex** (polyline) | Midpoint drag → **scalar `bend`** (quadratic) | **geometry model mismatch** | midpoint drag inserts vertex |
| 15 | Midpoint interaction | Ghost on every segment of 2-pt elements; drag converts to vertex | Ghosts only on multi-point; 2-pt midpoint writes `bend` | mismatch | ghosts on 2-pt; vertex conversion |
| 16 | Vertex interaction | Select/drag/delete vertices; drag multiple | Middle-vertex drag; no delete; single | partial | vertex delete (dbl-click) |
| 17 | Elbow arrows | First-class (`elbowed`, `fixedSegments`, A* routing) | **none** | **missing subsystem** | orthogonal routing MVP |
| 18 | Arrow label | Bound text w/ containerId; follows every mutation | `groupId` + labelOffset reflow; follows live | data model differs but behavior close | keep (documented) |
| 19 | Arrow label editing | Double-click label, WYSIWYG | Double-click text tool attach + DOM editor | none | — |
| 20 | Freehand selection | Stroke-distance hit, stroke highlighted | Bounds-based selection box | acceptable; documented | — |
| 21 | Freehand transformation | Path preserved; box on transform | Bounds box (existing) | acceptable | — |
| 22 | Cursor | Canonical pointer state → cursor | Fixed in prior pass | none | — |
| 23 | Drawing preview | Pointer-attached | Pointer-attached (fixed double-offset in prior pass) | none | — |
| 24 | Snapping | Alignment + equal spacing, screen-space | Same (snap-guides) | none | — |
| 25 | Rotation snapping | 15° w/ Shift; grid option | 15° w/ Shift (overlay) | none | — |
| 26 | Alignment guides | Corners + midpoints + centers | Same | none | — |
| 27 | Equal spacing | Same | Same | none | — |
| 28 | Zoom | Wheel + pinch, canvas-centered | Konva stage zoom | none | — |
| 29 | Pan | Space/scroll + hand | Hand tool + space + scroll | none | — |
| 30 | Text editing | WYSIWYG DOM over canvas, same geometry | DOM textarea overlay, same metrics (fixed prior pass) | none | — |

---

## 4. Architectural mismatches (the ones that matter)

### M1. Linear element geometry: `bend` scalar vs real vertices

Snapty's 2-point arrow/line can hold a quadratic `bend`. The midpoint handle
writes that scalar, so:

```
drag midpoint → bend (curve)        (Snapty)
drag midpoint → new vertex (poly)   (Excalidraw)
```

Every downstream consumer (bounds, export, labels, clipping) already handles
polylines — Snapty has two geometry models where one suffices. The fix is to
make the *interaction* produce vertices (keeping `bend` only as a legacy
render/back-compat path for old saved arrows).

### M2. Binding focus points are invisible

The `fixedPoint` is stored and used, but the user cannot see or move the
attachment point on the target. Excalidraw renders the dashed
endpoint→focusPoint line and a draggable circle. This is the main reason
"moving the arrow on the shape" doesn't feel controllable.

### M3. No first-class linear-element editing state

Excalidraw owns the linear edit gesture in one object (`LinearElementEditor`
with `isEditing`, `selectedPointsIndices`, `segmentMidPointHoveredCoords`,
`initialState`). Snapty's editing behavior is distributed across inline
closures per handle with refs (`midVertexRef`, etc.) and the main pointer
cascade. This is the "infer state from dozens of booleans" smell the pass
calls out.

### M4. Elbow arrows don't exist

The data model, routing, and segment editing are all absent.

### M5. Point deletion / selection

No way to remove a vertex (Excalidraw: alt/dbl-click or Delete while
editing).

---

## 5. Rewrites chosen for this pass (and why)

1. **Linear element interaction** (M1, M3) — midpoint→vertex conversion,
   midpoint ghosts on 2-point elements, vertex deletion, explicit gesture
   state for linear edits. This is the single biggest feel-difference and the
   smallest *safe* geometry change: the polyline path already exists
   end-to-end.
2. **Binding focus points** (M2) — dashed connection line + draggable focus
   point, live, committed at gesture end.
3. **Elbow arrows** (M4) — data model + orthogonal router (no A*), vertex
   editing works through the existing multi-point path, re-route on binding
   changes.

Not rewritten in this pass (documented as remaining differences):

- **A* elbow routing with obstacle avoidance** — replaced by a simple
  orthogonal (Manhattan) router. Snapty is a screenshot editor with few
  overlapping shapes; A* grid routing is disproportionate complexity. The data
  model (`elbowed`, `fixedSegments`) is compatible with upgrading the router
  later.
- **Multi-vertex selection & drag** — point selection UI deferred.
- **Freehand stroke-distance hit-testing** — selection box retained.
- **Full settings-properties inspector redesign** — incremental, in the
  properties panel.

---

## 6. Target interaction architecture

```
            native pointer events
                    │
                    ▼
        canvas pointer pipeline (handleMouseDown/Move/Up)
                    │
          ┌─────────┴──────────┐
          │                    │
  gesture ownership      transient refs
  (explicit state:        (draft geometry,
   draw | vertex |        pointer, hover)
   midpoint | endpoint |
   bend | focus | node)
          │                    │
          ▼                    ▼
   geometry derive      Konva node mutation
   (linear-editor.ts)   (applyArrowLineLive,
   (elbow.ts)           DraftLayer chrome)
          │                    │
          ▼                    ▼
        commit (pointerup) ──► store (Zustand) ──► pushHistory
```

Authoritative geometry = the stored element. Rendering, selection handles,
binding anchors, labels and export all derive from it; transient interaction
mutates Konva nodes and commits at gesture boundaries.

---

## 7. File plan

| File | Change |
|------|--------|
| `src/types/editor.ts` | `elbowed` + `fixedSegments` on arrows |
| `src/lib/editor/linear-editor.ts` | **new** — pure linear geometry (midpoints, hit-tests, insert/remove vertex, bend→polyline) |
| `src/lib/editor/elbow.ts` | **new** — orthogonal routing + reroute-on-binding |
| `src/components/editor/editor-canvas.tsx` | midpoint→vertex interaction; ghosts on 2-pt; vertex delete; focus-point UI; elbow render |
| `src/store/editor-store.ts` | elbow reroute on binding commit (via recomputeBindings path) |
| `src/lib/editor/binding.ts` | focus-point helpers (global fixed point, normalize pointer→fixedPoint) |
| `src/lib/editor/tool-settings.ts` + panel | arrow path setting (straight/elbow) |
| `excalidraw-gap-analysis.md` | this document |

---

## 7b. Implementation status (completed)

All rows of the §7 file plan are implemented in this pass:

- `src/types/editor.ts` — `elbowed`, `fixedSegments`, `startHeading`/
  `endHeading` on arrows.
- `src/lib/editor/linear-editor.ts` — pure linear geometry (midpoint hit
  tests, vertex insert/remove, bend→polyline conversion).
- `src/lib/editor/elbow.ts` — Manhattan orthogonal router + side-heading
  derivation.
- `src/components/editor/editor-canvas.tsx` — midpoint→vertex conversion for
  straight 2-point elements (Excalidraw's midpoint ghost), vertex deletion
  (double-click an interior vertex), binding focus-point UI (dashed connector
  + draggable anchor, live + committed), elbow rendering/creation/preview,
  endpoint-drag re-routing, elbow→free conversion on explicit vertex edits.
- `src/store/editor-store.ts` — `arrowPath` tool setting (persisted) +
  `setArrowPath`.
- `src/lib/editor/binding.ts` — focus-point helpers + elbow re-route in
  `recomputeBindings` and live `computeBoundArrowUpdates`.
- `src/lib/editor/tool-settings.ts` + `settings-sync.ts` +
  `setting-controls.tsx` — Arrow path (Straight/Elbow) control in the
  settings panel/rail, hydration, apply-to-selection routing.
- `src/lib/editor/draft-layer.ts` — routed elbow preview while drawing.

---

## 8. Honest remaining differences (after this pass)

1. Elbow routing is Manhattan-orthogonal, not A*; it does not dodge shapes.
2. No multi-vertex selection/drag for polylines.
3. Freehand still selects by bounds box, not stroke distance.
4. `bend` (quadratic) still exists for legacy arrows; new bends are vertices.
5. Excalidraw's pointer pipeline is one centralized state machine; Snapty's
   canvas remains a large handler file with an explicit gesture ref layered
   in. A full extraction into a controller class is a follow-up.
