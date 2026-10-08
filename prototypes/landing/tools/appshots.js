// node appshots.js [landing|editor|all]   screenshots of the real app (http://localhost:3001) into ../review/app-*.png
const path = require('path'); const { chromium, exe, PNG } = require('./lib');
const out = (n) => path.join(__dirname, '..', 'review', 'app-' + n + '.png');
const what = process.argv[2] || 'all';
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
    const p = await ctx.newPage(); const tag = `${w}-${theme}`;
    p.on('pageerror', (e) => console.log(tag, 'pageerror', e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log(tag, 'console.error', m.text().slice(0, 160)); });
    const hide = () => p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    if (what !== 'editor') {
      await p.goto('http://localhost:3001/', { waitUntil: 'load' }); await p.waitForTimeout(2500); await hide();
      const m = await p.evaluate(() => { const lp = document.querySelector('.lp'); return { H: lp.scrollHeight, sw: lp.scrollWidth, cw: lp.clientWidth }; });
      console.log(tag, 'landing height', m.H, m.sw > m.cw ? 'OVERFLOW ' + m.sw : 'no h-scroll');
      await p.screenshot({ path: out(`landing-${tag}-1`) });
      for (const [n, sel] of [['2-tools', '#tools'], ['3-uses', '#uses'], ['4-privacy', '#privacy'], ['5-keys', '#keys']]) { if (w === 390 && n !== '2-tools') continue; await p.evaluate((s) => { const lp = document.querySelector('.lp'); lp.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + lp.scrollTop - 50); }, sel); await p.waitForTimeout(2200); await p.screenshot({ path: out(`landing-${tag}-${n}`) }); }
      for (const u of ['guide', 'privacy']) { if (w === 390) continue; await p.goto('http://localhost:3001/' + u, { waitUntil: 'load' }); await p.waitForTimeout(1500); await hide(); await p.screenshot({ path: out(`${u}-${tag}`) }); }
    }
    if (what !== 'landing') {
      await p.goto('http://localhost:3001/editor', { waitUntil: 'load' }); await p.waitForTimeout(2500); await hide();
      await p.screenshot({ path: out(`editor-${tag}-1-empty`) });
      await p.locator('input[type=file]').first().setInputFiles(path.join(PNG, 'webhooks.png')); await p.waitForTimeout(2500);
      await p.keyboard.press('n'); await p.waitForTimeout(400);
      const sp = p.locator('[aria-label="Shape properties"]'); if (await sp.count()) { await sp.first().click(); await p.waitForTimeout(400); }
      await p.screenshot({ path: out(`editor-${tag}-2-tool`) });
      if (await sp.count()) await sp.first().click();
      await p.keyboard.press('Escape'); await p.mouse.click(700, 860); await p.keyboard.press('Control+e'); await p.waitForTimeout(900); await p.screenshot({ path: out(`editor-${tag}-3-download`) }); await p.keyboard.press('Escape');
      await p.keyboard.press('Control+k'); await p.waitForTimeout(900); await p.screenshot({ path: out(`editor-${tag}-4-palette`) }); await p.keyboard.press('Escape');
      await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(900); await p.screenshot({ path: out(`editor-${tag}-5-shortcuts`) }); await p.keyboard.press('Escape');
      await p.locator('[aria-label="Main menu"]').first().click(); await p.waitForTimeout(400); await p.screenshot({ path: out(`editor-${tag}-6-menu`) });
    }
    await ctx.close();
  }
  await b.close();
})();
