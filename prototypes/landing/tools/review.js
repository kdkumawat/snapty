// node review.js [url]   self-review captures of the landing page into ../review/:
//   full-<w>.jpg      full page, light and dark side by side, at 1920 / 1440 / 1280 / 390
//   hero-desktop.jpg  the first viewport at 1920x1080, 1440x900 and 1280x720 (is the film above the fold, note aligned?)
//   tabs-<theme>.jpg  every use-case tab after dragging the divider with the keyboard
// Also prints overflow, console errors, failed requests and the film box vs its video aspect ratio.
const path = require('path');
const { chromium, exe } = require('./lib');
const sharp = require('D:/src/github.com/kdkumawat/snapty/node_modules/sharp');
const out = path.join(__dirname, '..', 'review'), URL = process.argv[2] || 'http://localhost:5000/';
const isApp = URL.includes('3001');
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const errors = [];
  const open = async (w, h, theme, reduce = true) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem('theme', t); localStorage.setItem('snapty-theme-choice', t); } catch {} }, [theme]);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${w} ${theme}: ${m.text().slice(0, 140)}`); });
    p.on('pageerror', (e) => errors.push(`${w} ${theme} pageerror: ${e.message}`));
    p.on('response', (r) => { if (r.status() >= 400) errors.push(`${w} ${theme} ${r.status()} ${r.url()}`); });
    await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(isApp ? 2500 : 1000);
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    return { ctx, p };
  };
  const fullShot = async (p, w, h) => {
    const H = await p.evaluate(() => (document.querySelector('.lp') || document.documentElement).scrollHeight);
    for (let y = 0; y < H; y += h * 0.7) { await p.evaluate((yy) => (document.querySelector('.lp') || window).scrollTo(0, yy), y); await p.waitForTimeout(150); }
    await p.evaluate(() => (document.querySelector('.lp') || window).scrollTo(0, 0)); await p.waitForTimeout(300);
    if (!isApp) return { H, buf: await p.screenshot({ fullPage: true }) };
    await p.setViewportSize({ width: w, height: H }); await p.waitForTimeout(500); return { H, buf: await p.screenshot() };
  };
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [390, 844]]) {
    const pair = [];
    for (const theme of ['light', 'dark']) {
      const { ctx, p } = await open(w, h, theme);
      const m = await p.evaluate(() => { const sc = document.querySelector('.lp') || document.documentElement; const f = document.querySelector('.shot-hero'), v = f.querySelector('video'), r = f.getBoundingClientRect(); return { sw: sc.scrollWidth, cw: sc.clientWidth, film: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], box: (v.clientWidth / v.clientHeight).toFixed(3) }; });
      const { H, buf } = await fullShot(p, w, h); pair.push(buf);
      console.log(`${w}x${h} ${theme}: page height ${H}, ${m.sw > m.cw ? 'H-OVERFLOW ' + m.sw : 'no h-scroll'}, hero film x,y,w,h=${m.film} box ratio ${m.box} (film is 1.500), bottom ${m.film[1] + m.film[3]} of ${h}`);
      await ctx.close();
    }
    const meta = await sharp(pair[0]).metadata(), meta2 = await sharp(pair[1]).metadata(); const hh = Math.max(meta.height, meta2.height);
    await sharp({ create: { width: w * 2 + 20, height: hh, channels: 3, background: '#888' } }).composite([{ input: pair[0], left: 0, top: 0 }, { input: pair[1], left: w + 20, top: 0 }]).jpeg({ quality: 88 }).toFile(path.join(out, `full-${w}${isApp ? '-app' : ''}.jpg`));
  }
  // hero at the three desktop sizes, motion on (the film is playing)
  const heroes = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720]]) { const { ctx, p } = await open(w, h, 'light', false); await p.waitForTimeout(9000); heroes.push(await sharp(await p.screenshot()).resize(1280).toBuffer()); await ctx.close(); }
  let y = 0; const comp = []; for (const hb of heroes) { const md = await sharp(hb).metadata(); comp.push({ input: hb, left: 0, top: y }); y += md.height + 16; }
  await sharp({ create: { width: 1280, height: y, channels: 3, background: '#888' } }).composite(comp).jpeg({ quality: 88 }).toFile(path.join(out, `hero-desktop${isApp ? '-app' : ''}.jpg`));
  // every tab, divider moved with the keyboard, in both themes
  for (const theme of ['light', 'dark']) {
    const { ctx, p } = await open(1440, 900, theme); const tiles = [];
    for (const id of ['tab-bug', 'tab-tut', 'tab-red', 'tab-des']) {
      await p.click('#' + id); await p.waitForTimeout(700);
      const input = p.locator('.panel:not([hidden]) [data-cmp] input'); await input.focus(); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
      const info = await p.evaluate(() => { const c = document.querySelector('.panel:not([hidden]) [data-cmp]'); const [a, d] = c.querySelectorAll('img'); return { pos: c.style.getPropertyValue('--pos'), before: [a.naturalWidth, a.naturalHeight], after: [d.naturalWidth, d.naturalHeight] }; });
      console.log(`tab ${id} ${theme}: divider ${info.pos} after 6x ArrowRight, before ${info.before} after ${info.after}`);
      tiles.push(await sharp(await p.locator('.panel:not([hidden])').screenshot()).resize(1000).toBuffer());
    }
    const md = await sharp(tiles[0]).metadata();
    await sharp({ create: { width: 2010, height: md.height * 2 + 10, channels: 3, background: '#888' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 1010, top: Math.floor(i / 2) * (md.height + 10) }))).jpeg({ quality: 88 }).toFile(path.join(out, `tabs-${theme}${isApp ? '-app' : ''}.jpg`));
    await ctx.close();
  }
  console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'console: no errors, no failed requests');
  await b.close();
})();
