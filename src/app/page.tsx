import type { Metadata } from "next";
import LandingPage from "@/components/landing/landing-page";

/** Root = marketing surface (SEO-first). The editor lives at /editor. */
export const metadata: Metadata = {
  title: "Snapty: Point at exactly what you mean.",
  description:
    "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
  openGraph: {
    title: "Snapty: Point at exactly what you mean.",
    description:
      "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
    type: "website",
  },
};

export default function Home() {
  return <LandingPage />;
}
