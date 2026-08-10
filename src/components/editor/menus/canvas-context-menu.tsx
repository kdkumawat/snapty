'use client';

import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEditorStore } from '@/store/editor-store';
import {
  copyStyleToClipboard,
  pasteStyleFromClipboard,
  hasClipboardStyle,
  getClipboardStyle,
} from '@/lib/editor/clipboard-style';
import { toastSuccess, toastInfo, toastError } from '@/lib/app-toast';
import { copyToClipboard } from '@/components/editor/export-dialog';
import { loadImageFileIntoEditor } from '@/lib/image-load';

const itemClass =
  'flex items-center justify-between gap-6 px-3 py-1.5 text-sm rounded-md outline-none cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-40 data-[disabled]:pointer-events-none';

export default function CanvasContextMenu({ children }: { children: React.ReactNode }) {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroupSelected = useEditorStore((s) => s.ungroupSelected);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);
  const updateSelectedElements = useEditorStore((s) => s.updateSelectedElements);
  const hasSelection = selectedElementIds.length > 0;
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const selected = elements.filter((el) => selectedElementIds.includes(el.id));
  const locked = selected.length > 0 && selected.every((el) => el.locked);

  const pasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            void loadImageFileIntoEditor(new File([blob], 'paste.png', { type }), { mode: 'auto' });
            return;
          }
        }
      }
      toastInfo('Clipboard empty', 'Copy an image first');
    } catch {
      toastError('Paste blocked', 'Allow clipboard access, or use Ctrl/Cmd+V');
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[300] min-w-[12rem] rounded-xl border border-border bg-surface/95 backdrop-blur-md p-1 shadow-xl">
          <ContextMenu.Item
            className={itemClass}
            onSelect={() => void copyToClipboard().then(() => toastSuccess('Copied', 'Image on clipboard'))}
          >
            Copy
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => void pasteImage()}>
            Paste
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasImage}
            onSelect={() => window.dispatchEvent(new CustomEvent('snapty-ocr'))}
          >
            Extract text
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} disabled={!hasSelection} onSelect={duplicateSelected}>
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasSelection}
            onSelect={() => removeElements(selectedElementIds)}
          >
            Delete
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-border" />
          <ContextMenu.Item className={itemClass} disabled={selectedElementIds.length < 2} onSelect={groupSelected}>
            Group
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} disabled={!hasSelection} onSelect={ungroupSelected}>
            Ungroup
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-border" />
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasSelection}
            onSelect={() => selectedElementIds.forEach(bringForward)}
          >
            Bring forward
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasSelection}
            onSelect={() => selectedElementIds.forEach(sendBackward)}
          >
            Send back
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-border" />
          <ContextMenu.Item className={itemClass} disabled={!hasSelection} onSelect={locked ? unlockSelected : lockSelected}>
            {locked ? 'Unlock' : 'Lock'}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasSelection}
            onSelect={() => {
              if (selected[0]) {
                copyStyleToClipboard(selected[0]);
                toastSuccess('Style copied', 'Ready to paste');
              }
            }}
          >
            Copy Style
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!hasSelection || !hasClipboardStyle()}
            onSelect={() => {
              const style = getClipboardStyle();
              if (style) {
                updateSelectedElements(style);
                toastSuccess('Style pasted', 'Applied to selection');
              }
            }}
          >
            Paste Style
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
