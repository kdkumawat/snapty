// Full-desktop recorder (1600x1000 CSS px at 2x) for the films. Wraps lib.js and adds:
//  - a tidy view (screenshot sits to the right of the docked options panel)
//  - beat / key metadata that compose.js turns into captions, keycaps and camera moves
//  - JPEG q96 frames + a near-lossless intermediate for Hyperframes
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const L = require('./lib');
const VIDEO = path.join(__dirname, '..', 'video');
const FPS = 30;

exports.open = async (scene, { empty = false, dsf = 2 } = {}) => {
  const R = await L.open({ w: 1600, h: 1000, dsf, scene });
  const p = R.p;
  await R.goto();
  await p.addStyleTag({ content: '[aria-label="Recover a recent session"]{display:none!important}' });
  R.meta = { fps: FPS, w: 1600, h: 1000, beats: [], keys: [] };
  R.frame = async (repeat = 1) => { if (!R.dir) return; const buf = await p.screenshot({ type: 'jpeg', quality: 96 }); for (let i = 0; i < repeat; i++) fs.writeFileSync(path.join(R.dir, String(R.n++).padStart(5, '0') + '.jpg'), buf); };
  // Zoom out one step and pan so the image clears the options panel (x >= 300).
  R.tidy = async () => {
    await p.keyboard.press('Control+-'); await p.waitForTimeout(500); await R.readT();
    const dx = Math.round(302 - R.t.x), dy = Math.round(150 - R.t.y);
    await p.mouse.move(900, 930); await p.keyboard.down('Space'); await p.mouse.down(); await p.mouse.move(900 + dx, 930 + dy, { steps: 6 }); await p.mouse.up(); await p.keyboard.up('Space');
    await p.waitForTimeout(300); await R.readT(); await p.mouse.move(R.x, R.y);
  };
  if (!empty) { await R.paste(); await R.tidy(); }
  // Camera framing. null = the whole editor window; 'shot' = the screenshot with an even dot-grid margin;
  // [x0, y0, x1, y1] = a deliberate 16:10 rectangle in scene coordinates whose edges fall on whitespace.
  // Stored as a window-px rect {x, y, w, h}.
  R.rect = async (cam) => { if (!cam) return null; if (!Array.isArray(cam) && cam !== 'shot') return cam; await R.readT(); if (cam === 'shot') { const [x, y] = R.S(0, 0), [x1] = R.S(1440, 0); const w = x1 - x, h = w / 1.6; return { x: x - 32, y: y - 20, w: w + 64, h: h + 40 }; } const [x, y] = R.S(cam[0], cam[1]), [x1, y1] = R.S(cam[2], cam[3]); return { x, y, w: x1 - x, h: y1 - y }; };
  R.beat = async (label, keys = [], cam = null) => { R.meta.beats.push({ f: R.n, label, keys, cam: await R.rect(cam) }); };
  R.cam = async (cam) => { const last = R.meta.beats.at(-1); R.meta.beats.push({ f: R.n, label: last.label, keys: last.keys, cam: await R.rect(cam) }); };
  R.land = () => { const b = R.meta.beats.at(-1); (b.lands = b.lands || []).push(R.n); }; // the frame where the beat's action completes (arrowhead arrives, shape closes, badge pops, check appears); compose.js snaps it to a cue
  // zoom targets (16:10): window-px rect, or a scene-coordinate square-ish box (x, y, width in scene px)
  R.box = async (x, y, w) => { await R.readT(); const [a, b] = R.S(x, y), [c] = R.S(x + w, y); return { x: a, y: b, w: c - a, h: (c - a) / 1.6 }; };
  R.zoom = (rect) => { const last = R.meta.beats.at(-1); R.meta.beats.push({ f: R.n, label: last.label, keys: last.keys, cam: rect }); };
  R.jump = async (x, y) => { await p.mouse.move(x, y); await p.evaluate(([a, b]) => window.__cur(a, b), [x, y]); R.x = x; R.y = y; };   // cursor teleports (no frames): hide the cut under a camera dissolve
  R.jumpS = async (cx, cy) => { await R.readT(); await R.jump(...R.S(cx, cy)); };
  R.camPx = (label, keys) => R.meta.beats.push({ f: R.n, label, keys, cam: null });
  R.flash = (keys) => R.meta.keys.push({ f: R.n, keys });
  R.tool = async (k) => { const cur = await p.evaluate(() => document.querySelector('.toolbar-btn-active')?.getAttribute('aria-label')); if (k === 'a' && cur === 'Arrow') return; await R.key(k, 300); };
  R.tap = async (pt, after = 220) => { await R.toS(...pt); await R.hold(160); await R.click(after); };
  R.btn = async (name, o) => { await R.clickEl(p.getByRole('button', { name, exact: true }), o); };
  R.done = async ({ exportPng = false } = {}) => {
    const dir = path.join(VIDEO, R.name); fs.mkdirSync(dir, { recursive: true });
    R.meta.frames = R.n;
    if (exportPng) { await p.keyboard.press('Escape'); await p.keyboard.press('v'); await p.keyboard.press('Control+e'); await p.waitForTimeout(700); const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download/ }).last().click()]); await dl.saveAs(path.join(dir, 'result.png')); }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(R.meta, null, 1));
    fs.copyFileSync(path.join(R.dir, '00000.jpg'), path.join(dir, 'first.jpg'));
    fs.copyFileSync(path.join(R.dir, String(R.n - 1).padStart(5, '0') + '.jpg'), path.join(dir, 'last.jpg'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(R.dir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'fast', '-crf', '10', '-g', '30', '-pix_fmt', 'yuv420p', '-an', path.join(dir, 'footage.mp4')]);
    console.log(R.name, R.n, 'frames', (R.n / FPS).toFixed(1) + 's', R.meta.beats.map((b) => b.label + '@' + (b.f / FPS).toFixed(1)).join(', '));
    await R.b.close();
  };
  return R;
};
