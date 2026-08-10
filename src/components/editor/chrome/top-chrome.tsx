'use client';

/**
 * Top chrome: toolbar + action cluster share one flex row so they never overlap.
 */
import FloatingToolbar from '@/components/editor/toolbar/floating-toolbar';
import ActionCluster from '@/components/editor/chrome/action-cluster';
import { useEditorStore } from '@/store/editor-store';

export default function TopChrome({
  onOpenPalette,
}: {
  onOpenPalette?: () => void;
}) {
  const modalOpen = useEditorStore((s) =>
    s.showHelpDialog || s.showExportDialog || s.showCommandPalette,
  );
  if (modalOpen) return null;

  return (
    <div className="absolute top-0 inset-x-0 z-[80] pointer-events-none px-2 sm:px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
      <div className="flex items-start gap-2 w-full">
        <div className="flex-1 min-w-0 overflow-hidden flex justify-center pointer-events-auto">
          <FloatingToolbar onOpenPalette={onOpenPalette} embedded />
        </div>
        <div className="shrink-0 pointer-events-auto">
          <ActionCluster embedded />
        </div>
      </div>
    </div>
  );
}
