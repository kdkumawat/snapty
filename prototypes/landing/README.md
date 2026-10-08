# Snapty landing prototype

The approved design for the landing page. The real app's `/` is generated from this folder (`tools/port.js`).

## Art direction

- **Concept: the page is a marked-up screenshot.** Quiet, neutral "app chrome" for the page itself; the only decoration is Snapty's own red ink (rough.js strokes, Excalifont notes) annotating the page the way a user annotates a screenshot.
- **Type.** Bricolage Grotesque (display, tight, heavy) for headlines; Assistant, the app's UI face, for everything else; Excalifont only for handwritten annotations. No all-caps eyebrows, no gradient text.
- **Colour.** White paper with the editor's dot grid, near-black ink `#17171a`. One solid brand colour wherever a fill carries white content (buttons, logo square, favicon): `#b93300` = `oklch(0.52 0.19 47)`, white on it is 5.9:1, in both themes. Bright `#f97316` is the accent only (pressed keycap, tints, focus in dark); white text never sits on it (2.8:1). Red `#e03131` and highlighter yellow `#ffd43b` belong to annotations, never to UI.
- **Motion.** The product is the motion: films of the real editor. Page motion is limited to (1) hand-drawn marks drawing on, (2) the tour playlist cross-fading between films, (3) responses to what the visitor does (tabs, compare divider, key presses, theme). No fade-up on every section.
- **Layout.** Left-aligned, large type, compact rhythm. Hero: copy beside the film, both above the fold. One tools-and-keyboard section: a playlist where pressing a tool's key (or picking it) plays its film, with the essential shortcuts underneath. Use cases: tabbed before/after. Privacy: a measured network log. Theme: one button cycling System, Dark, Light.
- **Honesty.** Every claim is something the editor does in the films or something we measured (`tools/netcheck.js`). No testimonials, logos or counts, and no URL shown in any film.

## Run

```bash
npx serve -l 5000 prototypes/landing     # from the repo root, then open http://localhost:5000
```

Editor links point at `http://localhost:3001/editor` (the running `next dev`); the port rewrites them to `/editor`, `/guide`, `/privacy`.

## Films

Raw footage is the real editor, driven by Playwright; the films are composed with **Hyperframes** (HTML + GSAP timeline, rendered by headless Chrome, encoded by ffmpeg).

1. `tools/films.js <name...>`: records one film's footage at a full desktop window (1600x1000 CSS px, 2x) frame by frame (`tools/rec.js`, `tools/lib.js`): every frame is a device-pixel screenshot, the cursor follows eased, slightly arced paths with a short settle before each press, and each beat writes metadata (label, shortcut, camera target). Output: `video/<name>/footage.mp4` (near-lossless intermediate), `meta.json`, first/last frame.
2. `tools/compose.js <name...>`: builds `video/<name>/index.html`, a Hyperframes composition. Every film is 1920x1280 (3:2): a 1920x1200 stage with the footage inside a GSAP camera, and an 80px band reserved for the brand and the caption (tool name + shortcut), so a caption can never cover the action. The camera shows either the whole editor window or a deliberate 16:10 rectangle whose edges fall on whitespace (the screenshot with an even margin, or one cell of the hero scene); window to rectangle is a zoom, rectangle to rectangle is a dissolve. Loops cross-fade back to the first frame; the hero adds the brand sting and the end card. Renders with `npx hyperframes render`, then encodes `media/<name>.mp4` (H.264 CRF 24), `.webm` (VP9 CRF 34) and a `.webp` poster.
3. `tools/sheet.js <name...>`: contact sheet (start, every ~2 s, end) per film into `review/film-<name>.jpg` for frame-by-frame review.

Scenes are fake apps (`tools/scenes-src/webhooks.html` for the hero; the other four live with the earlier harness). Coordinates in `films.js` are the scenes' own 1440x900 CSS layout, measured from the DOM. Rules the scripts follow: one idea per film; every mark points at a real target; a new drawing starts on empty space (hovering an existing drawing borrows the selection tool).

`hyperframes` and `gsap` are dev tooling in this folder's own `package.json` / `node_modules`; nothing was added to the app.

## Other tools

- `tools/examples.js`: before/after use-case images. Both come out of the editor's own PNG export at 1x of a 2880x1800 source and are encoded once, identically, so the annotated image is exactly as sharp as the original.
- `tools/netcheck.js`: the network measurement quoted in the privacy section.
- `tools/build-page.js`: regenerates the generated parts of `index.html` (theme button, hero film, the tools playlist).
- `tools/port.js`: carries the prototype into the app verbatim: `src/components/landing/{landing-page.tsx,landing.css,marks.ts}` (CSS scoped under `.lp`, rem converted to px, landing-only font family names) and media to `public/landing/`.
- `tools/compare.js`: pixel-compares prototype and app at 1920 / 1440 / 390, light and dark, six scroll positions each. Run it after every port; the last run was 0.000 % on all 36 pairs.
- `tools/review.js [url]`: full-page, hero and before/after captures for self-review (prototype or app). `tools/apptest.js`: paste hand-off, CTA, theme cycle and tool-key checks in the app. `tools/appshots.js`: editor screenshots. `tools/verify.js`, `tools/views.js`: contrast audit and section views of the prototype.

## Product findings from recording (worth a look)

- **Blur mode does not hide text.** On both 1x and 2x screenshots a blurred email stays readable at the default amount, and a region drawn at amount 40 showed no visible blur. The films and examples therefore use Pixelate, which works. Until blur is fixed it should not be offered as redaction.
- **Arrow labels wrap to the arrow's length and only the first line shows** ("only 9 orders" rendered as "only 9"). The films use one-word labels.
- Pressing `A` while the Arrow tool is already active cycles the arrow type (documented, but easy to trigger by accident right after a paste, when Arrow is the default tool).
