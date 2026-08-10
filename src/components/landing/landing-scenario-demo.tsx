'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Kind = 'bug' | 'settings' | 'support' | 'privacy';

type Scenario = {
  id: Kind;
  title: string;
  subtitle: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'bug',
    title: 'Mark a checkout bug for product',
    subtitle: 'Circle the overlapping Pay button, arrow the culprit, ship the shot in Slack.',
  },
  {
    id: 'settings',
    title: 'Flag confusing settings copy',
    subtitle: 'Call out the toggle nobody understands. Faster than writing a paragraph.',
  },
  {
    id: 'support',
    title: 'Number the steps support missed',
    subtitle: 'Walk QA through the exact agent mistakes with step badges.',
  },
  {
    id: 'privacy',
    title: 'Blur PII before you share',
    subtitle: 'Pixelate emails, magnify the wrong metric, keep the rest readable.',
  },
];

const ACCENT = '#EA580C';

/** Handwritten callout label */
function HandNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-hand text-[13px] sm:text-sm leading-tight whitespace-nowrap pointer-events-none',
        className,
      )}
      style={{ color: ACCENT }}
    >
      {children}
    </span>
  );
}

/** Step badge */
function StepBadge({ n, className }: { n: string; className?: string }) {
  return (
    <span
      className={cn(
        'absolute w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white pointer-events-none',
        className,
      )}
      style={{ background: ACCENT }}
    >
      {n}
    </span>
  );
}

function BrowserChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-4 sm:inset-6 rounded-xl bg-white border border-stone-200/90 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] text-left flex flex-col">
      <div className="h-9 border-b border-stone-200 flex items-center gap-2 px-3 bg-[#f4f4f5] shrink-0">
        <span className="flex gap-1.5 shrink-0" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="flex-1 h-6 rounded-md bg-white border border-stone-200/80 px-2.5 flex items-center min-w-0">
          <span className="text-[10px] text-stone-500 truncate font-medium">{title}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative bg-white overflow-hidden">{children}</div>
    </div>
  );
}

