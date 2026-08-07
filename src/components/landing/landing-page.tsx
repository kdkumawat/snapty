'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ScissorLogo from '@/components/scissor-logo';
import { useTheme } from 'next-themes';
import {
  Sun, Moon, Monitor, Github, ArrowRight, Keyboard, Shield, Zap,
  ScanSearch, Type, MousePointer2, Download,
} from 'lucide-react';
import LandingScenarioDemo from '@/components/landing/landing-scenario-demo';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
      onClick={cycleTheme}
      aria-label="Toggle theme"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

const capabilities = [
  {
    icon: MousePointer2,
    title: 'Hand-Drawn Annotations',
    body: 'Rectangles, ellipses, arrows, and freehand with adjustable sloppiness. Excalidraw energy, screenshot-first.',
  },
  {
    icon: ScanSearch,
    title: 'Magnifier Callouts',
    body: 'Circle a detail and Snapty places a larger preview diagonally so reviewers see exactly what matters.',
  },
  {
    icon: Type,
    title: 'Handwritten Labels',
    body: 'Drop text that feels sketched, not sterile. Numbered steps guide walkthroughs in seconds.',
  },
  {
    icon: Shield,
    title: 'Private By Design',
    body: 'Everything runs in your browser. Screenshots never leave your device. Perfect for work that can’t go to the cloud.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First',
    body: 'Tools, undo, export, and nudge are a keystroke away. Built for people who annotate dozens of shots a day.',
  },
  {
    icon: Download,
    title: 'Export Anywhere',
    body: 'PNG, JPG, WebP, or SVG. Copy to clipboard or share from the floating action bar.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const openEditor = () => router.push('/');

  return (
    <div className="relative flex-1 min-h-0 h-full w-full overflow-y-auto overflow-x-hidden bg-canvas text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 50%)',
        }}
      />

      <header className="relative z-10 sticky top-0 backdrop-blur-md bg-canvas/80 border-b border-border/40 flex items-center justify-between px-5 sm:px-8 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
            <ScissorLogo size={18} />
          </div>
          <span className="text-lg font-semibold tracking-tight">Snapty</span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href="#features"
            className="hidden sm:inline-flex h-9 px-3 items-center rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            Features
          </a>
          <ThemeToggle />
          <a
            href="https://github.com/kdkumawat/snapty"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={openEditor}
            className="ml-1 h-9 px-4 rounded-full bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Open Editor
          </button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="flex flex-col items-center px-5 pt-10 sm:pt-16 pb-16 text-center max-w-3xl mx-auto min-h-[calc(100dvh-4rem)] justify-center">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] mb-5"
          >
            <span className="text-accent">Snapty</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-md mb-9 leading-relaxed"
          >
            Annotate screenshots with a hand-drawn feel. Fast, private, keyboard-first.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.14 }}
            className="flex flex-wrap items-center justify-center gap-3 mb-14"
          >
            <button
              type="button"
              onClick={openEditor}
              className="h-12 px-7 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
            >
              Open Editor
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openEditor}
              className="h-12 px-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 backdrop-blur text-sm font-medium hover:bg-secondary transition-colors"
            >
              Paste A Screenshot
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            <LandingScenarioDemo />
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground"
          >
            <li className="inline-flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent" /> Instant, Local</li>
            <li className="inline-flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-accent" /> Nothing Uploaded</li>
            <li className="inline-flex items-center gap-2"><Keyboard className="w-3.5 h-3.5 text-accent" /> Keyboard-First</li>
          </motion.ul>
        </section>

        <section id="features" className="px-5 sm:px-8 py-20 border-t border-border/50 bg-surface/40 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center mb-3">
              Built For Screenshot Walkthroughs
            </h2>
            <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12 text-sm sm:text-base">
              Everything you need to mark up a capture, call out bugs, and ship clear feedback without leaving the browser.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {capabilities.map((cap, i) => (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="space-y-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                    <cap.icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cap.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Ready To Annotate?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Drop a screenshot, mark it up, and export. All on your machine.
          </p>
          <button
            type="button"
            onClick={openEditor}
            className="h-12 px-8 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Launch Snapty
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>

        <footer className="px-5 py-8 border-t border-border/40 text-center text-xs text-muted-foreground">
          Snapty · Privacy-first screenshot annotation · Open source
        </footer>
      </main>
    </div>
  );
}
