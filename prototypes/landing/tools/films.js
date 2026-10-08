// node films.js <name...>   raw footage for each film, recorded in the real editor at 1600x1000 @2x.
// Scene coordinates are the scenes' own 1440x900 CSS layout, measured from the DOM (see README).
// Rules: one idea per clip; every mark points at a real target; new drawings start on empty space.
const { open } = require('./rec');
const F = {
  // Hero: one scene (a failing webhook) in four cells; each beat frames exactly one cell.
  async hero() {
    const Q1 = [40, 50, 720, 475], Q2 = [720, 50, 1400, 475], Q3 = [40, 475, 720, 900], Q4 = [720, 475, 1400, 900];
    const R = await open('webhooks', { empty: true, dsf: 3 }); const p = R.p;
    R.x = 800; R.y = 640; await p.evaluate(() => window.__cur(800, 640));
    R.start('hero'); R.camPx('', []); await R.hold(400);
    R.camPx('Paste a screenshot', ['Ctrl', 'V']); await R.hold(500);
    await R.paste(); await R.tidy(); R.land(); await R.hold(500);
    // 1 arrow, label past its tail: the 500 in the deliveries table
    await R.beat('Arrow, with a label', ['A'], Q3); await R.hold(150);
    await R.drag([262, 826], [336, 713], { ms: 550, after: 150 }); R.land();
    await R.toS(299, 770, { ms: 250 }); await R.hold(80); await R.dbl(120); await R.type('failing', 150); await R.key('Enter', 200);
    await R.toS(430, 810, { ms: 300 }); await R.hold(500);
    // 2 rectangle: the response
    await R.beat('Rectangle', ['R'], Q4); await R.tool('r'); await R.hold(200);
    await R.drag([752, 541], [1368, 759], { ms: 650, after: 600 , land: true });
    // 3 number badges: the three setup steps
    await R.beat('Number badges', ['N'], Q2); await R.tool('n'); await R.hold(200);
    for (const y of [159, 223, 287]) { await R.toS(798, y, { ms: 260 }); await R.hold(80); R.land(); await R.click(100); }
    await R.toS(1000, 380, { ms: 250 }); await R.hold(500);
    // 4 blur: the signing secret (default strength)
    await R.beat('Blur', ['B'], null); await R.tool('b'); await R.hold(300);
    await R.cam(Q1); await R.toS(224, 184, { ms: 600 }); await R.hold(100);
    await R.drag([224, 184], [532, 216], { ms: 600, after: 600 , land: true });
    // 5 highlighter: the retry policy, same cell
    await R.beat('Highlighter', ['K'], Q1); await R.tool('k');
    await R.drag([224, 307], [413, 307], { ms: 600, after: 600 , land: true });
    // 6 callout: press the Retry button
    await R.beat('Callout', ['U'], Q3); await R.tool('u'); await R.hold(200);
    await R.drag([643, 708], [540, 810], { ms: 600 }); await R.type('Does nothing', 100); await R.key('Enter', 200); R.land();
    await R.toS(640, 860, { ms: 250 }); await R.hold(600);
    // copy
    R.camPx('Copy to clipboard', ['Ctrl', 'C']); await R.hold(300);
    const cp = p.locator('[aria-label="Copy image"]'); const bb = await cp.boundingBox(); 
    await R.to(bb.x + bb.width / 2, bb.y + bb.height / 2, { ms: 600 }); await R.hold(120);
    await p.mouse.down(); await R.frame(2); await p.mouse.up();
    await cp.locator('span.col-start-1:first-child.opacity-0').first().waitFor({ timeout: 6000 }); await p.waitForTimeout(230);   // copy finished: wait for the cross-fade to settle
    await p.mouse.move(R.x - 110, R.y + 130); R.x -= 110; R.y += 130; await p.evaluate(([a, b]) => window.__cur(a, b), [R.x, R.y]);
    R.land(); await R.frame(45);                                    // the check lasts 1.2 s of real time, so freeze its frame for 1.5 s of film
    await R.hold(300);
    await R.done({ exportPng: true });
  },

  async arrow() {
    const R = await open('dash');
    R.start('arrow'); await R.hold(500); await R.beat('Arrow, with a label', ['A'], 'shot'); await R.hold(400);
    // label sits past the arrow's tail; each arrowhead lands on its subject
    await R.drag([560, 296], [814, 350], { ms: 700 });                       // the Sunday spike
    await R.toS(687, 323, { ms: 300 }); await R.hold(150); await R.dbl(200); await R.type('spike?', 150); await R.key('Enter', 300);
    await R.toS(1000, 800, { ms: 500 }); await R.hold(300);
    await R.drag([1250, 826], [1352, 714], { ms: 700 });                      // the total
    await R.toS(1301, 770, { ms: 300 }); await R.hold(150); await R.dbl(200); await R.type('only 9', 150); await R.key('Enter', 300);
    await R.toS(980, 820, { ms: 450 }); await R.hold(1500);
    await R.done();
  },

  async shapes() {
    const R = await open('dash');
    R.start('shapes'); await R.beat('Ellipse', ['O'], [700, 130, 1.6]); await R.tool('o');
    await R.drag([556, 108], [640, 164], { ms: 650, after: 450 });
    await R.beat('Freehand', ['P'], [800, 400, 1.6]); await R.tool('p');
    await R.path([[832, 322], [866, 338], [872, 372], [842, 394], [806, 382], [796, 346], [822, 322], [848, 326]], 150);
    await R.beat('Line', ['L'], [1150, 660, 1.6]); await R.tool('l');
    await R.drag([1318, 708], [1388, 708], { ms: 450, after: 300 });
    await R.toS(1180, 760, { ms: 450 }); await R.hold(1300);
    await R.done();
  },

  async badges() {
    const R = await open('settings'); const p = R.p;
    R.start('badges'); await R.hold(500); await R.beat('Number badges', ['N'], null); await R.tool('n'); await R.hold(300);
    await R.tap([1096, 228]); await R.tap([816, 335]);                                   // Connect Slack, the channel select
    await R.beat('Press N again: letters', ['N'], null); await R.toS(1200, 700, { ms: 400 }); await R.key('n', 700);   // chip at the cursor
    await R.tap([1290, 429]); await R.tap([1290, 493]); await R.tap([1290, 557]);       // the three toggles
    await R.beat('Pointing finger', ['N'], null);
    await R.clickEl(p.getByLabel(/right finger/), { ms: 600 }); await R.hold(300);
    await R.tap([1160, 652], 400);                                                       // fingertip touches Save changes
    await R.toS(900, 780, { ms: 450 }); await R.hold(1400);
    await R.done();
  },

  async callout() {
    const R = await open('shop');
    R.start('callout'); await R.beat('Callout', ['U'], 'shot'); await R.tool('u'); await R.hold(500);
    await R.drag([1034, 637], [1190, 758], { ms: 850 }); await R.type('White on pale green fails contrast'); await R.key('Enter', 400);
    await R.toS(1330, 840, { ms: 450 }); await R.hold(1500);
    await R.done();
  },

  async pixelate() {
    const R = await open('account');
    R.start('pixelate'); await R.beat('Pixelate', ['B'], [560, 400, 1.2]); await R.tool('b');
    await R.btn('Pixelate', { ms: 600 }); await R.hold(250);
    await R.drag([484, 487], [800, 515], { ms: 750, after: 500 });
    await R.drag([470, 294], [672, 326], { ms: 650, after: 400 });
    await R.toS(900, 620, { ms: 450 }); await R.hold(1500);
    await R.done();
  },

  async spotlight() {
    const R = await open('shop');
    R.start('spotlight'); await R.beat('Spotlight', ['S'], null); await R.hold(250); await R.tool('s');
    await R.drag([736, 118], [1400, 700], { ms: 950, after: 500 });
    await R.toS(500, 800, { ms: 500 }); await R.hold(1600);
    await R.done();
  },

  async magnifier() {
    const R = await open('dash');
    R.start('magnifier'); await R.hold(500); await R.beat('Magnifier', ['M'], 'shot'); await R.tool('m'); await R.hold(300);
    await R.drag([1150, 120], [1310, 166], { ms: 750, after: 700 });   // subject on the right; the lens appears once, lower left, and stays
    await R.toS(900, 760, { ms: 500 }); await R.hold(1700);
    await R.done();
  },

  async highlighter() {
    const R = await open('shop');
    R.start('highlighter'); await R.beat('Highlighter', ['K'], [960, 330, 1.7]); await R.tool('k');
    await R.drag([752, 308], [916, 308], { ms: 650, after: 350 });
    await R.drag([752, 351], [1118, 351], { ms: 850, after: 400 });
    await R.toS(1180, 450, { ms: 450 }); await R.hold(1400);
    await R.done();
  },

  async exportclip() {
    const R = await open('dash'); const p = R.p;
    await R.tool('m'); await R.drag([280, 152], [418, 182]); await R.key('Escape');
    R.start('export'); await R.beat('Crop', ['C'], null); await R.hold(250); await R.tool('c');
    await R.drag([250, 60], [900, 640], { ms: 900, after: 800 });
    R.camPx('Export', ['Ctrl', 'E'], [1240, 330, 1.45]); R.flash(['Ctrl', 'E']); await R.key('Control+e', 700);
    await R.clickEl(p.getByText('WebP', { exact: true }), { ms: 600 }); await R.hold(250);
    await R.clickEl(p.getByText('2x', { exact: true }), { ms: 450 }); await R.hold(300);
    await R.clickEl(p.getByRole('button', { name: 'Copy', exact: true }).last(), { ms: 550 }); await p.waitForTimeout(2500); await R.hold(1800);
    await R.done();
  },

  async keyboard() {
    const R = await open('settings'); const p = R.p;
    R.start('keyboard'); R.camPx('Command palette', ['Ctrl', 'K'], null); await R.hold(300);
    R.flash(['Ctrl', 'K']); await R.key('Control+k', 700); await R.type('call', 500); await R.key('Enter', 900);
    R.camPx('All shortcuts', ['?'], null); R.flash(['?']); await R.key('?', 900);
    await R.type('undo', 1700);
    await R.done();
  },

  async flow() {
    const R = await open('dash');
    R.start('flow'); await R.beat('The tool stays selected', ['A'], [1180, 420, 1.5]); await R.hold(300);
    for (const y of [414, 453, 492]) await R.drag([1250, y + 14], [1330, y], { ms: 420, after: 160 });
    await R.hold(300);
    R.meta.beats.push({ f: R.n, label: 'Undo, redo', keys: ['Ctrl', 'Z'], cam: R.meta.beats.at(-1).cam });
    for (let i = 0; i < 2; i++) { R.flash(['Ctrl', 'Z']); await R.key('Control+z', 320); }
    for (let i = 0; i < 2; i++) { R.flash(['Ctrl', 'Shift', 'Z']); await R.key('Control+Shift+z', 320); }
    R.camPx('Dark mode', ['Alt', 'Shift', 'D'], null); R.flash(['Alt', 'Shift', 'D']); await R.key('Alt+Shift+D', 1900);
    await R.done();
  },
};
(async () => { for (const n of process.argv.slice(2)) { try { await F[n](); } catch (e) { console.log('FAIL', n, String(e.stack || e).slice(0, 500)); } } process.exit(0); })();
