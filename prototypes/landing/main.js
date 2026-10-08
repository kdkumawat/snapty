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
  const nav = $('.nav');
  const stuck = () => nav.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', stuck, { passive: true }); stuck();

  // 2. Hand-drawn marks: inject rough.js paths, draw them on when they scroll in ---
  const inView = (els, cb, opts) => { const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.target, e.isIntersecting, io)), opts); els.forEach((el) => io.observe(el)); };
  $$('svg[data-mark]').forEach((svg) => (window.SNAPTY_MARKS?.[svg.dataset.mark] || []).forEach((d) => {
    const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); p.setAttribute('pathLength', '1'); svg.appendChild(p);
  }));
  inView($$('.mark'), (el, on, io) => { if (on) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.6 });
  inView($$('.net'), (el, on, io) => { if (on) { el.classList.add('is-in'); io.unobserve(el); } }, { threshold: 0.35 });

  // 3. Clips: load near the viewport, play only while visible (and active), pause button on each ---
  const ICON = { pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3.500v12H3zM9.500 2H13v12H9.500z"/></svg>', play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>' };
  const clips = $$('[data-clip]').map((fig) => {
    const v = $('video', fig), btn = document.createElement('button');
    const c = { fig, v, visible: false, active: !fig.closest('[data-step]'), userPaused: reduce.matches };
    btn.type = 'button'; btn.className = 'clip-btn'; fig.appendChild(btn);
    const paint = () => { const playing = !v.paused; btn.innerHTML = playing ? ICON.pause : ICON.play; btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip'); };
    v.addEventListener('play', paint); v.addEventListener('pause', paint); paint();
    btn.addEventListener('click', () => { c.userPaused = !v.paused; c.load(); c.sync(); });
    // data-film="name" -> media/name.webp poster (when near), media/name.webm + .mp4 sources (when it should play)
    const film = v.dataset.film;
    c.near = () => { if (film && !v.poster) v.poster = `media/${film}.webp`; };
    c.load = () => { c.near(); if (!film || v.dataset.loaded || c.userPaused) return; v.dataset.loaded = '1';
      for (const [ext, type] of v.hasAttribute('data-mp4only') ? [['mp4', 'video/mp4']] : [['webm', 'video/webm'], ['mp4', 'video/mp4']]) { const s = document.createElement('source'); s.src = `media/${film}.${ext}`; s.type = type; v.appendChild(s); }
      v.load(); };
    c.sync = () => { const want = c.visible && c.active && !c.userPaused; if (want) { c.load(); v.play().catch(() => {}); } else v.pause(); };
    return c;
  });
  const byFig = new Map(clips.map((c) => [c.fig, c]));
  inView(clips.map((c) => c.fig), (fig, on) => { if (on) byFig.get(fig).near(); }, { rootMargin: '700px 0px' });
  inView(clips.map((c) => c.fig), (fig, on) => { const c = byFig.get(fig); c.visible = on; c.sync(); }, { threshold: 0.35 });

  // 4. Tour: a playlist. Choosing a step plays its film; when a film ends the next step takes over.
  const steps = $$('[data-step]');
  let current = steps[0];
  const setStep = (el, play) => { current = el; steps.forEach((s) => {
    const on = s === el, c = byFig.get($('[data-clip]', s)); s.classList.toggle('is-on', on); $('.step-head', s).setAttribute('aria-expanded', on);
    c.active = on; if (on) { if (play) c.userPaused = false; try { c.v.currentTime = 0; } catch {} } c.sync(); }); };
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
    t.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); } else if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); } else if (e.key === 'End') { e.preventDefault(); select(tabs.at(-1), true); } });
  });
  inView([$('.uses .cmp')], (el, on, io) => { if (on) { wipe($('.panel:not([hidden]) [data-cmp]')); io.disconnect(); } }, { threshold: 0.5 });

  // Paste hint: acknowledge a pasted image. Production hands it to /editor (same origin) instead.
  addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/')); if (!file) return;
    const box = $('#paste-result'), img = new Image(), a = document.createElement('a');
    img.alt = ''; img.src = URL.createObjectURL(file);
    a.href = $('.hero .btn').href; a.textContent = 'open the editor and paste again';
    box.replaceChildren(img, Object.assign(document.createElement('span'), { textContent: 'Got your screenshot, and it stayed in this tab. This prototype cannot hand it over, so ' }));
    box.lastChild.append(a, '.'); box.hidden = false;
  });
})();
