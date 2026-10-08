// node views.js [width] [theme]  viewport screenshots at each section (motion on), into ../review/view-*.png
const path = require('path'); const { chromium, exe } = require('./lib');
const w = +(process.argv[2] || 1440), theme = process.argv[3] || 'light', h = +(process.argv[4] || (w < 600 ? 844 : w >= 1900 ? 1080 : w === 1280 ? 720 : 900));
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const p = await (await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme })).newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:5000/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const shot = async (n) => p.screenshot({ path: path.join(__dirname, '..', 'review', `view-${w}-${theme}-${n}.png`) });
  await shot('1-hero');
  const steps = await p.$$('[data-step] .step-head');
  await p.evaluate(() => scrollTo(0, document.querySelector('#tools').getBoundingClientRect().top + scrollY - 20)); for (const i of [0, 3]) { await steps[i].click(); await p.waitForTimeout(2500); await shot('2-tour' + i); }
  for (const [n, sel] of [['3-uses', '#uses'], ['4-privacy', '#privacy'], ['6-close', '.close']]) { await p.evaluate((s) => scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - 40), sel); await p.waitForTimeout(2200); await shot(n); }
  await b.close();
})();
