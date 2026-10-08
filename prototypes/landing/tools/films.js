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
    const b1 = await R.box(380, 220, 540), b2 = await R.box(1010, 620, 420);
    R.start('arrow'); await R.hold(500); await R.beat('Arrow, with a label', ['A'], b1); await R.hold(400);
    // the label sits at the arrow's tail; each arrowhead lands on its subject
    await R.drag([560, 296], [814, 350], { ms: 700 });                       // the Sunday spike
    await R.toS(687, 323, { ms: 300 }); await R.hold(150); await R.dbl(200); await R.type('spike?', 150); await R.key('Enter', 300);
    await R.hold(1000);
    R.zoom(b2); await R.jumpS(1180, 800); await R.hold(250);
    await R.drag([1250, 826], [1352, 714], { ms: 700 });                      // the total
    await R.toS(1301, 770, { ms: 300 }); await R.hold(150); await R.dbl(200); await R.type('only 9', 150); await R.key('Enter', 300);
    await R.toS(1180, 840, { ms: 450 }); await R.hold(1300);
    await R.done();
  },

  async shapes() {
    const R = await open('dash');
    const bx = await R.box(900, 560, 540);
    R.start('shapes'); await R.hold(500); await R.beat('Rectangle, with text inside', ['R'], bx); await R.jumpS(1150, 760); await R.tool('r'); await R.hold(300);
    await R.drag([1010, 800], [1340, 868], { ms: 700, after: 300 });          // a note box in the empty space under the table
    await R.toS(1175, 834, { ms: 300 }); await R.hold(150); await R.dbl(250);
    await R.type('Check this amount', 200); await R.key('Enter', 700);
    await R.beat('Arrow, from the box', ['A'], bx); await R.tool('a'); await R.hold(300);
    await R.drag([1290, 779], [1345, 714], { ms: 600, after: 300 });          // tail just above the box, head on the total
    await R.toS(1130, 650, { ms: 450 }); await R.hold(1700);
    await R.done();
  },

  async badges() {
    const R = await open('settings'); const p = R.p;
    const PANEL = { x: 0, y: 140, w: 320, h: 200 };                       // the options panel, close up
    const boxA = await R.box(1000, 120, 380), boxB = await R.box(390, 240, 620), boxT = await R.box(940, 345, 380), boxS = await R.box(1000, 560, 400);
    await R.jumpS(1040, 300);
    R.start('badges'); await R.hold(500); await R.beat('Number badges', ['N'], boxA); await R.tool('n'); await R.hold(250);
    await R.tap([1096, 228], 700);                                       // Connect Slack
    R.zoom(boxB); await R.jumpS(900, 420); await R.tap([816, 335], 500); // the channel select
    await R.beat('Press N again: letters', ['N'], boxB); await R.key('n', 900);   // chip at the cursor
    R.zoom(PANEL); await R.hold(900);                                    // the style switch, close up
    R.zoom(boxT); await R.jumpS(1180, 380); await R.tap([1290, 430], 350); await R.tap([1290, 494], 700);
    await R.beat('Pointing finger', ['N'], PANEL); await R.jump(150, 300); await R.hold(250);
    await R.clickEl(p.getByLabel(/up finger/), { ms: 350 }); await R.hold(500);
    R.zoom(boxS); await R.jumpS(1100, 780); await R.tap([1233, 678], 900);   // fingertip touches Save changes from below
    await R.beat('Stamps', ['N'], PANEL); await R.jump(150, 300); await R.hold(250);
    await R.clickEl(p.getByLabel('Stamp ❌'), { ms: 350 }); await R.hold(500);
    R.zoom(boxT); await R.jumpS(1180, 620); await R.tap([1290, 557], 1200);   // the switch that is off
    await R.hold(300);
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
    // subject: the small "3 vs yesterday" line under Orders. The ring is the drag's box, so it is centred on the stat; the bubble lands lower left on the empty chart area.
    const box = await R.box(240, 70, 560);
    R.start('magnifier'); await R.hold(500); await R.beat('Magnifier', ['M'], box); await R.tool('m'); await R.hold(300);
    await R.drag([564, 146], [690, 192], { ms: 700, after: 1800 });
    await R.toS(560, 600, { ms: 450 }); await R.hold(700);
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
    // 16:10 camera rect around a dialog (window px), padded
    const around = async (pad = 70, minW = 0) => { const bb = await p.locator('[role="dialog"]').first().boundingBox(); const w = Math.max(minW, bb.width + 2 * pad, (bb.height + 2 * pad) * 1.6), cx = bb.x + bb.width / 2, top = Math.max(0, bb.y - pad);
      return { x: Math.max(0, Math.min(1600 - w, cx - w / 2)), y: top, w, h: w / 1.6 }; };
    const top = async (w) => { const bb = await p.locator('[role="dialog"]').first().boundingBox(); return { x: Math.max(0, bb.x + bb.width / 2 - w / 2), y: Math.max(0, bb.y - 40), w, h: w / 1.6 }; };   // the dialog's upper part
    R.start('keyboard'); await R.hold(500);
    await p.keyboard.press('Control+k'); await p.waitForTimeout(500); await R.beat('Command palette', ['Ctrl', 'K'], await top(520)); R.flash(['Ctrl', 'K']); await R.hold(600);
    await R.type('call', 900); await R.key('Enter', 700);
    await p.keyboard.press('?'); await p.waitForTimeout(500); await R.beat('All shortcuts', ['?'], await top(860)); R.flash(['?']); await R.hold(1200);
    await R.type('undo', 400); R.zoom(await around(60, 620)); await R.hold(1700);
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
