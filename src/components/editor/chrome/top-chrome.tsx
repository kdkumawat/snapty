'use client';

/**
 * Top chrome, in Excalidraw's arrangement: main menu on the left, toolbar
 * centered, actions on the right. One flex row, so they never overlap.
 */
import FloatingToolbar from '@/components/editor/toolbar/floating-toolbar';
import ActionCluster from '@/components/editor/chrome/action-cluster';
import MainMenu from '@/components/editor/menus/main-menu';
import { useEditorStore } from '@/store/editor-store';
import { useFormFactor } from '@/hooks/use-form-factor';

export default function TopChrome() {
  const modalOpen = useEditorStore((s) =>
    s.showHelpDialog || s.showCommandPalette,
  );
  const phone = useFormFactor() === 'phone';
  if (modalOpen) return null;

  return (
    <div className="absolute top-0 inset-x-0 z-[80] pointer-events-none px-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
      <div className="flex items-start gap-2 w-full">
        {/* Equal side slots keep the toolbar on the viewport's centre line,
            as in Excalidraw, until the row runs out of room. */}
        <div className="flex-1 basis-0 flex justify-start">
          <MainMenu />
        </div>
        {/* On phones the toolbar sits at the bottom (see BottomChrome). The
            wrapper must not clip: that would cut the island's shadow and the
            "more tools" menu. */}
        {!phone && (
          <div className="min-w-0 flex justify-center pointer-events-auto">
            <FloatingToolbar embedded />
          </div>
        )}
        <div className="flex-1 basis-0 flex justify-end">
          <div className="pointer-events-auto"><ActionCluster embedded /></div>
        </div>
      </div>
    </div>
  );
}
