// Measures what the editor sends over the network while a screenshot is pasted, annotated, blurred and exported.
// node netcheck.js  -> prints a JSON summary used by the landing page's privacy section.
const L = require('./lib');
(async () => {
  const R = await L.open({ scene: 'account' }); const p = R.p; const log = []; let phase = 'load';
  p.on('request', (r) => { const u = new URL(r.url()); log.push({ phase, method: r.method(), host: u.host, path: u.pathname.slice(0, 70), type: r.resourceType(), body: (r.postDataBuffer() || Buffer.alloc(0)).length }); });
  p.on('websocket', (ws) => log.push({ phase, method: 'WS', host: new URL(ws.url()).host, path: new URL(ws.url()).pathname, type: 'websocket', body: 0 }));
  await R.goto(); await p.waitForTimeout(1500);
  phase = 'work';
  await R.paste();
  await R.key('b'); await R.drag([472, 297], [672, 327]);
  await R.key('u'); await R.drag([814, 500], [1010, 452]); await R.type('Hidden before sharing'); await R.key('Escape');
  await R.key('n'); await R.toS(900, 200); await R.click();
  await R.clickEl(p.locator('[aria-label="Copy image"]')); await p.waitForTimeout(800);
  await R.key('Control+e', 600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download/ }).last().click()]);
  await p.waitForTimeout(6000); // autosave window
  const work = log.filter((r) => r.phase === 'work');
  const sum = { load: log.filter((r) => r.phase === 'load').length, work: work.length, workOffOrigin: work.filter((r) => r.host !== 'localhost:3001'), workWithBody: work.filter((r) => r.body > 0), workList: work.map((r) => r.method + ' ' + r.host + r.path + ' [' + r.type + '] body=' + r.body), exported: dl.suggestedFilename() };
  console.log(JSON.stringify(sum, null, 1));
  await R.b.close();
})();
