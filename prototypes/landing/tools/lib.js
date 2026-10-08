// Frame-stepped recorder for the real Snapty editor (http://localhost:3001/editor).
// Every frame is a device-pixel screenshot, so clips are sharp and the cursor path is fully controlled.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const { chromium } = require('D:/src/github.com/kdkumawat/formaty/node_modules/playwright-core');
const d = path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1243');
const exe = fs.readdirSync(d).map((x) => path.join(d, x, 'chrome.exe')).find(fs.existsSync);
const SCN = 'C:/Users/kumaw/AppData/Local/Temp/claude-snapty-pw/scenes/';
const PNG = path.join(__dirname, 'scenes'); fs.mkdirSync(PNG, { recursive: true });
const FPS = 30;
exports.exe = exe; exports.chromium = chromium; exports.PNG = PNG;

exports.shootScenes = async () => {
  const b = await chromium.launch({ executablePath: exe });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  for (const n of ['dash', 'settings', 'account', 'shop']) { await p.goto(require('url').pathToFileURL(SCN + n + '.html').href); await p.waitForTimeout(400); await p.screenshot({ path: path.join(PNG, n + '.png') }); }
  await b.close();
};

const CURSOR = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M5 2.5v17l4.6-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6.3z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

const TOUCH = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" style="margin:-12px 0 0 -10px"><circle cx="15" cy="15" r="12" fill="rgba(20,20,20,.28)" stroke="rgba(255,255,255,.9)" stroke-width="2"/></svg>';
exports.open = async ({ w = 960, h = 600, dsf = 2, scene = 'dash', dark = false, mobile = false } = {}) => {
  const b = await chromium.launch({ executablePath: exe });
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true, hasTouch: mobile, isMobile: mobile });
  await c.addInitScript((t) => { try { if (!localStorage.getItem('theme')) localStorage.setItem('theme', t); } catch {} }, dark ? 'dark' : 'light');
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  const R = { b, c, p, w, h, x: w * 0.6, y: h * 0.75, dir: null, n: 0 };
  const chrome = async () => {
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important}#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;margin:-3px 0 0 -5px;will-change:transform}' });
    await p.evaluate((svg) => { const el = document.createElement('div'); el.id = '__cur'; el.innerHTML = svg; document.documentElement.appendChild(el); window.__cur = (x, y) => { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }; }, mobile ? TOUCH : CURSOR);
    await p.evaluate(([x, y]) => window.__cur(x, y), [R.x, R.y]);
  };
  R.chrome = chrome;
  R.goto = async () => { await p.goto('http://localhost:3001/editor', { waitUntil: 'load' }); await p.waitForTimeout(2500); const dc = p.getByRole('button', { name: 'Discard' }); if (await dc.count()) await dc.first().click().catch(() => {}); await chrome(); };
  R.readT = async () => { R.t = await p.evaluate(() => { const s = window.__snapty_stage; const r = s.container().getBoundingClientRect(); return { k: s.scaleX(), x: s.x() + r.left, y: s.y() + r.top }; }); R.iw = await p.evaluate(() => { const s = window.__snapty_stage; const im = s.find('Image')[0]; return im ? im.width() : 0; }); };
  R.paste = async (name = scene) => {
    const b64 = fs.readFileSync(path.join(PNG, name + '.png')).toString('base64');
    await p.evaluate((b64) => { const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'screenshot.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, b64);
    await p.waitForFunction(() => !!window.__snapty_stage && window.__snapty_stage.findOne('.annotation-layer'), null, { timeout: 15000 }); await p.waitForTimeout(1200);
    await R.readT();
  };
  // scene coords in the scenes' 1440x900 CSS layout -> screen
  R.S = (cx, cy) => { const f = (R.iw || 1440) / 1440; return [R.t.x + R.t.k * cx * f, R.t.y + R.t.k * cy * f]; };
  R.start = (name) => { R.name = name; R.dir = path.join(__dirname, 'frames', name); fs.rmSync(R.dir, { recursive: true, force: true }); fs.mkdirSync(R.dir, { recursive: true }); R.n = 0; };
  R.frame = async (repeat = 1) => { if (!R.dir) return; const buf = await p.screenshot({ type: 'png' }); for (let i = 0; i < repeat; i++) fs.writeFileSync(path.join(R.dir, String(R.n++).padStart(5, '0') + '.png'), buf); };
  R.hold = async (ms = 400) => { await p.waitForTimeout(Math.min(ms, 350)); await R.frame(Math.max(1, Math.round(ms / 1000 * FPS))); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // eased, slightly arced path; captures a frame per step
  R.to = async (x, y, { ms, arc = 0.12 } = {}) => {
    const x0 = R.x, y0 = R.y, dx = x - x0, dy = y - y0, dist = Math.hypot(dx, dy);
    if (ms == null) ms = Math.min(850, 240 + dist * 1.0);
    const n = Math.max(2, Math.round(ms / 1000 * FPS));
    const mx = (x0 + x) / 2 - dy * arc, my = (y0 + y) / 2 + dx * arc;
    for (let i = 1; i <= n; i++) { const t = ease(i / n); const u = 1 - t; const px = u * u * x0 + 2 * u * t * mx + t * t * x; const py = u * u * y0 + 2 * u * t * my + t * t * y; await p.mouse.move(px, py); await p.evaluate(([a, b2]) => window.__cur(a, b2), [px, py]); R.x = px; R.y = py; await R.frame(); }
  };
  R.toS = async (cx, cy, o) => { await R.readT(); return R.to(...R.S(cx, cy), o); }; // re-read the stage transform: the view refits when panels open
  R.down = async () => { await p.mouse.down(); await R.frame(); };
  R.up = async () => { await p.mouse.up(); await p.waitForTimeout(120); await R.frame(2); };
  R.click = async (after = 250) => { await p.mouse.down(); await R.frame(2); await p.mouse.up(); await p.waitForTimeout(150); await R.hold(after); };
  R.dbl = async (after = 300) => { await p.mouse.dblclick(R.x, R.y); await p.waitForTimeout(200); await R.hold(after); };
  R.drag = async (a, b2, o = {}) => { await R.toS(...a); await R.hold(120); await R.down(); await R.toS(...b2, { arc: 0.03, ms: 700, ...o }); await R.hold(100); await R.up(); await R.hold(o.after ?? 300); };
  R.path = async (pts, msPer = 220) => { await R.toS(...pts[0]); await R.down(); for (const q of pts.slice(1)) await R.toS(...q, { ms: msPer, arc: 0.18 }); await R.up(); await R.hold(250); };
  R.key = async (k, after = 300) => { await p.keyboard.press(k); await p.waitForTimeout(150); await R.hold(after); };
  R.type = async (s, after = 300) => { for (const ch of s) { await p.keyboard.type(ch); await R.frame(ch === ' ' ? 1 : 2); } await R.hold(after); };
  R.clickAt = async (x, y, o) => { await R.to(x, y, o); await R.hold(120); await R.click(); };
  R.clickEl = async (loc, o) => { const bb = await loc.first().boundingBox(); await R.clickAt(bb.x + bb.width / 2, bb.y + bb.height / 2, o); };
  R.finish = async ({ crf = 27, scale = null, poster = 'last' } = {}) => {
    const out = path.join(__dirname, '..', 'media', R.name + '.mp4');
    const vf = (scale ? 'scale=' + scale + ':flags=lanczos,' : '') + 'format=yuv420p';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(R.dir, '%05d.png'), '-vf', vf, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-tune', 'animation', '-movflags', '+faststart', '-an', out]);
    const pf = poster === 'first' ? 0 : poster === 'last' ? R.n - 1 : poster;
    const sharp = require('D:/src/github.com/kdkumawat/snapty/node_modules/sharp');
    await sharp(path.join(R.dir, String(pf).padStart(5, '0') + '.png')).webp({ quality: 82 }).toFile(out.replace('.mp4', '.webp'));
    console.log(R.name, R.n, 'frames', (R.n / FPS).toFixed(1) + 's', (fs.statSync(out).size / 1024).toFixed(0) + 'KB', 'poster', (fs.statSync(out.replace('.mp4', '.webp')).size / 1024).toFixed(0) + 'KB');
    await b.close();
  };
  return R;
};