function BugMock() {
  return (
    <BrowserChrome title="checkout.acme.shop / cart">
      <div className="absolute inset-0 flex text-left">
        <div className="flex-1 p-4 border-r border-stone-100">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-2">Order summary</p>
          <div className="flex gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 shrink-0" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <div className="h-2.5 w-28 rounded bg-stone-200" />
              <div className="h-2 w-16 rounded bg-stone-100" />
              <p className="text-[11px] text-stone-600 font-medium">$42.00</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 shrink-0" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <div className="h-2.5 w-24 rounded bg-stone-200" />
              <div className="h-2 w-14 rounded bg-stone-100" />
              <p className="text-[11px] text-stone-600 font-medium">$9.50</p>
            </div>
          </div>
        </div>
        <div className="w-[48%] p-4 flex flex-col min-w-0">
          <p className="text-sm font-semibold text-stone-800 mb-3">Payment</p>
          <div className="space-y-2 mb-auto">
            <div className="h-9 rounded-lg border border-stone-200 bg-stone-50 px-3 flex items-center text-[11px] text-stone-500">
              Card ending in 4242
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-9 rounded-lg border border-stone-200 bg-stone-50" />
              <div className="h-9 rounded-lg border border-stone-200 bg-stone-50" />
            </div>
          </div>
          <div className="relative mt-auto">
            <HandNote className="absolute -top-7 left-0 z-10">covers the terms link</HandNote>
            <svg
              className="absolute -top-4 left-[42%] w-8 h-8 pointer-events-none z-10"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path d="M4 20 L14 10" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
              <path d="M11 9 L15 11 L10 14 Z" fill={ACCENT} />
            </svg>
            <p className="text-[10px] text-stone-400 mb-1.5 underline decoration-stone-300 relative z-0">
              Terms &amp; refund policy
            </p>
            <div className="relative">
              <div
                className="absolute -inset-1 rounded-lg border-2 pointer-events-none z-10"
                style={{ borderColor: ACCENT }}
                aria-hidden
              />
              <button
                type="button"
                className="relative z-0 w-full h-10 rounded-lg bg-[#EA580C] text-white text-sm font-semibold shadow-sm"
              >
                Pay $51.50
              </button>
            </div>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

function SettingsMock() {
  return (
    <BrowserChrome title="app.notion.so / settings / workspace">
      <div className="absolute inset-0 flex">
        <aside className="w-[30%] border-r border-stone-100 bg-[#fafafa] p-3 space-y-2 shrink-0">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-1">Settings</p>
          {['General', 'Members', 'Security', 'Integrations'].map((item, i) => (
            <div
              key={item}
              className={cn(
                'h-7 rounded-md px-2 flex items-center text-[11px]',
                i === 2 ? 'bg-white border border-stone-200 text-stone-800 font-medium shadow-sm' : 'text-stone-500',
              )}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="flex-1 p-4 space-y-2 min-w-0">
          <p className="text-sm font-semibold text-stone-800 mb-0.5">Security</p>
          {[
            'Require 2FA for admins',
            'Allow public page sharing',
            'Enable guest link previews',
          ].map((label, i) => (
            <div
              key={label}
              className={cn(
                'relative flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5 bg-white',
                i === 2 && 'z-0',
              )}
            >
              {i === 2 && (
                <>
                  <HandNote className="absolute -top-6 right-2 z-10">what does this mean?</HandNote>
                  <svg
                    className="absolute -top-3 right-16 w-10 h-6 pointer-events-none z-10"
                    viewBox="0 0 40 24"
                    fill="none"
                    aria-hidden
                  >
                    <path d="M4 20 L28 8" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M24 6 L30 9 L25 13 Z" fill={ACCENT} />
                  </svg>
                  <div
                    className="absolute -inset-0.5 rounded-xl border-2 border-dashed pointer-events-none z-10"
                    style={{ borderColor: ACCENT }}
                    aria-hidden
                  />
                </>
              )}
              <span className="text-[12px] text-stone-700 relative z-0">{label}</span>
              <span className="h-5 w-9 rounded-full relative shrink-0 bg-accent z-0">
                <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white shadow" />
              </span>
            </div>
          ))}
          <p className="text-[10px] text-stone-400 px-1 pt-0.5">
            Guest link previews may expose page titles in Slack unfurls.
          </p>
        </div>
      </div>
    </BrowserChrome>
  );
}

function SupportMock() {
  return (
    <BrowserChrome title="Intercom · Ticket #4821 · Partial refund">
      <div className="absolute inset-0 py-4 pr-4 pl-10 space-y-2.5 text-[12px]">
        <div className="relative max-w-[88%]">
          <StepBadge n="1" className="-left-8 top-1" />
          <div className="rounded-2xl rounded-tl-md bg-stone-100 px-3 py-2 text-stone-700">
            Customer wants a <span className="font-semibold">partial</span> refund on order 9921 ($28 of $64).
          </div>
        </div>
        <div className="relative ml-auto max-w-[85%]">
          <StepBadge n="2" className="-left-8 top-1" />
          <HandNote className="absolute -top-5 right-0">skipped verify step</HandNote>
          <div className="rounded-2xl rounded-tr-md bg-accent/15 px-3 py-2 text-stone-800 border border-accent/20">
            Processed full refund $64.00. Closing ticket.
          </div>
        </div>
        <div className="relative max-w-[80%]">
          <StepBadge n="3" className="-left-8 top-1" />
          <div className="rounded-2xl rounded-tl-md bg-stone-100 px-3 py-2 text-stone-700">
            Please confirm inventory restock for SKU-441 before closing.
          </div>
        </div>
        <div className="absolute bottom-3 left-10 right-3 h-9 rounded-full border border-stone-200 bg-white px-3 flex items-center text-[11px] text-stone-400">
          Reply to customer…
        </div>
      </div>
    </BrowserChrome>
  );
}

function PrivacyMock() {
  return (
    <BrowserChrome title="metabase.internal / Revenue · This quarter">
      <div className="absolute inset-0 p-3.5 grid grid-cols-3 gap-2.5 content-start">
        <div className="relative rounded-xl border border-stone-200 p-3 bg-white">
          <div
            className="absolute inset-2 rounded-lg border-2 pointer-events-none"
            style={{ borderColor: ACCENT }}
            aria-hidden
          />
          <HandNote className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 whitespace-normal text-center max-w-[5rem]">
            MRR is off
          </HandNote>
          <p className="text-[10px] text-stone-400">MRR</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">$42.1k</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">+12% MoM</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400">Churn</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">2.4%</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400">ARPU</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">$89</p>
        </div>
        <div className="col-span-3 rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400 mb-2">Top accounts</p>
          <div className="space-y-1.5 text-[11px] text-stone-600">
            <div className="relative flex justify-between gap-2 items-center py-0.5">
              <div
                className="absolute inset-y-0 left-0 right-[30%] rounded bg-stone-800/50 border border-dashed pointer-events-none"
                style={{ borderColor: ACCENT }}
                aria-hidden
              />
              <span className="font-mono text-[10px] relative z-0">nova@acme.io</span>
              <span className="tabular-nums relative z-0">$8,200</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="font-mono text-[10px]">ops@bright.co</span>
              <span className="tabular-nums">$5,400</span>
            </div>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

const MOCKS: Record<Kind, React.FC> = {
  bug: BugMock,
  settings: SettingsMock,
  support: SupportMock,
  privacy: PrivacyMock,
};

export default function LandingScenarioDemo() {
  const [index, setIndex] = useState(0);
  const scenario = SCENARIOS[index];
  const Mock = MOCKS[scenario.id];

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SCENARIOS.length);
    }, 5600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={scenario.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-5"
        >
          <p className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            {scenario.title}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {scenario.subtitle}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="relative rounded-2xl border border-border bg-surface shadow-[var(--floating-shadow)] overflow-hidden aspect-[16/10]">
        <div className="absolute inset-0 bg-[#ebe9e7] canvas-dot-grid opacity-90" />
        <AnimatePresence mode="wait">
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            <Mock />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Demo scenarios">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={s.title}
            onClick={() => setIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === index ? 'w-6 bg-accent' : 'w-1.5 bg-border hover:bg-muted-foreground/40',
            )}
          />
        ))}
      </div>
    </div>
  );
}
