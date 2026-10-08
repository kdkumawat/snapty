import type { Metadata } from "next";
import ContentPage from "@/components/content-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Snapty does with your data: nothing is uploaded and your screenshots stay on your device. What anonymous usage analytics we collect and how to turn them off.",
};

const LocalList = [
  ["Images & annotations", "Screenshots you open, paste, or capture are processed entirely on your device. They are never uploaded, never stored on a server, and never shared."],
  ["Editing & effects", "Blur, pixelate, spotlight, OCR text extraction, and every annotation render locally. The OCR engine (Tesseract) runs on your device."],
  ["Autosave", "A draft of your current session is saved to IndexedDB on your device so you can recover it after a refresh. It stays on your device."],
  ["Preferences", "Tool settings and theme are remembered in localStorage so your choices survive a reload."],
] as const;

const TelemetryList = [
  ["Google Analytics 4", "The site can load GA4 (gtag.js) to understand anonymous usage - which pages are visited and roughly which devices are used. It never sees your images or annotations. IP addresses are anonymized."],
  ["Opt out", "Open Settings → “Usage analytics” and switch it off. GA stops loading entirely; your choice is remembered on your device."],
  ["Third-party requests", "Your images are never sent to third parties. The only external request is the analytics tag itself when you leave it on."],
] as const;

export default function PrivacyPage() {
  return (
    <ContentPage>
      <h1>Privacy</h1>
      <p className="lead">
        Nothing is uploaded. <strong>Your screenshots stay on your device.</strong> Below is what
        that promise does, and does not, cover.
      </p>

      <h2>What stays on your device</h2>
      <div className="rows">
        {LocalList.map(([title, body]) => (
          <div key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <h2>Anonymous usage analytics</h2>
      <div className="rows">
        {TelemetryList.map(([title, body]) => (
          <div key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <div className="note-box">
        <p>
          This project is open source. Anything that runs here is visible in the repository on{" "}
          <a href="https://github.com/kdkumawat/snapty" target="_blank" rel="noopener noreferrer">GitHub</a>
          . Questions? Open an issue there.
        </p>
      </div>
    </ContentPage>
  );
}
