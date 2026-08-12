import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to annotate screenshots | Guide",
  description:
    "Learn how to annotate, style, and export screenshots in Snapty - the keyboard-first browser screenshot editor. Tools, shortcuts, and privacy.",
};

const TOOLS: { name: string; keys: string[]; desc: string }[] = [
  { name: "Select", keys: ["V"], desc: "Click to select, drag to marquee multi-select, Shift+click to add or remove." },
  { name: "Arrow", keys: ["A"], desc: "Drag from start to tip. Hold Shift for 45° steps, Alt to draw from the center." },
  { name: "Rectangle / Circle / Diamond", keys: ["R", "O", "D"], desc: "Drag to size. Shift keeps it square, Alt draws from the center." },
  { name: "Line", keys: ["L"], desc: "Straight or gently curved; Shift snaps to 45° increments." },
  { name: "Pencil / Highlighter", keys: ["P", "H"], desc: "Freehand strokes with a hand-drawn wobble. Highlighter has its own thickness." },
  { name: "Text", keys: ["T"], desc: "Click to type. Bold, italic, and alignment live in the left panel." },
  { name: "Step numbers", keys: ["N"], desc: "Click to drop numbered badges for walkthroughs. Start number is set in the panel." },
  { name: "Blur / Pixelate", keys: ["B", "Z"], desc: "Drag a region to hide sensitive content. Resize or move it and the region re-bakes." },
  { name: "Spotlight", keys: ["S"], desc: "Dim everything except the region you draw." },
  { name: "Eraser", keys: ["E"], desc: "Drag a box - affected annotations are previewed in red before release." },
  { name: "Crop", keys: ["C"], desc: "Select a region and the image (plus annotations) is cropped. Undo restores it." },
  { name: "Magnifier", keys: ["M"], desc: "Circle a detail to get a zoomed callout bubble you can place anywhere." },
];

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Ctrl/⌘ + V", desc: "Paste a screenshot from the clipboard" },
  { keys: "Ctrl/⌘ + O", desc: "Open an image file" },
  { keys: "Ctrl/⌘ + C", desc: "Copy the annotated image to the clipboard" },
  { keys: "Ctrl/⌘ + S", desc: "Capture a screen region (supported browsers)" },
  { keys: "Ctrl/⌘ + Z / Shift+Z", desc: "Undo / redo" },
  { keys: "Ctrl/⌘ + D", desc: "Duplicate the selection" },
  { keys: "Ctrl/⌘ + G", desc: "Group / ungroup selection" },
  { keys: "Ctrl/⌘ + A", desc: "Select all annotations" },
  { keys: "Ctrl/⌘ + E", desc: "Open export" },
  { keys: "Ctrl/⌘ + K", desc: "Command palette" },
  { keys: "Ctrl/⌘ + 0", desc: "Fit to screen" },
  { keys: "Ctrl/⌘ + 1", desc: "Actual size" },
  { keys: "Ctrl/⌘ + 2", desc: "Zoom to selection" },
  { keys: "Arrow keys", desc: "Nudge the selection (Shift = ×10)" },
  { keys: "[ / ]", desc: "Move selection backward / forward" },
  { keys: "Space", desc: "Pan the canvas while held" },
  { keys: "?", desc: "Keyboard shortcut reference" },
];

export default function GuidePage() {
  return (
    <div className="min-h-dvh bg-canvas text-foreground">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-canvas/90 border-b border-border/40 flex items-center justify-between px-5 sm:px-8 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl font-semibold font-hand text-accent">Snapty</span>
        </div>
        <Link
          href="/editor"
          className="h-9 px-4 rounded-full bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          Open Editor
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12 space-y-12">
        <section>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            How to annotate screenshots in Snapty
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Snapty is a privacy-first, browser-native screenshot editor. Paste a capture,
            mark it up with arrows, shapes, text, and step numbers, then copy or export -
            everything runs locally and nothing is uploaded.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">The fastest workflow</h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
            <li>Copy a screenshot anywhere on your machine.</li>
            <li>Open Snapty and press <Kbd>Ctrl/⌘ + V</Kbd> - the image lands centered, ready to edit.</li>
            <li>Pick a tool (try <Kbd>A</Kbd> for arrows), draw, and tweak it in the left panel.</li>
            <li>Press <Kbd>Ctrl/⌘ + C</Kbd> to copy straight into Slack, Jira, or Notion.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Target: capture → paste → annotate → copy in under 30 seconds.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Every tool</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {TOOLS.map((t) => (
              <div key={t.name} className="rounded-xl border border-border bg-surface/60 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <span className="text-[10px] text-muted-foreground">
                    {t.keys.map((k) => <kbd key={k} className="ml-1">{k}</kbd>)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Shortcut reference</h2>
          <div className="rounded-xl border border-border bg-surface/60 divide-y divide-border/60">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{s.desc}</span>
                <kbd className="shrink-0">{s.keys}</kbd>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Canvas styling & export</h2>
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Settings → Padding adds a frame around the screenshot, with corner radius, shadow, and solid / gradient / glass backgrounds.</li>
            <li>Wrap the shot in a browser, iPhone, iPad, Android, or MacBook frame for polished shareable visuals.</li>
            <li>Export as PNG, JPG, WebP, or SVG - or copy to clipboard for an instant paste.</li>
            <li>Huge images (8K, 100MP) are downscaled to 4096px for speed; enable “Keep original resolution” in Settings to opt out.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface/60 p-5 space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Is it really private?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Yes. Images, annotations, and autosaves stay in your browser (memory, IndexedDB,
            localStorage). There are no accounts and no cloud storage. The only outbound
            requests are optional anonymous page-view analytics, which you can disable at any
            time in Settings, and URL imports you explicitly ask for - handled directly by
            your browser, never proxied.
          </p>
          <p className="text-xs">
            <Link href="/privacy" className="text-accent hover:underline">Read the full privacy page</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface text-[11px] font-mono text-muted-foreground">
      {children}
    </kbd>
  );
}
