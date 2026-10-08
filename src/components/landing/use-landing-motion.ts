'use client';

import { useEffect, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { loadImageFileIntoEditor } from '@/lib/image-load';

/**
 * Everything on the landing page that moves or answers the visitor, wired to
 * the static markup in landing-page.tsx. Five independent blocks:
 * hand-drawn marks, films (lazy, play only while visible), the tour playlist,
 * use-case tabs with the before/after divider, and tool keys that select a film. Plus the paste
 * hand-off: an image pasted here opens in /editor.
 */
export function useLandingMotion(rootRef: RefObject<HTMLDivElement | null>) {
  const router = useRouter();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = root) => r.querySelector<T>(s);
    const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = root) => [...r.querySelectorAll<T>(s)];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const ac = new AbortController();
    const on = { signal: ac.signal };
    const observers: IntersectionObserver[] = [];
    const inView = (els: Element[], cb: (el: Element, visible: boolean, io: IntersectionObserver) => void, opts?: IntersectionObserverInit) => {
      const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.target, e.isIntersecting, io)), opts);
      els.forEach((el) => io.observe(el));
      observers.push(io);
    };

    // nav hairline once the page (its own scroll container) has moved: a sentinel at the top, no scroll listener
    const nav = $('.nav'), sentinel = $('.top-sentinel');
    if (nav && sentinel) inView([sentinel], (_el, vis) => nav.classList.toggle('is-stuck', !vis));

    // 1. marks + network rows draw on once
    inView($$('.mark'), (el, vis, io) => { if (vis) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.6 });
    inView($$('.net'), (el, vis, io) => { if (vis) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.35 });

    // 2. films: poster when near, sources only when the film should play; one plays at a time; none while the tab is hidden
    const ICON = {
      pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3.5v12H3zM9.5 2H13v12H9.5z"/></svg>',
      play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>',
      enter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
      exit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>',
    };
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData; // poster only, the visitor presses play
    type Clip = { fig: HTMLElement; v: HTMLVideoElement; visible: boolean; active: boolean; userPaused: boolean; near(): void; load(): void; wants(): boolean; sync(): void };
    let lead: Clip | null = null; // the film the visitor last asked for wins over the others
    const clips: Clip[] = $$('[data-clip]').map((fig) => {
      const v = $<HTMLVideoElement>('video', fig)!;
      const btn = document.createElement('button');
      const film = v.dataset.film;
      const c: Clip = {
        fig, v, visible: false, active: !fig.closest('[data-step]'), userPaused: reduce.matches || saveData,
        near() { if (film && !v.poster) v.poster = `/landing/${film}.webp`; },
        load() {
          c.near();
          if (!film || v.dataset.loaded || c.userPaused) return;
          v.dataset.loaded = '1';
          const kinds = v.hasAttribute('data-mp4only') ? [['mp4', 'video/mp4']] : [['webm', 'video/webm'], ['mp4', 'video/mp4']];
          for (const [ext, type] of kinds) { const s = document.createElement('source'); s.src = `/landing/${film}.${ext}`; s.type = type; v.appendChild(s); }
          v.load();
        },
        wants() { return c.visible && c.active && !c.userPaused && !document.hidden; },
        sync() { syncAll(); },
      };
      btn.type = 'button'; btn.className = 'clip-btn'; fig.appendChild(btn);
      const paint = () => { const playing = !v.paused; btn.innerHTML = playing ? ICON.pause : ICON.play; btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip'); };
      v.addEventListener('play', paint, on); v.addEventListener('pause', paint, on); paint();
      btn.addEventListener('click', () => { c.userPaused = !v.paused; if (!c.userPaused) lead = c; c.load(); syncAll(); }, on);
      if (document.fullscreenEnabled) { // fullscreen toggle: the film's container, standard Fullscreen API
        const fs = document.createElement('button');
        fs.type = 'button'; fs.className = 'clip-btn clip-fs'; fig.appendChild(fs);
        const paintFs = () => { const isOn = document.fullscreenElement === fig; fs.innerHTML = isOn ? ICON.exit : ICON.enter; fs.setAttribute('aria-label', isOn ? 'Exit full screen' : 'Full screen'); fs.title = fs.getAttribute('aria-label') || ''; };
        fs.addEventListener('click', () => { if (document.fullscreenElement === fig) void document.exitFullscreen(); else fig.requestFullscreen().catch(() => {}); }, on);
        document.addEventListener('fullscreenchange', paintFs, on); paintFs();
      }
      return c;
    });
    const syncAll = () => {
      const win = lead && clips.includes(lead) && lead.wants() ? lead : clips.find((c) => c.wants());
      clips.forEach((c) => { if (c === win) { c.load(); c.v.play().catch(() => {}); } else c.v.pause(); });
    };
    document.addEventListener('visibilitychange', syncAll, on);
    const byFig = new Map(clips.map((c) => [c.fig as Element, c]));
    inView(clips.map((c) => c.fig), (fig, vis) => { const c = byFig.get(fig)!; if (vis && c.active) c.near(); }, { rootMargin: '700px 0px' });
    inView(clips.map((c) => c.fig), (fig, vis) => { byFig.get(fig)!.visible = vis; syncAll(); }, { threshold: 0.35 });

    // 3. tour: a playlist. Choosing a step plays its film; when a film ends the next step takes over
    const steps = $$('[data-step]');
    let current = steps[0];
    const setStep = (el: HTMLElement, play?: boolean) => {
      current = el;
      steps.forEach((s) => {
        const isOn = s === el, c = byFig.get($('[data-clip]', s)!)!;
        s.classList.toggle('is-on', isOn);
        $('.step-head', s)?.setAttribute('aria-expanded', String(isOn));
        c.active = isOn;
        if (isOn) { c.near(); if (play) { c.userPaused = false; lead = c; } try { c.v.currentTime = 0; } catch { /* not loaded yet */ } }
        c.sync();
      });
    };
    steps.forEach((s, i) => {
      const c = byFig.get($('[data-clip]', s)!)!;
      c.v.loop = false;
      $('.step-head', s)?.addEventListener('click', () => setStep(s, true), on);
      c.v.addEventListener('ended', () => { if (current === s) setStep(steps[(i + 1) % steps.length]); }, on);
    });
    if (current) setStep(current);

    // 4. use cases: tabs + before/after divider
    const tabs = $$('[role="tab"]');
    const wide = matchMedia('(min-width: 1024px)'), tl = $('[role="tablist"]');
    const orient = () => tl?.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal');
    wide.addEventListener('change', orient, on); orient();
    const wipes = new WeakMap<Element, number>();
    const setPos = (cmp: HTMLElement, v: number) => { cmp.style.setProperty('--pos', v + '%'); cmp.dataset.edge = v < 12 ? 'start' : v > 88 ? 'end' : ''; };
    const wipe = (cmp: HTMLElement | null) => {
      if (!cmp) return;
      const input = $<HTMLInputElement>('input', cmp)!, to = 34;
      if (reduce.matches) { input.value = String(to); return setPos(cmp, to); }
      const t0 = performance.now(); wipes.set(cmp, t0);
      const tick = (t: number) => {
        if (wipes.get(cmp) !== t0) return;
        const k = Math.min(1, (t - t0) / 900), v = 100 + (to - 100) * (1 - Math.pow(1 - k, 3));
        input.value = String(v); setPos(cmp, v); if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    $$('[data-cmp]').forEach((cmp) => {
      const input = $<HTMLInputElement>('input', cmp)!; const stop = () => wipes.set(cmp, 0);
      input.addEventListener('pointerdown', stop, on); input.addEventListener('keydown', stop, on);
      input.addEventListener('input', () => setPos(cmp, +input.value), on);
    });
    const panelOf = (tab: Element) => root.querySelector<HTMLElement>('#' + tab.getAttribute('aria-controls'))!;
    const select = (tab: HTMLElement, focus?: boolean) => {
      tabs.forEach((t) => { const isOn = t === tab; t.setAttribute('aria-selected', String(isOn)); t.tabIndex = isOn ? 0 : -1; panelOf(t).hidden = !isOn; });
      if (focus) tab.focus();
      wipe($('[data-cmp]', panelOf(tab)));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t), on);
      t.addEventListener('keydown', (e) => {
        const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
        else if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
        else if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      }, on);
    });
    const firstCmp = $('.uses .cmp');
    if (firstCmp) inView([firstCmp], (_el, vis, io) => { if (vis) { wipe($('.panel:not([hidden]) [data-cmp]')); io.disconnect(); } }, { threshold: 0.5 });

    // 5. a tool's own key selects its film (N plays the badges film, U the callout film...)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const s = steps.find((x) => (x.dataset.keys || '').includes(e.key.toLowerCase()));
      if (!s) return;
      setStep(s, true);
      $('.step-head', s)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, on);

    // paste hand-off: the image goes into the editor store (in memory, never uploaded), then we navigate
    window.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      void loadImageFileIntoEditor(file, { mode: 'background', clearAnnotations: true }).catch(() => {}).then(() => router.push('/editor'));
    }, on);

    return () => { ac.abort(); observers.forEach((io) => io.disconnect()); clips.forEach((c) => c.v.pause()); };
  }, [rootRef, router]);
}
