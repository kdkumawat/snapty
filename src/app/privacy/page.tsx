import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Snapty does with your data: your images and annotations never leave your browser. What anonymous usage analytics we collect and how to turn them off.",
};

const LocalList = [
  ["Images & annotations", "Screenshots you open, paste, or capture are processed entirely on your device. They are never uploaded, never stored on a server, and never shared."],
  ["Editing & effects", "Blur, pixelate, spotlight, OCR text extraction, and every annotation render locally. The OCR engine (Tesseract) runs in your browser."],
  ["Autosave", "A draft of your current session is saved to your browser's IndexedDB so you can recover it after a refresh. It stays on your device."],
  ["Preferences", "Tool settings and theme are remembered in localStorage so your choices survive a reload."],
] as const;

const TelemetryList = [
  ["Google Analytics 4", "The site can load GA4 (gtag.js) to understand anonymous usage - which pages are visited and roughly which browsers are used. It never sees your images or annotations. IP addresses are anonymized."],
  ["Opt out", "Open Settings → “Usage analytics” and switch it off. GA stops loading entirely; your choice is remembered in your browser."],
  ["Third-party requests", "Your images are never sent to third parties. The only external request is the analytics tag itself when you leave it on."],
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-full overflow-y-auto bg-canvas text-foreground">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-canvas/90 border-b border-border/40 flex items-center justify-between px-5 sm:px-8 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-hand text-xl font-semibold">
          <span className="w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center text-sm">✂</span>
          Snapty
        </Link>
        <Link href="/" className="h-9 px-4 rounded-full border border-border text-sm font-medium hover:bg-secondary/80 transition-colors inline-flex items-center">
          Open Editor
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2">Privacy</h1>
        <p className="text-muted-foreground mb-10">
          Snapty&rsquo;s promise: <strong className="text-foreground">your screenshots never leave your browser.</strong>{" "}
          Everything below is what that promise does - and does not - cover.
        </p>

        <h2 className="text-xl font-semibold tracking-tight mb-4">What stays on your device</h2>
        <div className="rounded-2xl border border-border bg-surface overflow-hidden mb-10">
          {LocalList.map(([title, body], i) => (
            <div key={title} className={`px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <p className="text-sm font-semibold mb-1">{title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-semibold tracking-tight mb-4">Anonymous usage analytics</h2>
        <div className="rounded-2xl border border-border bg-surface overflow-hidden mb-10">
          {TelemetryList.map(([title, body], i) => (
            <div key={title} className={`px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <p className="text-sm font-semibold mb-1">{title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-secondary/40 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            This project is open source. Anything that runs here is visible in the repository on{" "}
            <a
              href="https://github.com/kdkumawat/snapty"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              GitHub
            </a>
            . Questions? Open an issue there.
          </p>
        </div>
      </div>
    </main>
  );
}
