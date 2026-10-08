// node compare.js   pixel-compares the prototype (http://localhost:5000) with the app landing (http://localhost:3001/)
// at identical viewport and theme: page top plus each section. Motion is reduced in both so films show their posters
// and hand-drawn marks are complete. Prints the share of differing pixels per pair; writes a side-by-side + diff
// image to ../review/cmp-*.png for any pair above 0.05 %.
const path = require('path'), fs = require('fs');
const { chromium, exe } = require('./lib');
const sharp = require('D:/src/github.com/kdkumawat/snapty/node_modules/sharp');
const out = path.join(__dirname, '..', 'review');
const SECTIONS = [['top', null], ['tools', '#tools'], ['uses', '#uses'], ['privacy', '#privacy'], ['close', '.close'], ['foot', '.foot']];
const only = process.argv[2];

async function shots(b, url, w, h, theme, isApp) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: 'reduce' });
  await ctx.addInitScript(([t]) => { try { localStorage.setItem('theme', t); localStorage.setItem('snapty-theme-choice', t); } catch {} }, [theme]);
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(isApp ? 2500 : 1200);
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important} *{caret-color:transparent!important}' });
  await p.evaluate(() => document.fonts.ready);
  // load every lazy poster / image first
  const H = await p.evaluate(() => (document.querySelector('.lp') || document.documentElement).scrollHeight);
  for (let y = 0; y < H; y += h * 0.7) { await p.evaluate((yy) => (document.querySelector('.lp') || window).scrollTo(0, yy), y); await p.waitForTimeout(120); }
  const res = { H };
  for (const [name, sel] of SECTIONS) {
    await p.evaluate((s) => { const sc = document.querySelector('.lp'); const top = s ? document.querySelector(s).getBoundingClientRect().top + (sc ? sc.scrollTop : scrollY) - 70 : 0; (sc || window).scrollTo({ top, behavior: 'instant' }); }, sel);
    await p.waitForTimeout(500);
    res[name] = await p.screenshot({ type: 'png' });
  }
  await ctx.close(); return res;
}

(async () => {
  const b = await chromium.launch({ executablePath: exe });
  let worst = 0;
  for (const [w, h] of [[1920, 1080], [1440, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
    if (only && only !== String(w)) continue;
    const A = await shots(b, 'http://localhost:5000/', w, h, theme, false), B = await shots(b, 'http://localhost:3001/', w, h, theme, true);
    const row = [];
    for (const [name] of SECTIONS) {
      const a = await sharp(A[name]).removeAlpha().raw().toBuffer(), c = await sharp(B[name]).removeAlpha().raw().toBuffer();
      let diff = 0; const mask = Buffer.alloc(w * h * 3, 255);
      for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - c[i]) > 12 || Math.abs(a[i + 1] - c[i + 1]) > 12 || Math.abs(a[i + 2] - c[i + 2]) > 12) { diff++; mask[i] = 230; mask[i + 1] = 30; mask[i + 2] = 30; }
      const pct = (diff / (w * h)) * 100; worst = Math.max(worst, pct); row.push(`${name} ${pct.toFixed(3)}%`);
      if (pct > 0.05) {
        const m = await sharp(mask, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
        await sharp({ create: { width: w * 3, height: h, channels: 3, background: '#000' } }).composite([{ input: A[name], left: 0, top: 0 }, { input: B[name], left: w, top: 0 }, { input: m, left: w * 2, top: 0 }]).png().toFile(path.join(out, `cmp-${w}-${theme}-${name}.png`));
      }
    }
    console.log(`${w}x${h} ${theme}: height ${A.H} vs ${B.H} | ${row.join(' | ')}`);
  }
  console.log('worst pair', worst.toFixed(3) + '%');
  await b.close();
})();
