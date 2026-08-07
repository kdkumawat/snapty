'use client';

import dynamic from 'next/dynamic';

const EditorShell = dynamic(() => import('@/components/editor/shell/editor-shell'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  ),
});

/** Default app surface, the editor. */
export default function Home() {
  return <EditorShell />;
}
