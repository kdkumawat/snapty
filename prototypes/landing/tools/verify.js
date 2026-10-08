// node verify.js [shots|audit|frames]   review screenshots, contrast audit, overflow + console checks for http://localhost:5000
const path = require('path'), fs = require('fs');
const { chromium, exe } = require('./lib');
const out = path.join(__dirname, '..', 'review'); fs.mkdirSync(out, { recursive: true });
const URL = 'http://localhost:5000/';
const what = process.argv[2] || 'all';

// Contrast scan (same method as the editor audit): every visible text node against its composited background.
const scan = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const v = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const pageBg = rgba(getComputedStyle(document.body).backgroundColor);
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); const b = getComputedStyle(e, '::before'); if (b.content !== 'none' && b.backgroundColor && e.matches('[aria-selected="true"]')) stack.push(rgba(b.backgroundColor)); const c = rgba(s.backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] === 1) break; } } let b = pageBg; for (let i = stack.length - 1; i >= 0; i--) b = over(stack[i], b); return b; };
  const fails = [], all = []; let n = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = w.nextNode(); node; node = w.nextNode()) {
    const t = node.textContent.trim(); if (!t) continue; const el = node.parentElement; if (!el || el.closest('script,style,[hidden]')) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === 'hidden') continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity; if (op === 0) op = 1; // rows that fade in are measured at their final opacity
    const bg = bgOf(el); const f = rgba(s.color); f[3] *= op; const fg = over(f, bg);
    const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize); const large = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700); n++;
    all.push(cr);
    if (cr < (large ? 3 : 4.5)) fails.push(`${cr.toFixed(2)} ${s.color} on rgb(${bg.slice(0, 3).map(Math.round)}) ${px}px :: ${t.slice(0, 40)} <${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}>`);
  }
  return { n, min: Math.min(...all).toFixed(2), fails: [...new Set(fails)] };
};

(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const errors = [];
  for (const [w, h] of [[1440, 900], [390, 844], [1920, 1080], [360, 740]]) for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${w} ${theme} console.${m.type()}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${w} ${theme} pageerror: ${e.message}`));
    p.on('requestfailed', (r) => errors.push(`${w} ${theme} requestfailed: ${r.url()}`));
    p.on('response', (r) => { if (r.status() >= 400) errors.push(`${w} ${theme} ${r.status()}: ${r.url()}`); });
    await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(600);
    // load every lazy poster / image, then return to the top
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += h * 0.8) { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(140); }
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight }));
    console.log(`${w}x${h} ${theme}: scrollWidth ${m.sw} / ${m.iw} ${m.sw > m.iw ? 'OVERFLOW' : 'ok'}, height ${m.h}`);
    if (what !== 'audit' && (w === 1440 || w === 390)) await p.screenshot({ path: path.join(out, `page-${w}-${theme}.png`), fullPage: true });
    if (what !== 'shots') {
      const a = await p.evaluate(scan); console.log(`  contrast: ${a.n} text nodes, min ${a.min}, fails ${a.fails.length}`); a.fails.forEach((x) => console.log('    ' + x));
      for (const id of ['tab-tut', 'tab-red', 'tab-des']) { await p.click('#' + id); const t = await p.evaluate(scan); if (t.fails.length) { console.log('  after ' + id); t.fails.forEach((x) => console.log('    ' + x)); } }
    }
    await ctx.close();
  }
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'console: no errors, no failed requests');
  await b.close();
})();
