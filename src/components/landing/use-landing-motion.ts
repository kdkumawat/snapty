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
      speaker: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2zM11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9"/></svg>',
      mute: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2zM11.5 6l3 4M14.5 6l-3 4"/></svg>',
      enter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
      exit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>',
    };
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData; // poster only, the visitor presses play
    type Clip = { fig: HTMLElement; v: HTMLVideoElement; visible: boolean; active: boolean; userPaused: boolean; near(): void; load(): void; wants(): boolean; sync(): void };
    const RATES = [0.5, 0.75, 1, 1.5]; // one speed for every film, kept for the visit
    let rate = 1;
    try { rate = RATES.find((r) => r === +(sessionStorage.getItem('snapty-rate') || 0)) || 1; } catch { /* storage blocked */ }
    let sound = false; // one shared music bed; the file is not requested until sound is turned on
    let bgm: HTMLAudioElement | null = null, fade = 0;
    const soundBtns: HTMLButtonElement[] = [], rateBtns: HTMLButtonElement[] = [];
    const fadeTo = (to: number, done?: () => void) => {
      cancelAnimationFrame(fade);
      const a = bgm!, from = a.volume, t0 = performance.now(), dur = reduce.matches ? 1 : 700;
      const tick = (t: number) => { const k = Math.max(0, Math.min(1, (t - t0) / dur)); a.volume = from + (to - from) * k; if (k < 1) fade = requestAnimationFrame(tick); else done?.(); };
      fade = requestAnimationFrame(tick);
    };
    const filmPlaying = () => clips.some((c) => !c.v.paused);
    // the hero film is cut to the music: while it plays, the audio follows its clock (seek, loop, speed); other films just run alongside
    const follow = (force?: boolean) => {
      const a = bgm, h = clips.find((c) => c.v.dataset.film === 'hero')?.v;
      if (!a) return;
      a.playbackRate = rate;
      if (!h || h.paused || !a.duration) return;
      const want = h.currentTime % a.duration, d = Math.abs(a.currentTime - want);
      if (force || Math.min(d, a.duration - d) > 0.08) a.currentTime = want;
    };
    const musicSync = () => { // music plays only while a film plays (visible, tab shown)
      const a = bgm; if (!a) return;
      const want = sound && filmPlaying();
      if (want && a.paused) { a.volume = 0; a.play().then(() => { follow(true); fadeTo(0.35); }).catch(() => {}); }
      else if (!want && !a.paused) fadeTo(0, () => { if (!(sound && filmPlaying())) a.pause(); });
    };
    const paintSound = () => soundBtns.forEach((b) => { b.innerHTML = sound ? ICON.speaker : ICON.mute; b.setAttribute('aria-pressed', String(sound)); b.setAttribute('aria-label', sound ? 'Sound on' : 'Sound off'); b.title = sound ? 'Sound on' : 'Sound off'; });
    const setRate = (r: number) => {
      rate = r; try { sessionStorage.setItem('snapty-rate', String(r)); } catch { /* storage blocked */ }
      clips.forEach((c) => { c.v.defaultPlaybackRate = r; c.v.playbackRate = r; });
      follow(true);
      rateBtns.forEach((b) => { b.textContent = r + 'x'; b.setAttribute('aria-label', `Playback speed ${r}x`); });
    };
    let lead: Clip | null = null; // the film the visitor last asked for wins over the others
    const clips: Clip[] = $$('[data-clip]').map((fig) => {
      const v = $<HTMLVideoElement>('video', fig)!;
      const btn = document.createElement('button'), ctl = document.createElement('div');
      ctl.className = 'clip-ctl'; fig.appendChild(ctl);
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
      btn.type = 'button'; btn.className = 'clip-btn';
      const paint = () => { const playing = !v.paused; btn.innerHTML = playing ? ICON.pause : ICON.play; btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip'); };
      v.addEventListener('play', paint, on); v.addEventListener('pause', paint, on); paint();
      v.defaultPlaybackRate = rate; v.playbackRate = rate;
      v.addEventListener('play', musicSync, on); v.addEventListener('pause', musicSync, on);
      if (v.dataset.film === 'hero') {
        for (const ev of ['play', 'seeked', 'ratechange']) v.addEventListener(ev, () => follow(true), on);
        v.addEventListener('timeupdate', () => follow(false), on);
      }
      { // speed: a button showing the speed, a menu with arrow keys
        const sp = document.createElement('button'), menu = document.createElement('div');
        sp.type = 'button'; sp.className = 'clip-btn clip-speed'; sp.setAttribute('aria-haspopup', 'menu'); sp.setAttribute('aria-expanded', 'false'); rateBtns.push(sp);
        menu.className = 'clip-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Playback speed'); menu.hidden = true;
        const close = (back?: boolean) => { menu.hidden = true; sp.setAttribute('aria-expanded', 'false'); if (back) sp.focus(); };
        const items = RATES.map((r) => {
          const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitemradio'); it.textContent = r + 'x'; it.tabIndex = -1; menu.appendChild(it);
          it.addEventListener('click', () => { setRate(r); close(true); }, on); return it;
        });
        const open = () => { items.forEach((it, i) => it.setAttribute('aria-checked', String(RATES[i] === rate))); menu.hidden = false; sp.setAttribute('aria-expanded', 'true'); items[RATES.indexOf(rate)].focus(); };
        sp.addEventListener('click', () => (menu.hidden ? open() : close(true)), on);
        menu.addEventListener('keydown', (e) => {
          const i = items.indexOf(document.activeElement as HTMLButtonElement), d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
          if (d) { e.preventDefault(); items[(i + d + items.length) % items.length].focus(); }
          else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
          else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
          else if (e.key === 'Escape') { e.preventDefault(); close(true); }
          else if (e.key === 'Tab') close();
        }, on);
        document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== sp) close(); }, on);
        ctl.append(menu, sp);
      }
      { // sound: one shared toggle; the audio element and the file only exist after the first press
        const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'clip-btn clip-st'; soundBtns.push(sb); ctl.appendChild(sb);
        sb.addEventListener('click', () => {
          sound = !sound;
          if (sound && !bgm) { bgm = new Audio(); bgm.preload = 'none'; bgm.loop = true; bgm.volume = 0; bgm.src = '/landing/bgm.mp3'; bgm.playbackRate = rate; }
          paintSound(); musicSync();
        }, on);
      }
      btn.addEventListener('click', () => { c.userPaused = !v.paused; if (!c.userPaused) lead = c; c.load(); syncAll(); }, on);
      if (document.fullscreenEnabled) { // fullscreen toggle: the film's container, standard Fullscreen API
        const fs = document.createElement('button');
        fs.type = 'button'; fs.className = 'clip-btn clip-st'; ctl.appendChild(fs);
        const paintFs = () => { const isOn = document.fullscreenElement === fig; fs.innerHTML = isOn ? ICON.exit : ICON.enter; fs.setAttribute('aria-label', isOn ? 'Exit full screen' : 'Full screen'); fs.title = fs.getAttribute('aria-label') || ''; };
        fs.addEventListener('click', () => { if (document.fullscreenElement === fig) void document.exitFullscreen(); else fig.requestFullscreen().catch(() => {}); }, on);
        document.addEventListener('fullscreenchange', paintFs, on); paintFs();
      }
      ctl.appendChild(btn);
      return c;
    });
    setRate(rate); paintSound();
    const syncAll = () => {
      const win = lead && clips.includes(lead) && lead.wants() ? lead : clips.find((c) => c.wants());
      clips.forEach((c) => { if (c === win) { c.load(); c.v.play().catch(() => {}); } else c.v.pause(); });
      musicSync();
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

    return () => { cancelAnimationFrame(fade); bgm?.pause(); ac.abort(); observers.forEach((io) => io.disconnect()); clips.forEach((c) => c.v.pause()); };
  }, [rootRef, router]);
}
