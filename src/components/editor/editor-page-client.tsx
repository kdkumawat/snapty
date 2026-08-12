"use client";

import dynamic from "next/dynamic";

/**
 * Next.js 16 forbids `ssr: false` on `next/dynamic` inside Server Components,
 * so the editor's dynamic import lives in a client wrapper and the route keeps
 * its server-rendered metadata.
 */
const EditorShell = dynamic(() => import("@/components/editor/shell/editor-shell"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  ),
});

export default function EditorPageClient() {
  return <EditorShell />;
}
