'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Clipboard, Link as LinkIcon, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import ScissorLogo from '@/components/scissor-logo';

const WelcomeScreen: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const setBackgroundImage = useEditorStore((s) => s.setBackgroundImage);

  function loadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setBackgroundImage(img);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handlePaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            loadImage(new File([blob], 'paste.png', { type }));
            return;
          }
        }
      }
    } catch { /* no image in clipboard */ }
  }

  async function handleUrlImport() {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const d = await res.json();
      if (!d.dataURL) { setUrlError(d.error || 'Failed to fetch image'); return; }
      const img = new Image();
      img.onload = () => { setBackgroundImage(img); setUrlInput(''); };
      img.src = d.dataURL;
    } catch { setUrlError('Failed to fetch image'); }
    finally { setUrlLoading(false); }
  }

  return (
    <div
      className={cn('flex-1 flex flex-col items-center justify-center p-8 transition-all', dragOver && 'bg-accent/5')}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) loadImage(f); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-6">
        <ScissorLogo size={32} />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">SnapKit</h1>
      <p className="text-muted-foreground text-sm mb-8">Capture. Annotate. Share.</p>

      <div className={cn('w-full max-w-md border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 transition-all mb-6', dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-muted-foreground bg-secondary/30')}>
        <Upload className={cn('w-10 h-10', dragOver ? 'text-accent' : 'text-muted-foreground')} />
        <div className="text-center">
          <p className="text-foreground text-sm font-medium mb-1">{dragOver ? 'Drop your image here' : 'Drag and drop an image here'}</p>
          <p className="text-muted-foreground text-xs">PNG, JPG, WEBP, SVG</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>or</span></div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />Browse Files
          </Button>
          <Button variant="outline" className="bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground" onClick={handlePaste}>
            <Clipboard className="w-4 h-4 mr-2" />Paste
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImage(f); e.target.value = ''; }} />
      </div>

      <div className="w-full max-w-md">
        <div className="flex gap-2">
          <Input
            placeholder="Paste image URL..."
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUrlImport(); }}
            className="h-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-accent"
          />
          <Button variant="outline" className="h-10 bg-background border-border text-foreground hover:bg-accent shrink-0" disabled={urlLoading || !urlInput.trim()} onClick={handleUrlImport}>
            {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
          </Button>
        </div>
        {urlError && <p className="text-destructive text-xs mt-1.5">{urlError}</p>}
      </div>

      <p className="text-muted-foreground/50 text-xs mt-8 flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border text-[10px]">{modKey}</kbd>
        <span>+</span>
        <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border text-[10px]">V</kbd>
        <span className="ml-1">to paste from clipboard</span>
      </p>
    </div>
  );
};

export default WelcomeScreen;
