// Snapty landing prototype. Five small, independent blocks; each ports to one small client component.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const SVG = 'http://www.w3.org/2000/svg';

  // 1. Theme toggle -----------------------------------------------------------
  // One button, three states: System -> Dark -> Light. "system" follows the OS live.
  const root = document.documentElement, themeBtn = $('#theme'), osDark = matchMedia('(prefers-color-scheme: dark)');
  const ORDER = ['system', 'dark', 'light'], NAME = { system: 'System', dark: 'Dark', light: 'Light' };
  const applyTheme = (choice) => {
    root.dataset.themeChoice = choice;
    root.dataset.theme = choice === 'system' ? (osDark.matches ? 'dark' : 'light') : choice;
    const label = `Theme: ${NAME[choice]}. Switch to ${NAME[ORDER[(ORDER.indexOf(choice) + 1) % 3]]}`;
    themeBtn.dataset.choice = choice; themeBtn.setAttribute('aria-label', label); themeBtn.title = label;
  };
  themeBtn.addEventListener('click', () => { const next = ORDER[(ORDER.indexOf(root.dataset.themeChoice) + 1) % 3]; try { localStorage.setItem('snapty-theme-choice', next); } catch {} applyTheme(next); });
  osDark.addEventListener('change', () => { if (root.dataset.themeChoice === 'system') applyTheme('system'); });
  applyTheme(ORDER.includes(root.dataset.themeChoice) ? root.dataset.themeChoice : 'system');
  const nav = $('.nav'), sentinel = $('.top-sentinel');
  new IntersectionObserver(([e]) => nav.classList.toggle('is-stuck', !e.isIntersecting)).observe(sentinel);   // no scroll listener

  // 2. Hand-drawn marks: inject rough.js paths, draw them on when they scroll in ---
  const inView = (els, cb, opts) => { const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.target, e.isIntersecting, io)), opts); els.forEach((el) => io.observe(el)); };
  $$('svg[data-mark]').forEach((svg) => (window.SNAPTY_MARKS?.[svg.dataset.mark] || []).forEach((d) => {
    const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); p.setAttribute('pathLength', '1'); svg.appendChild(p);
  }));
  inView($$('.mark'), (el, on, io) => { if (on) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.6 });
  inView($$('.net'), (el, on, io) => { if (on) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.35 });

  // 3. Clips: poster when near, sources only when the clip should play; one plays at a time; none while the tab is hidden ---
  const ICON = { pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3.500v12H3zM9.500 2H13v12H9.500z"/></svg>', play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>',
    speaker: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2zM11.500 5.500a3.500 3.500 0 0 1 0 5M13 3.500a6 6 0 0 1 0 9"/></svg>', mute: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2zM11.500 6l3 4M14.500 6l-3 4"/></svg>',
    enter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>', exit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>' };
  const saveData = !!navigator.connection?.saveData;   // Save-Data and reduced motion: poster only, the visitor presses play
  const RATES = [0.5, 0.75, 1, 1.5];                   // one speed for every film, kept for the visit
  let rate = 1; try { rate = RATES.find((r) => r === +sessionStorage.getItem('snapty-rate')) || 1; } catch {}
  let sound = false;                                   // one shared music bed; the file is not requested until sound is turned on
  let bgm = null, fade = 0;
  const soundBtns = [], rateBtns = [];
  const fadeTo = (to, done) => { cancelAnimationFrame(fade); const from = bgm.volume, t0 = performance.now(), dur = reduce.matches ? 1 : 700;
    const tick = (t) => { const k = Math.max(0, Math.min(1, (t - t0) / dur)); bgm.volume = from + (to - from) * k; if (k < 1) fade = requestAnimationFrame(tick); else done?.(); }; fade = requestAnimationFrame(tick); };
  const filmPlaying = () => clips.some((c) => !c.v.paused);
  // the hero film is cut to the music: while it plays, the audio follows its clock (seek, loop, speed); other films just run alongside
  const follow = (force) => { const h = clips.find((c) => c.v.dataset.film === 'hero')?.v;
    if (!bgm) return; bgm.playbackRate = rate;
    if (!h || h.paused || !bgm.duration) return;
    const want = h.currentTime % bgm.duration, d = Math.abs(bgm.currentTime - want);
    if (force || Math.min(d, bgm.duration - d) > 0.08) bgm.currentTime = want; };
  const musicSync = () => {                            // music plays only while a film plays (visible, tab shown)
    if (!bgm) return; const on = sound && filmPlaying();
    if (on && bgm.paused) { bgm.volume = 0; bgm.play().then(() => { follow(true); fadeTo(0.35); }).catch(() => {}); }
    else if (!on && !bgm.paused) fadeTo(0, () => { if (!(sound && filmPlaying())) bgm.pause(); });
  };
  const paintSound = () => soundBtns.forEach((b) => { b.innerHTML = sound ? ICON.speaker : ICON.mute; b.setAttribute('aria-pressed', sound); b.setAttribute('aria-label', sound ? 'Sound on' : 'Sound off'); b.title = sound ? 'Sound on' : 'Sound off'; });
  const setRate = (r) => { rate = r; try { sessionStorage.setItem('snapty-rate', r); } catch {} clips.forEach((c) => { c.v.defaultPlaybackRate = r; c.v.playbackRate = r; }); follow(true); rateBtns.forEach((b) => { b.textContent = r + 'x'; b.setAttribute('aria-label', `Playback speed ${r}x`); }); };
  let lead = null;                                     // the clip the visitor last asked for wins over the others
  const clips = $$('[data-clip]').map((fig) => {
    const v = $('video', fig), btn = document.createElement('button'), ctl = document.createElement('div');
    ctl.className = 'clip-ctl'; fig.appendChild(ctl);
    const c = { fig, v, visible: false, active: !fig.closest('[data-step]'), userPaused: reduce.matches || saveData };
    btn.type = 'button'; btn.className = 'clip-btn';
    const paint = () => { const playing = !v.paused; btn.innerHTML = playing ? ICON.pause : ICON.play; btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip'); };
    v.addEventListener('play', paint); v.addEventListener('pause', paint); paint();
    v.defaultPlaybackRate = rate; v.playbackRate = rate;
    v.addEventListener('play', musicSync); v.addEventListener('pause', musicSync);
    if (v.dataset.film === 'hero') for (const ev of ['play', 'seeked', 'ratechange']) v.addEventListener(ev, () => follow(true));
    if (v.dataset.film === 'hero') v.addEventListener('timeupdate', () => follow(false));
    {  // speed: a button showing the speed, a menu with arrow keys
      const sp = document.createElement('button'), menu = document.createElement('div');
      sp.type = 'button'; sp.className = 'clip-btn clip-speed'; sp.setAttribute('aria-haspopup', 'menu'); sp.setAttribute('aria-expanded', 'false'); rateBtns.push(sp);
      menu.className = 'clip-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Playback speed'); menu.hidden = true;
      const close = (back) => { menu.hidden = true; sp.setAttribute('aria-expanded', 'false'); if (back) sp.focus(); };
      const items = RATES.map((r) => { const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitemradio'); it.textContent = r + 'x'; it.tabIndex = -1; menu.appendChild(it);
        it.addEventListener('click', () => { setRate(r); close(true); }); return it; });
      const open = () => { items.forEach((it, i) => it.setAttribute('aria-checked', RATES[i] === rate)); menu.hidden = false; sp.setAttribute('aria-expanded', 'true'); items[RATES.indexOf(rate)].focus(); };
      sp.addEventListener('click', () => (menu.hidden ? open() : close(true)));
      menu.addEventListener('keydown', (e) => { const i = items.indexOf(document.activeElement), d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); items[(i + d + items.length) % items.length].focus(); } else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); } else if (e.key === 'End') { e.preventDefault(); items.at(-1).focus(); } else if (e.key === 'Escape') { e.preventDefault(); close(true); } else if (e.key === 'Tab') close(); });
      document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== sp) close(); });
      ctl.append(menu, sp);
    }
    {  // sound: one shared toggle; the audio element and the file only exist after the first press
      const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'clip-btn clip-st'; soundBtns.push(sb); ctl.appendChild(sb);
      sb.addEventListener('click', () => { sound = !sound;
        if (sound && !bgm) { bgm = new Audio(); bgm.preload = 'none'; bgm.loop = true; bgm.volume = 0; bgm.src = 'media/bgm.mp3'; bgm.playbackRate = rate; }
        paintSound(); musicSync(); });
    }
    btn.addEventListener('click', () => { c.userPaused = !v.paused; if (!c.userPaused) lead = c; c.load(); syncAll(); });
    if (document.fullscreenEnabled) {                  // fullscreen toggle: the film's container, standard Fullscreen API
      const fs = document.createElement('button');
      fs.type = 'button'; fs.className = 'clip-btn clip-st'; ctl.appendChild(fs);
      const paintFs = () => { const on = document.fullscreenElement === fig; fs.innerHTML = on ? ICON.exit : ICON.enter; fs.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen'); fs.title = fs.getAttribute('aria-label'); };
      fs.addEventListener('click', () => { if (document.fullscreenElement === fig) document.exitFullscreen(); else fig.requestFullscreen().catch(() => {}); });
      document.addEventListener('fullscreenchange', paintFs); paintFs();
    }
    // data-film="name" -> media/name.webp poster (when near), media/name.webm + .mp4 sources (when it should play)
    const film = v.dataset.film;
    c.near = () => { if (film && !v.poster) v.poster = `media/${film}.webp`; };
    c.load = () => { c.near(); if (!film || v.dataset.loaded || c.userPaused) return; v.dataset.loaded = '1';
      for (const [ext, type] of v.hasAttribute('data-mp4only') ? [['mp4', 'video/mp4']] : [['webm', 'video/webm'], ['mp4', 'video/mp4']]) { const s = document.createElement('source'); s.src = `media/${film}.${ext}`; s.type = type; v.appendChild(s); }
      v.load(); };
    c.wants = () => c.visible && c.active && !c.userPaused && !document.hidden;
    ctl.appendChild(btn);
    return c;
  });
  setRate(rate); paintSound();
  const syncAll = () => {
    const win = clips.includes(lead) && lead.wants() ? lead : clips.find((c) => c.wants());
    clips.forEach((c) => { if (c === win) { c.load(); c.v.play().catch(() => {}); } else c.v.pause(); });
    musicSync();
  };
  clips.forEach((c) => { c.sync = syncAll; });
  document.addEventListener('visibilitychange', syncAll);
  const byFig = new Map(clips.map((c) => [c.fig, c]));
  inView(clips.map((c) => c.fig), (fig, on) => { const c = byFig.get(fig); if (on && c.active) c.near(); }, { rootMargin: '700px 0px' });
  inView(clips.map((c) => c.fig), (fig, on) => { byFig.get(fig).visible = on; syncAll(); }, { threshold: 0.35 });

  // 4. Tour: a playlist. Choosing a step plays its film; when a film ends the next step takes over.
  const steps = $$('[data-step]');
  let current = steps[0];
  const setStep = (el, play) => { current = el; steps.forEach((s) => {
    const on = s === el, c = byFig.get($('[data-clip]', s)); s.classList.toggle('is-on', on); $('.step-head', s).setAttribute('aria-expanded', on);
    c.active = on; if (on) { c.near(); if (play) { c.userPaused = false; lead = c; } try { c.v.currentTime = 0; } catch {} } c.sync(); }); };
  steps.forEach((s, i) => {
    const c = byFig.get($('[data-clip]', s)); c.v.loop = false;
    $('.step-head', s).addEventListener('click', () => setStep(s, true));
    c.v.addEventListener('ended', () => { if (current === s) setStep(steps[(i + 1) % steps.length]); });
  });
  setStep(current);
  // a tool's own key selects its film (N plays the badges film, U the callout film...)
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const s = steps.find((x) => x.dataset.keys.includes(e.key.toLowerCase())); if (!s) return;
    setStep(s, true); $('.step-head', s).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // 5. Use cases: tabs + before/after divider ---------------------------------
  const tabs = $$('[role="tab"]');
  const wide = matchMedia('(min-width: 1024px)'), tl = $('[role="tablist"]');
  const orient = () => tl.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal'); wide.addEventListener('change', orient); orient();
  const setPos = (cmp, v) => { cmp.style.setProperty('--pos', v + '%'); cmp.dataset.edge = v < 12 ? 'start' : v > 88 ? 'end' : ''; };
  const wipe = (cmp) => {
    const input = $('input', cmp), to = 34;
    if (reduce.matches) { input.value = to; return setPos(cmp, to); }
    const t0 = performance.now(), from = 100, dur = 900; cmp._wipe = t0;
    const tick = (t) => { if (cmp._wipe !== t0) return; const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; input.value = v; setPos(cmp, v); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  $$('[data-cmp]').forEach((cmp) => { const input = $('input', cmp); const stop = () => { cmp._wipe = 0; }; input.addEventListener('pointerdown', stop); input.addEventListener('keydown', stop); input.addEventListener('input', () => setPos(cmp, +input.value)); });
  const select = (tab, focus) => {
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; });
    if (focus) tab.focus();
    wipe($('[data-cmp]', $('#' + tab.getAttribute('aria-controls'))));
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key]; if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); } else if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); } else if (e.key === 'End') { e.preventDefault(); select(tabs.at(-1), true); } });
  });
  inView([$('.uses .cmp')], (el, on, io) => { if (on) { wipe($('.panel:not([hidden]) [data-cmp]')); io.disconnect(); } }, { threshold: 0.5 });

  // Paste hint: acknowledge a pasted image. Production hands it to /editor (same origin) instead.
  addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/')); if (!file) return;
    const box = $('#paste-result'), img = new Image(), a = document.createElement('a');
    img.alt = ''; img.src = URL.createObjectURL(file);
    a.href = $('.hero .btn').href; a.textContent = 'open the editor and paste again';
    box.replaceChildren(img, Object.assign(document.createElement('span'), { textContent: 'Got your screenshot, and it stayed on this device. This prototype cannot hand it over, so ' }));
    box.lastChild.append(a, '.'); box.hidden = false;
  });
})();
