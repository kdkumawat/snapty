'use client';
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { Separator } from '@/components/ui/separator';
import { modKey } from '@/hooks/use-keyboard-shortcuts';

const M = modKey;

const shortcuts = [
  { cat: 'General', items: [["V", "Select tool"], ["H / Space (hold)", "Hand / Pan"], ["?", "Show shortcuts"], ["Escape", "Deselect / Select tool"], [`${M}+Z`, "Undo"], [`${M}+Shift+Z`, "Redo"], ["Delete / Backspace", "Delete selected"], [`${M}+A`, "Select all"], [`${M}+E`, "Export"], [`${M}+C`, "Copy image to clipboard"], [`${M}+= / ${M}+-`, "Zoom in / out"], [`${M}+0`, "Fit to screen"], ["Pinch", "Zoom on touch devices"]] },
  { cat: 'Drawing Tools', items: [["A", "Arrow"], ["R", "Rectangle"], ["U", "Rounded Rectangle"], ["O", "Ellipse"], ["L", "Line"], ["P", "Pencil"], ["I", "Highlighter"], ["T", "Text"], ["N", "Step Number"], ["C", "Crop image"], ["B", "Blur region"], ["X", "Pixelate region"], ["S", "Spotlight"], ["E", "Eraser"]] },
  { cat: 'Text Tool', items: [["Type text", "Enter to commit"], ["New line", "Shift + Enter"], ["Cancel", "Escape"]] },
  { cat: 'Step Numbers', items: [[`${M}+Shift+0`, "Reset step counter to 1"]] },
];

const HelpDialog: React.FC = () => {
  const show = useEditorStore((s) => s.showHelpDialog);
  const setShow = useEditorStore((s) => s.setShowHelpDialog);
  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="bg-background border-border text-foreground max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-lg">Keyboard Shortcuts</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {shortcuts.map((s) => (
            <div key={s.cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{s.cat}</h3>
              <div className="space-y-1">
                {s.items.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1">
                    <span className="text-sm text-foreground">{desc}</span>
                    <kbd className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border font-mono whitespace-nowrap">{key}</kbd>
                  </div>
                ))}
              </div>
              <Separator className="bg-border mt-3" />
            </div>
          ))}
          <div className="text-xs text-muted-foreground pt-2">
            <p className="font-medium mb-1">Privacy First</p>
            <p>All image processing happens locally in your browser. No data is sent to any server. Images imported via URL pass through a one-time proxy.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
