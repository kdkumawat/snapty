'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/store/editor-store';
import { useKeyboardShortcuts, useClipboardPaste } from '@/hooks/use-keyboard-shortcuts';
import Toolbar from './toolbar';
import TopBar from './top-bar';
import PropertiesPanel from './properties-panel';
import WelcomeScreen from './welcome-screen';
import ExportDialog from './export-dialog';
import HelpDialog from './help-dialog';
import ScissorLogo from '@/components/scissor-logo';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  Zap, Lock, Globe, Keyboard, Download, Layers, Monitor,
  Sun, Moon, Github, ArrowLeft, BookOpen, ChevronRight,
  Move, Image as ImageIcon, MousePointer2, Type,
  Eraser, Paintbrush, Circle, Square, ArrowUp, Minus, ListOrdered,
  Grid3x3, Eye, Sparkles, Link2, ScreenShare, MonitorSmartphone,
} from 'lucide-react';

const EditorCanvas = dynamic(() => import('./editor-canvas'), { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center bg-background"><div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" /></div> });

const features = [
  { icon: <Zap className="w-6 h-6" />, title: 'Lightning Fast', desc: 'Opens instantly, edits at 60 FPS. No installation needed.' },
  { icon: <Layers className="w-6 h-6" />, title: '15+ Annotation Tools', desc: 'Arrows, shapes, text, blur, pixelate, spotlight, and more.' },
  { icon: <Lock className="w-6 h-6" />, title: 'Privacy First', desc: 'All processing happens locally in your browser. Zero data leaves your device.' },
  { icon: <Globe className="w-6 h-6" />, title: 'Browser Native', desc: 'Works on any device with a browser. No downloads required.' },
  { icon: <Keyboard className="w-6 h-6" />, title: 'Keyboard First', desc: 'Full keyboard shortcuts for power users. Lightning fast workflow.' },
  { icon: <Download className="w-6 h-6" />, title: 'Instant Export', desc: 'Export as PNG, JPG, or WEBP. Copy to clipboard in one click.' },
];

