// node apptest.js   behaviour checks on the real app landing: paste hand-off, CTA, theme button cycle, tool key selects a film.
const path = require('path'), fs = require('fs'); const { chromium, exe, PNG } = require('./lib');
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3001/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  // theme button: System -> Dark -> Light -> System
  const seq = [];
  for (let i = 0; i < 4; i++) { seq.push(await p.evaluate(() => { const t = document.querySelector('#theme'); return t.dataset.choice + '/' + (document.documentElement.classList.contains('dark') ? 'dark' : 'light') + ' "' + t.getAttribute('aria-label') + '"'; })); await p.click('#theme'); await p.waitForTimeout(400); }
  console.log('theme cycle:', seq.join(' -> '));
  // tool key selects its film
  await p.keyboard.press('u'); await p.waitForTimeout(800);
  console.log('after pressing U, active step:', await p.evaluate(() => document.querySelector('.step.is-on .step-title')?.textContent));
  // paste hand-off
  const b64 = fs.readFileSync(path.join(PNG, 'settings.png')).toString('base64');
  await p.evaluate((b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'shot.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, b64);
  await p.waitForURL('**/editor', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(2500);
  console.log('after paste: url', p.url(), '| image in editor:', await p.evaluate(() => { const s = window.__snapty_stage; const im = s && s.find('Image')[0]; return im ? im.width() + 'x' + im.height() : 'none'; }));
  // CTA
  await p.goto('http://localhost:3001/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
  await p.click('.hero .btn'); await p.waitForURL('**/editor', { timeout: 15000 }).catch(() => {});
  console.log('after "Open the editor": url', p.url());
  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
  await b.close();
})();
