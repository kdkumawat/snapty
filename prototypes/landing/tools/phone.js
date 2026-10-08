// node phone.js   phone film: the editor at 390x780 (touch), annotating a phone screenshot (scenes-src/phone-app.html -> scenes/phone.png).
// Output media/phone.mp4 (780x1560, 1:2: the page shows it without a caption band) + poster media/phone.webp.
const L = require('./lib');
(async () => {
  const R = await L.open({ w: 390, h: 780, dsf: 2, scene: 'phone', mobile: true }); const p = R.p;
  await R.goto(); R.start('phone');
  const S = (x, y) => { const f = R.iw / 390; return [R.t.x + R.t.k * f * x, R.t.y + R.t.k * f * y]; };   // scene (390x844 css) -> screen
  const toS = (x, y, o) => R.to(...S(x, y), o);
  R.x = 200; R.y = 560; await p.evaluate(() => window.__cur(200, 560));
  await R.hold(500);
  // 1 open an image
  const link = p.getByText('choose a file'); const bb = await link.boundingBox();
  await R.to(bb.x + bb.width / 2, bb.y + bb.height / 2, { ms: 500 }); await R.hold(150);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), (async () => { await p.mouse.down(); await R.frame(2); await p.mouse.up(); })()]);
  await fc.setFiles(L.PNG + '/phone.png');
  await p.waitForFunction(() => !!window.__snapty_stage && window.__snapty_stage.findOne('.annotation-layer'), null, { timeout: 15000 }); await p.waitForTimeout(1500); await R.readT();
  await R.to(200, 600, { ms: 300 }); await R.hold(500);
  // silent (no frames): make the Text tool "Very large" so the note stays readable at phone size
  await p.getByRole('button', { name: 'Text', exact: true }).click(); await p.getByRole('button', { name: 'Shape properties' }).click();
  await p.getByRole('button', { name: 'Very large' }).click(); await p.getByRole('button', { name: 'Shape properties' }).click();
  await p.getByRole('button', { name: 'Arrow', exact: true }).click(); await p.waitForTimeout(300);
  // 2 arrow onto the total, with a large note at its tail
  await toS(236, 668, { ms: 500 }); await R.hold(150); await R.down(); await toS(331, 581, { ms: 650, arc: 0.03 }); await R.hold(100); await R.up(); await R.hold(250);
  await R.clickEl(p.getByRole('button', { name: 'Text', exact: true }), { ms: 450 }); await R.hold(150);
  await toS(150, 694, { ms: 450 }); await R.hold(120); await R.click(250); await R.type('wrong?', 200); await R.key('Escape', 300);
  await toS(300, 720, { ms: 350 }); await R.hold(1000);
  // 3 number badges on the three items
  await R.clickEl(p.getByRole('button', { name: 'Number', exact: true }), { ms: 600 }); await R.hold(300);
  for (const y of [244, 317, 390]) { await toS(44, y, { ms: 300 }); await R.hold(80); await R.click(150); }
  await toS(300, 700, { ms: 350 }); await R.hold(700);
  const poster = R.n - 1;
  // 4 download
  await R.clickEl(p.getByRole('button', { name: 'Download' }).first(), { ms: 600 }); await R.hold(400);
  const dl = p.getByRole('button', { name: /Download/ }).last(); const [d] = await Promise.all([p.waitForEvent('download'), R.clickEl(dl, { ms: 600 })]);
  await R.hold(1000);
  await R.finish({ crf: 26, poster });
  process.exit(0);
})();
