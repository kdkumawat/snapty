'use client';

import dynamic from 'next/dynamic';

const EditorPage = dynamic(() => import('@/components/editor/editor-page'), {
  ssr: false,
});

export default function EditorRoutePage() {
  return <EditorPage />;
}
