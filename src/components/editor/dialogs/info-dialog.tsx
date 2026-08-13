'use client';

import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { openInBrowser } from '@/lib/open-external';
import { Scissors, ShieldCheck, Sparkles, Github, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOCAL_FACTS: [string, string][] = [
  ['Images & annotations', 'Screenshots you open, paste, or capture are processed entirely on your device. Never uploaded, never stored on a server, never shared.'],
  ['Editing & effects', 'Blur, pixelate, spotlight, OCR text extraction, and every annotation render locally. The OCR engine (Tesseract) runs in your browser.'],
  ['Autosave & recovery', 'Drafts of your recent sessions are saved to your browser\u2019s IndexedDB so you can recover them after a refresh. They stay on your device.'],
  ['Preferences', 'Tool settings and theme are remembered in localStorage so your choices survive a reload.'],
];

const TELEMETRY_FACTS: [string, string][] = [
  ['Google Analytics 4', 'The site can load GA4 (gtag.js) to understand anonymous usage - which pages are visited and roughly which browsers are used. It never sees your images or annotations. IP addresses are anonymized.'],
  ['Opt out', 'Open Settings \u2192 \u201cUsage analytics\u201d and switch it off. GA stops loading entirely; your choice is remembered in your browser.'],
];

const FEATURES: [string, string][] = [
  ['Annotate', 'Arrows, shapes, handwritten text, step numbers, freehand, highlights'],
  ['Effects', 'Blur, pixelate, spotlight, and magnifier callouts'],
  ['Style', 'Padding, corner radius, device frames, gradients, and shadows'],
  ['Export', 'PNG, JPG, WebP, SVG - or copy straight to the clipboard'],
  ['Extras', 'OCR text extraction and a keyboard-first command palette'],
  ['Private', 'Everything runs locally. No accounts, no cloud, no uploads'],
];

export default function InfoDialog() {
  const infoDialog = useEditorStore((s) => s.infoDialog);
  const setInfoDialog = useEditorStore((s) => s.setInfoDialog);

  const open = infoDialog !== null;
  const tab: 'about' | 'privacy' = infoDialog ?? 'about';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setInfoDialog(null); }}>
      <DialogContent
        showCloseButton
        className={cn(
          'bg-surface border-border text-foreground p-0 gap-0 overflow-hidden',
          'w-[min(36rem,calc(100vw-1.5rem))] max-w-none',
          'top-[max(1rem,4vh)] translate-y-0',
          'max-h-[min(90dvh,44rem)] flex flex-col shadow-2xl',
        )}
      >
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-surface">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl bg-accent/12 text-accent flex items-center justify-center">
              {tab === 'about' ? <Scissors className="w-5 h-5" strokeWidth={1.75} /> : <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />}
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {tab === 'about' ? 'About Snapty' : 'Privacy'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tab === 'about'
                  ? 'A screenshot editor that never uploads anything'
                  : 'Your screenshots never leave your browser'}
              </p>
            </div>
          </div>

          <div className="mt-3 inline-flex rounded-lg bg-secondary/60 p-0.5">
            {(['about', 'privacy'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={cn(
                  'px-3 h-7 rounded-md text-xs font-medium transition-colors capitalize',
                  tab === t ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setInfoDialog(t)}
              >
                {t === 'about' ? 'About' : 'Privacy'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 select-text">
          {tab === 'about' ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">What is Snapty?</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                  A fast, keyboard-first screenshot editor that runs entirely in your browser.
                  Capture or paste a screenshot, mark it up with a hand-drawn feel, wrap it in a
                  device frame, and export - all on your device, free, and installable as a PWA.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {FEATURES.map(([title, body]) => (
                  <div key={title} className="rounded-xl border border-border bg-secondary/25 px-3 py-2.5">
                    <p className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      {title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{body}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-2"
                  onClick={() => openInBrowser('/guide')}
                >
                  <BookOpen className="w-4 h-4" />
                  Read the guide
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-2"
                  onClick={() => openInBrowser('https://github.com/kdkumawat/snapty')}
                >
                  <Github className="w-4 h-4" />
                  View source on GitHub
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed rounded-xl bg-accent/8 border border-accent/20 px-3 py-2.5">
                <strong className="text-foreground">Privacy promise:</strong> images, annotations,
                and drafts stay in your browser. There are no accounts and no cloud storage. The
                only optional outbound request is anonymous page-view analytics, which you can turn
                off in Settings.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">What stays on your device</p>
                <div className="mt-2 rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                  {LOCAL_FACTS.map(([title, body]) => (
                    <div key={title} className="px-3.5 py-3">
                      <p className="text-[13px] font-semibold mb-0.5">{title}</p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">Anonymous usage analytics</p>
                <div className="mt-2 rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                  {TELEMETRY_FACTS.map(([title, body]) => (
                    <div key={title} className="px-3.5 py-3">
                      <p className="text-[13px] font-semibold mb-0.5">{title}</p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed rounded-xl border border-border bg-secondary/25 px-3 py-2.5">
                This project is open source. Anything that runs here is visible in the repository on{' '}
                <button
                  type="button"
                  className="text-accent hover:underline inline"
                  onClick={() => openInBrowser('https://github.com/kdkumawat/snapty')}
                >
                  GitHub
                </button>
                .
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
