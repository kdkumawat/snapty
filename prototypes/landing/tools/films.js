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
    R.start('hero'); R.camPx('', []); await R.hold(600);
    R.camPx('Paste a screenshot', ['Ctrl', 'V']); await R.hold(900);
    await R.paste(); await R.tidy(); await R.hold(1000);
    // 1 arrow + label: the 500 in the deliveries table
    await R.beat('Arrow', ['A'], Q3); await R.hold(700);
    await R.drag([130, 846], [338, 718], { ms: 750 });
    await R.toS(234, 782, { ms: 320 }); await R.hold(150); await R.dbl(200); await R.type('failing'); await R.key('Enter', 300);
    await R.toS(420, 800, { ms: 350 }); await R.hold(500);
    // 2 rectangle: the response
    await R.beat('Rectangle', ['R'], Q4); await R.tool('r'); await R.hold(500);
    await R.drag([752, 541], [1368, 759], { ms: 850, after: 800 });
    // 3 number badges: the three setup steps
    await R.beat('Number badges', ['N'], Q2); await R.tool('n'); await R.hold(500);
    for (const y of [159, 223, 287]) await R.tap([798, y], 220);
    await R.toS(1000, 380, { ms: 350 }); await R.hold(600);
    // 4 pixelate: the signing secret (mode is picked in the options panel, so the whole window is shown)
    await R.beat('Pixelate', ['B'], null); await R.tool('b'); await R.hold(500);
    await R.btn('Pixelate', { ms: 650 }); await R.hold(350);
    await R.cam(Q1); await R.toS(224, 184, { ms: 800 }); await R.hold(250);
    await R.drag([224, 184], [532, 216], { ms: 750, after: 900 });
    // 5 highlighter: the retry policy, same cell
    await R.beat('Highlighter', ['K'], Q1); await R.tool('k');
    await R.drag([224, 307], [413, 307], { ms: 750, after: 800 });
    // 6 callout: press the Retry button, drag to where the note should sit
    await R.beat('Callout', ['U'], Q3); await R.tool('u'); await R.hold(600);
    await R.drag([643, 715], [520, 808], { ms: 800 }); await R.type('Retry does nothing'); await R.key('Enter', 300);
    await R.toS(600, 860, { ms: 350 }); await R.hold(700);
    // copy
    R.camPx('Copy to clipboard', ['Ctrl', 'C']); await R.hold(900);
    await R.clickEl(p.locator('[aria-label="Copy image"]'), { ms: 800 }); await p.waitForTimeout(1200); await R.hold(1600);
    await R.done({ exportPng: true });
  },

  async arrow() {
    const R = await open('dash');
    R.start('arrow'); await R.beat('Arrow, with a label', ['A'], [740, 400, 1.5]); await R.hold(300);
    await R.drag([560, 300], [818, 352], { ms: 700 });
    await R.toS(689, 326, { ms: 300 }); await R.hold(150); await R.dbl(200); await R.type('spike?'); await R.key('Enter', 300); await R.toS(700, 440, { ms: 350 }); await R.hold(300);
    await R.beat('Rectangle, with text inside', ['R'], [740, 480, 1.5]); await R.tool('r');
    await R.drag([520, 584], [884, 636], { ms: 650 });
    await R.toS(702, 610, { ms: 280 }); await R.hold(150); await R.dbl(200); await R.type('Sunday looks wrong'); await R.key('Enter', 400);
    await R.toS(980, 600, { ms: 450 }); await R.hold(1300);
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
    const R = await open('settings');
    R.start('badges'); await R.beat('Number badges', ['N'], null); await R.tool('n');
    await R.tap([1096, 228]); await R.tap([816, 335]); await R.tap([1232, 696]);
    await R.beat('Switch to letters', ['N'], null);
    await R.btn('Letters', { ms: 600 }); await R.hold(350);
    await R.tap([1316, 429]); await R.tap([1316, 493]); await R.tap([1316, 557]);
    await R.beat('Pointing badge', ['N'], null);
    await R.btn('Numbers with 👉', { ms: 600 }); await R.hold(300);
    await R.tap([382, 114]);
    await R.beat('Stamp', ['N'], null);
    await R.btn('Stamp ✅', { ms: 600 }); await R.hold(300);
    await R.tap([1318, 651]);
    await R.toS(900, 760, { ms: 450 }); await R.hold(1400);
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
    R.start('magnifier'); await R.beat('Magnifier', ['M'], [520, 300, 1.45]); await R.tool('m');
    await R.drag([280, 152], [418, 182], { ms: 750, after: 500 });
    await R.toS(900, 700, { ms: 500 }); await R.hold(1700);
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
