// node examples.js   before/after use-case images.
// Both come out of the editor's own PNG export at 1x of a 2880x1800 source and are encoded once, identically,
// so the annotated image is exactly as sharp as the original.
const L = require('./lib'); const path = require('path'), fs = require('fs');
const sharp = require('D:/src/github.com/kdkumawat/snapty/node_modules/sharp');
const media = path.join(__dirname, '..', 'media'), tmp = path.join(__dirname, 'frames', 'ex'); fs.mkdirSync(tmp, { recursive: true });
const btn = (R, name) => R.clickEl(R.p.getByRole('button', { name, exact: true }));
const props = (R) => R.clickEl(R.p.locator('[aria-label="Shape properties"]'));
const tool = async (R, k) => { const cur = await R.p.evaluate(() => document.querySelector('.toolbar-btn-active')?.getAttribute('aria-label')); if (!(k === 'a' && cur === 'Arrow')) await R.key(k); };
const text = async (R, pt, s) => { await tool(R, 't'); await R.toS(...pt); await R.click(); await R.type(s); await R.key('Escape'); };
const callout = async (R, a, b, s) => { await tool(R, 'u'); await R.drag(a, b); await R.type(s); await R.key('Escape'); };
const exportPng = async (R, file) => {
  const p = R.p; await R.key('Escape'); await R.key('v'); await R.key('Control+e', 600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download/ }).last().click()]);
  await dl.saveAs(file); await p.keyboard.press('Escape');
};
const scenes = {
  bug: ['dash', async (R) => {
    await tool(R, 'm'); await R.drag([274, 108], [452, 160]); await R.key('Escape');
    await tool(R, 'r'); await R.drag([1296, 672], [1404, 714]);
    await callout(R, [1350, 740], [1150, 806], 'Orders add up to $1,284');
    await callout(R, [600, 448], [560, 524], 'Shows $12,840');
  }],
  tut: ['settings', async (R) => {
    const N = async (pt) => { await tool(R, 'n'); await R.toS(...pt); await R.click(); };
    await N([385, 217]);
    await N([1090, 227]); await text(R, [805, 224], 'Link your workspace');
    await N([815, 335]); await text(R, [840, 332], 'Pick a channel');
    await N([1195, 430]); await text(R, [985, 430], 'Turn on alerts');
    await N([1232, 712]); await text(R, [1120, 710], 'Save it');
  }],
  red: ['account', async (R) => {
    await tool(R, 'b'); await btn(R, 'Pixelate');
    await R.drag([472, 297], [672, 327]); await R.drag([474, 481], [810, 521]); await R.drag([548, 750], [708, 776]);
    await callout(R, [814, 500], [1010, 452], 'Hidden before sharing');
  }],
  des: ['shop', async (R) => {
    await text(R, [982, 262], 'Clear sale price'); await text(R, [972, 304], 'Too faint to read'); await text(R, [814, 708], 'White on pale green fails contrast');
    await tool(R, 'n');
    await btn(R, 'Stamp ✅'); await R.toS(950, 276); await R.click();
    await btn(R, 'Stamp ❌'); await R.toS(942, 318); await R.click(); await R.toS(772, 722); await R.click();
    await btn(R, 'Stamp 👉'); await R.toS(722, 612); await R.click();

    await tool(R, 'k'); await R.drag([752, 277], [846, 277]);
    await tool(R, 's'); await R.drag([700, 126], [1400, 776]);
  }],
};
(async () => {
  for (const [name, [scene, annotate]] of Object.entries(scenes)) {
    if (process.argv[2] && process.argv[2] !== name) continue;
    const R = await L.open({ w: 1800, h: 1100, dsf: 1, scene }); await R.goto(); await R.paste();
    const before = path.join(tmp, name + '-before.png'), after = path.join(tmp, name + '-after.png');
    await exportPng(R, before);
    await annotate(R);
    await R.p.screenshot({ path: path.join(tmp, name + '-editor.png') });
    await exportPng(R, after);
    for (const [src, kind] of [[before, 'before'], [after, 'after']]) {
      const md = await sharp(src).metadata(); const dst = path.join(media, `ex-${name}-${kind}.webp`);
      await sharp(src).webp({ quality: 92, smartSubsample: true, effort: 6 }).toFile(dst);
      console.log(`ex-${name}-${kind}.webp`, md.width + 'x' + md.height, (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
    }
    await R.b.close();
  }
})();