const docsSections = [
  {
    title: 'Getting Started',
    icon: <ImageIcon className="w-5 h-5" />,
    items: [
      { title: 'Open an Image', desc: 'Drag and drop, paste from clipboard (Ctrl+V), browse files, or paste a URL.', icon: <ImageIcon className="w-4 h-4" /> },
      { title: 'Navigate Canvas', desc: 'Use the Hand tool (H or Space) to pan. Scroll to zoom in/out. Double-click zoom to fit.', icon: <Move className="w-4 h-4" /> },
      { title: 'Select and Move', desc: 'Press V for the Select tool. Click elements to select, Shift+click for multi-select. Drag to move.', icon: <MousePointer2 className="w-4 h-4" /> },
      { title: 'Direct Bookmark', desc: 'Bookmark the /editor URL to open the tool directly, skipping the landing page.', icon: <Link2 className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Drawing Tools',
    icon: <Paintbrush className="w-5 h-5" />,
    items: [
      { title: 'Arrow (A)', desc: 'Click and drag to draw arrows pointing in any direction. Great for highlighting flow.', icon: <ArrowUp className="w-4 h-4" /> },
      { title: 'Shapes (R, U, O)', desc: 'Draw rectangles, rounded rectangles, and ellipses. Set fill and stroke colors.', icon: <Square className="w-4 h-4" /> },
      { title: 'Pencil (P) & Highlighter (I)', desc: 'Freehand drawing. Pencil for precise lines, Highlighter for semi-transparent marks.', icon: <Minus className="w-4 h-4" /> },
      { title: 'Text (T)', desc: 'Click to place text. Type your content, press Enter to commit, Shift+Enter for new lines.', icon: <Type className="w-4 h-4" /> },
      { title: 'Step Numbers (N)', desc: 'Click to place numbered step circles. They auto-increment. Reset with Ctrl+Shift+0.', icon: <ListOrdered className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Image Effects',
    icon: <Sparkles className="w-5 h-5" />,
    items: [
      { title: 'Blur (B)', desc: 'Draw a rectangle to apply a Gaussian blur effect to that region of the image.', icon: <Eye className="w-4 h-4" /> },
      { title: 'Pixelate (X)', desc: 'Draw a rectangle to pixelate that region, hiding sensitive information.', icon: <Grid3x3 className="w-4 h-4" /> },
      { title: 'Spotlight (S)', desc: 'Draw a rectangle to darken everything except the selected area, drawing focus.', icon: <Circle className="w-4 h-4" /> },
      { title: 'Eraser (E)', desc: 'Click and drag to create a selection — any annotation it touches will be erased.', icon: <Eraser className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Export & Share',
    icon: <Download className="w-5 h-5" />,
    items: [
      { title: 'Copy to Clipboard', desc: 'Press Ctrl+C with an image loaded to copy the full canvas (image + annotations) to clipboard.', icon: <Globe className="w-4 h-4" /> },
      { title: 'Export Dialog (Ctrl+E)', desc: 'Choose PNG, JPG, or WEBP format. Set quality for lossy formats. Download or copy.', icon: <Download className="w-4 h-4" /> },
      { title: 'Canvas Styling', desc: 'Add padding, border radius, shadows, backgrounds, and device frames for polished exports.', icon: <Layers className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Screen Capture Integration',
    icon: <ScreenShare className="w-5 h-5" />,
    items: [
      { title: 'macOS - Native Screenshot', desc: 'Use Cmd+Shift+4 to capture a region. It saves to desktop. Then paste into Snapty with Cmd+V. For clipboard-only: Cmd+Ctrl+Shift+4.', icon: <MonitorSmartphone className="w-4 h-4" /> },
      { title: 'Windows - Win+Shift+S', desc: 'Press Win+Shift+S to capture a region to clipboard. Then paste into Snapty with Ctrl+V. The image loads instantly.', icon: <Monitor className="w-4 h-4" /> },
      { title: 'Browser - Screenshot Extension', desc: 'Use browser extensions like GoFullPage or FireShot to capture full pages, then paste into Snapty.', icon: <Globe className="w-4 h-4" /> },
      { title: 'Install as App (PWA)', desc: 'Install from Chrome/Edge address bar. Opens straight into the editor (no landing page). Works offline; all editing stays on your device.', icon: <MonitorSmartphone className="w-4 h-4" /> },
    ],
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
      onClick={cycleTheme}
      title={`Theme: ${theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

const LandingPage: React.FC = () => {
  const launchEditor = useEditorStore((s) => s.launchEditor);
  const [showDocs, setShowDocs] = useState(false);

  if (showDocs) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => setShowDocs(false)}
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <ScissorLogo size={16} className="sm:hidden" />
                <ScissorLogo size={18} className="hidden sm:block" />
              </div>
              <span className="text-lg sm:text-xl font-bold tracking-tight">Snapty</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Documentation</h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 sm:mb-12">Everything you need to master Snapty.</p>

          {docsSections.map((section) => (
            <section key={section.title} className="mb-8 sm:mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                  {section.icon}
                </div>
                <h2 className="text-lg sm:text-xl font-bold">{section.title}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <div
                    key={item.title}
                    className="p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-accent">{item.icon}</span>
                      <h3 className="font-semibold text-sm">{item.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="flex justify-center pt-4 pb-8">
            <Button
              size="lg"
              className="h-11 sm:h-12 px-6 sm:px-8 bg-accent text-accent-foreground hover:bg-accent/90 gap-2 text-sm sm:text-base font-semibold cursor-pointer"
              onClick={() => { setShowDocs(false); launchEditor(); }}
            >
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />Launch Editor
            </Button>
          </div>
        </main>
        <footer className="border-t border-border px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Snapty - Browser-native screenshot editor</span>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/kdkumawat/snapty"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
            <ScissorLogo size={16} className="sm:hidden" />
            <ScissorLogo size={18} className="hidden sm:block" />
          </div>
          <span className="text-lg sm:text-xl font-bold tracking-tight">Snapty</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
            onClick={() => setShowDocs(true)}
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Docs</span>
          </button>
          <ThemeToggle />
          <Button onClick={launchEditor} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 cursor-pointer h-8 sm:h-9 px-3 sm:px-4 text-sm">
            <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Open Editor
          </Button>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16 max-w-4xl mx-auto text-center">
        <div className="mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto">
            <ScissorLogo size={28} className="sm:hidden" />
            <ScissorLogo size={32} className="hidden sm:block" />
          </div>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 sm:mb-5 bg-gradient-to-r from-accent to-amber-500 bg-clip-text text-transparent leading-tight">
          Capture. Annotate. Share.
        </h1>
        <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mb-3 sm:mb-4 leading-relaxed">
          The fastest, most beautiful browser-based screenshot editor.
          Professional annotations in seconds, no installation required.
        </p>
        <p className="text-sm sm:text-base text-muted-foreground/70 mb-8 sm:mb-12">
          Built for engineers, designers, product managers, and anyone who communicates visually.
        </p>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-12 sm:mb-20">
          <Button size="lg" className="h-11 sm:h-12 px-6 sm:px-8 bg-accent text-accent-foreground hover:bg-accent/90 gap-2 text-sm sm:text-base font-semibold cursor-pointer" onClick={launchEditor}>
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />Launch Editor
          </Button>
          <Button size="lg" variant="outline" className="h-11 sm:h-12 px-6 sm:px-8 border-border text-foreground bg-background hover:bg-accent hover:text-accent-foreground gap-2 text-sm sm:text-base font-semibold cursor-pointer" onClick={() => setShowDocs(true)}>
            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />Read Docs
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 w-full">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors text-left">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">{f.icon}</div>
              <div><h3 className="font-semibold text-sm sm:text-base mb-1">{f.title}</h3><p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{f.desc}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-10 sm:mt-16 text-xs sm:text-sm text-muted-foreground/50">
          <p>Open source. No tracking. No account required. Works offline.</p>
        </div>
      </main>
      <footer className="border-t border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Snapty - Browser-native screenshot editor for professionals</span>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/kdkumawat/snapty"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  );
};

const EditorPage: React.FC = () => {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const isEditorLaunched = useEditorStore((s) => s.isEditorLaunched);
  const launchEditor = useEditorStore((s) => s.launchEditor);

  useKeyboardShortcuts();
  useClipboardPaste();

  // Installed PWA should never show the marketing landing page
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || nav.standalone === true;
    if (standalone && !isEditorLaunched) {
      launchEditor();
    }
  }, [isEditorLaunched, launchEditor]);

  if (!isEditorLaunched && !backgroundImage) return <LandingPage />;

  return (
    <div className="h-dvh w-screen max-w-[100vw] flex flex-col bg-background overflow-hidden select-none touch-manipulation">
      <TopBar />
      <div className="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row">
        {/* Tools: side rail on md+, bottom bar on mobile (see Toolbar) */}
        <div className="hidden md:flex md:h-full shrink-0 z-30">
          <Toolbar />
        </div>
        {backgroundImage ? (
          <>
            <div className="flex flex-1 min-h-0 min-w-0 order-1 md:order-none">
              <div className="flex-1 relative min-w-0 min-h-0" data-snapty-canvas-wrap>
                <EditorCanvas />
              </div>
              {/* Settings rail — always available (collapses to a strip) */}
              <div className="shrink-0 z-20 h-full max-h-full">
                <PropertiesPanel />
              </div>
            </div>
            {/* Mobile bottom toolbar */}
            <div className="md:hidden shrink-0 z-30 order-3 border-t border-border bg-background safe-bottom">
              <Toolbar />
            </div>
          </>
        ) : (
          <WelcomeScreen />
        )}
      </div>
      <ExportDialog />
      <HelpDialog />
    </div>
  );
};

export default EditorPage;
