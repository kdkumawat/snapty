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

/** Annotations aligned to each realistic UI mock (viewBox 520x300). */
function Annotation({ kind }: { kind: Kind }) {
  if (kind === 'bug') {
    return (
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 520 300" fill="none" aria-hidden>
        <ellipse cx="368" cy="248" rx="92" ry="28" stroke="#EA580C" strokeWidth="2.4" />
        <path d="M210 118 L320 220" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M304 208 L328 228 L300 224 Z" fill="#EA580C" />
        <text x="72" y="108" fill="#EA580C" fontSize="22" fontFamily="var(--font-handwritten), Caveat, cursive">
          covers the terms link
        </text>
      </svg>
    );
  }
  if (kind === 'settings') {
    return (
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 520 300" fill="none" aria-hidden>
        <rect x="168" y="168" width="286" height="48" rx="10" stroke="#EA580C" strokeWidth="2.2" strokeDasharray="5 4" />
        <path d="M454 192 L488 132" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M476 128 L496 132 L482 146 Z" fill="#EA580C" />
        <text x="360" y="118" fill="#EA580C" fontSize="20" fontFamily="var(--font-handwritten), Caveat, cursive">
          what does this mean?
        </text>
      </svg>
    );
  }
  if (kind === 'support') {
    return (
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 520 300" fill="none" aria-hidden>
        <circle cx="48" cy="108" r="14" fill="#EA580C" />
        <text x="48" y="113" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">1</text>
        <circle cx="48" cy="168" r="14" fill="#EA580C" />
        <text x="48" y="173" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">2</text>
        <circle cx="48" cy="228" r="14" fill="#EA580C" />
        <text x="48" y="233" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">3</text>
        <text x="300" y="58" fill="#EA580C" fontSize="20" fontFamily="var(--font-handwritten), Caveat, cursive">
          skipped verify step
        </text>
        <path d="M62 168 H88" stroke="#EA580C" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 520 300" fill="none" aria-hidden>
      <rect x="72" y="198" width="168" height="22" rx="4" fill="#1c1917" opacity="0.55" />
      <rect x="72" y="198" width="168" height="22" rx="4" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="4 3" />
      <circle cx="156" cy="112" r="36" stroke="#EA580C" strokeWidth="2.2" />
      <circle cx="280" cy="188" r="54" stroke="#EA580C" strokeWidth="2" />
      <path d="M186 136 L236 162" stroke="#EA580C" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="318" y="52" fill="#EA580C" fontSize="20" fontFamily="var(--font-handwritten), Caveat, cursive">
        MRR is off by $8k
      </text>
    </svg>
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
      <div className="flex-1 min-h-0 relative bg-white">{children}</div>
    </div>
  );
}

function UiMock({ kind }: { kind: Kind }) {
  if (kind === 'bug') {
    return (
      <BrowserChrome title="checkout.acme.shop / cart">
        <div className="absolute inset-0 flex">
          <div className="flex-1 p-4 border-r border-stone-100">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-2">Order summary</p>
            <div className="flex gap-3 mb-3">
              <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-2.5 w-28 rounded bg-stone-200" />
                <div className="h-2 w-16 rounded bg-stone-100" />
                <p className="text-[11px] text-stone-600 font-medium">$42.00</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-2.5 w-24 rounded bg-stone-200" />
                <div className="h-2 w-14 rounded bg-stone-100" />
                <p className="text-[11px] text-stone-600 font-medium">$9.50</p>
              </div>
            </div>
          </div>
          <div className="w-[48%] p-4 flex flex-col">
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
            <div className="relative mt-3">
              <p className="text-[10px] text-stone-400 mb-2 underline decoration-stone-300">
                Terms &amp; refund policy
              </p>
              <button
                type="button"
                className="w-full h-10 rounded-lg bg-[#EA580C] text-white text-sm font-semibold shadow-sm relative -mt-1"
              >
                Pay $51.50
              </button>
            </div>
          </div>
        </div>
      </BrowserChrome>
    );
  }
  if (kind === 'settings') {
    return (
      <BrowserChrome title="app.notion.so / settings / workspace">
        <div className="absolute inset-0 flex">
          <aside className="w-[30%] border-r border-stone-100 bg-[#fafafa] p-3 space-y-2">
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
          <div className="flex-1 p-4 space-y-2.5">
            <p className="text-sm font-semibold text-stone-800 mb-1">Security</p>
            {[
              ['Require 2FA for admins', true],
              ['Allow public page sharing', true],
              ['Enable guest link previews', true],
            ].map(([label, on]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5 bg-white">
                <span className="text-[12px] text-stone-700">{label as string}</span>
                <span className={cn('h-5 w-9 rounded-full relative shrink-0', on ? 'bg-accent' : 'bg-stone-200')}>
                  <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', on ? 'right-0.5' : 'left-0.5')} />
                </span>
              </div>
            ))}
            <p className="text-[10px] text-stone-400 px-1">Guest link previews may expose page titles in Slack unfurls.</p>
          </div>
        </div>
      </BrowserChrome>
    );
  }
  if (kind === 'support') {
    return (
      <BrowserChrome title="Intercom · Ticket #4821 · Partial refund">
        <div className="absolute inset-0 p-4 pl-12 space-y-2.5 text-[12px] overflow-hidden">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-stone-100 px-3 py-2 text-stone-700">
            Customer wants a <span className="font-semibold">partial</span> refund on order 9921 ($28 of $64).
          </div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-accent/15 px-3 py-2 text-stone-800 border border-accent/20">
            Processed full refund $64.00. Closing ticket.
          </div>
          <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-stone-100 px-3 py-2 text-stone-700">
            Please confirm inventory restock for SKU-441 before closing.
          </div>
          <div className="absolute bottom-3 left-12 right-3 h-9 rounded-full border border-stone-200 bg-white px-3 flex items-center text-[11px] text-stone-400">
            Reply to customer…
          </div>
        </div>
      </BrowserChrome>
    );
  }
  return (
    <BrowserChrome title="metabase.internal / Revenue · This quarter">
      <div className="absolute inset-0 p-3.5 grid grid-cols-3 gap-2.5 content-start">
        <div className="rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400">MRR</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">$42.1k</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">+12% MoM</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400">Churn</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">2.4%</p>
          <p className="text-[10px] text-stone-400 mt-0.5">stable</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400">ARPU</p>
          <p className="text-lg font-semibold text-stone-800 tracking-tight">$89</p>
          <p className="text-[10px] text-amber-600 mt-0.5">check source</p>
        </div>
        <div className="col-span-3 rounded-xl border border-stone-200 p-3 bg-white">
          <p className="text-[10px] text-stone-400 mb-2">Top accounts</p>
          <div className="space-y-1.5 text-[11px] text-stone-600">
            <div className="flex justify-between gap-2">
              <span className="font-mono text-[10px]">nova@acme.io</span>
              <span className="tabular-nums">$8,200</span>
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

export default function LandingScenarioDemo() {
  const [index, setIndex] = useState(0);
  const scenario = SCENARIOS[index];

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
        <div className="absolute inset-0 bg-[#e7e5e4]" />
        <AnimatePresence mode="wait">
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            <UiMock kind={scenario.id} />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={`ann-${scenario.id}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.12 }}
            className="absolute inset-0 pointer-events-none"
          >
            <Annotation kind={scenario.id} />
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
