import type { Metadata } from "next";
import EditorPageClient from "@/components/editor/editor-page-client";

export const metadata: Metadata = {
  title: "Screenshot Editor",
  description:
    "Paste, annotate and export screenshots. Arrows, numbered steps, callouts, blur and spotlight. Nothing is uploaded.",
  robots: { index: false, follow: true },
};

/** The editor. Previously the root surface; now at /editor (landing owns /). */
export default function EditorRoutePage() {
  return <EditorPageClient />;
}
