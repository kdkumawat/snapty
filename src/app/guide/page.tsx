import type { Metadata } from "next";
import Link from "next/link";
import ContentPage from "@/components/content-page";

export const metadata: Metadata = {
  title: "How to annotate screenshots | Guide",
  description:
    "Learn how to annotate, style, and export screenshots in Snapty, the keyboard-first screenshot editor. Tools, shortcuts, and privacy.",
};

const TOOLS: { name: string; keys: string[]; desc: string }[] = [
  { name: "Select", keys: ["V"], desc: "Click to select, drag to marquee multi-select, Shift+click to add or remove." },
  { name: "Arrow", keys: ["A"], desc: "Drag from start to tip. Hold Shift for 45° steps, Alt to draw from the center." },
  { name: "Rectangle / Circle / Diamond", keys: ["R", "O", "D"], desc: "Drag to size. Shift keeps it square, Alt draws from the center." },
  { name: "Line", keys: ["L"], desc: "Straight or gently curved; Shift snaps to 45° increments." },
  { name: "Pencil / Highlighter", keys: ["P", "H"], desc: "Freehand strokes with a hand-drawn wobble. Highlighter has its own thickness." },
  { name: "Text", keys: ["T"], desc: "Click to type. Double-click the canvas or any annotation to add text there - a shape gets a label stuck to its center (or midpoint for lines), an existing text opens for editing." },
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
  { keys: "Ctrl/⌘ + C", desc: "Copy selected annotations (paste them with Ctrl/⌘ + V), or the whole annotated image when nothing is selected" },
  { keys: "Ctrl/⌘ + S", desc: "Capture a screen region (where the system allows it)" },
  { keys: "Ctrl/⌘ + Z / Shift+Z", desc: "Undo / redo" },
  { keys: "Ctrl/⌘ + D", desc: "Duplicate the selection" },
  { keys: "Ctrl/⌘ + G", desc: "Group / ungroup selection" },
  { keys: "Ctrl/⌘ + A", desc: "Select all annotations" },
  { keys: "Enter", desc: "Add or edit text on the selected annotation" },
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
    <ContentPage>
      <h1>How to annotate screenshots in Snapty</h1>
      <p className="lead">
        Paste a capture, mark it up with arrows, numbered steps, callouts, blur and spotlight, then
        copy or export. Nothing is uploaded. Your screenshots stay on your device.
      </p>

      <h2>The fastest workflow</h2>
      <ol>
        <li>Copy a screenshot anywhere on your machine.</li>
        <li>Open Snapty and press <kbd>Ctrl/⌘ + V</kbd>. The image lands centered, ready to edit.</li>
        <li>Pick a tool (try <kbd>A</kbd> for arrows), draw, and tweak it in the left panel.</li>
        <li>Press <kbd>Ctrl/⌘ + C</kbd> to copy straight into Slack, Jira, or Notion. Make sure nothing is selected: with a selection, it copies the annotations instead.</li>
      </ol>
      <p>Target: capture, paste, annotate, copy in under 30 seconds.</p>

      <h2>Every tool</h2>
      <div className="cards">
        {TOOLS.map((t) => (
          <div key={t.name} className="card">
            <div className="row">
              <h3>{t.name}</h3>
              <span>{t.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
            </div>
            <p>{t.desc}</p>
          </div>
        ))}
      </div>

      <h2>Shortcut reference</h2>
      <div className="rows keyrows">
        {SHORTCUTS.map((s) => (
          <div key={s.keys}>
            <p>{s.desc}</p>
            <kbd>{s.keys}</kbd>
          </div>
        ))}
      </div>

      <h2>Canvas styling and export</h2>
      <ul>
        <li>Settings, Padding adds a frame around the screenshot, with corner radius, shadow, and solid, gradient or glass backgrounds.</li>
        <li>Wrap the shot in a browser, iPhone, iPad, Android, or MacBook frame for polished shareable visuals.</li>
        <li>Export as PNG, JPG, WebP, or SVG, or copy to the clipboard for an instant paste.</li>
        <li>Huge images (8K, 100MP) are downscaled to 4096px for speed. Enable &ldquo;Keep original resolution&rdquo; in Settings to opt out.</li>
      </ul>

      <h2>Is it really private?</h2>
      <div className="note-box">
        <p>
          Yes. Nothing is uploaded. Images, annotations, and autosaves stay on your device. There
          are no accounts and no cloud storage. The only outbound requests are optional anonymous
          page-view analytics, which you can switch off in Settings, and image URLs you explicitly
          ask Snapty to open, fetched directly and never proxied.
        </p>
        <p><Link href="/privacy">Read the full privacy page</Link></p>
      </div>
    </ContentPage>
  );
}
