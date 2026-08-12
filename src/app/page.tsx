import type { Metadata } from "next";
import LandingPage from "@/components/landing/landing-page";

/** Root = marketing surface (SEO-first). The editor lives at /editor. */
export const metadata: Metadata = {
  title: "Snapty - Free Browser Screenshot Editor",
  description:
    "Annotate screenshots with a hand-drawn feel - arrows, shapes, text, step numbers, blur and pixelate. 100% in your browser, nothing uploaded. Free, keyboard-first, installs as a PWA.",
  openGraph: {
    title: "Snapty: Free Browser Screenshot Editor",
    description:
      "Professional screenshot annotations in seconds. No installation needed. Privacy-first, open source, works offline.",
    type: "website",
  },
};

export default function Home() {
  return <LandingPage />;
}
