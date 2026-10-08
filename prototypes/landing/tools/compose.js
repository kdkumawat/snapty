// node compose.js <name...>   builds a Hyperframes composition for each film from its footage + meta, renders it,
// then encodes the delivery files into ../media: <name>.mp4 (H.264), <name>.webm (VP9), <name>.webp (poster).
//
// Film layout, 1920x1280 (3:2), identical for every film so it fills its container with no letterbox:
//   stage 1920x1200  the editor footage inside a GSAP camera
//   band  1920x80    reserved caption strip: brand, then tool name + shortcut. Its right end stays empty
//                    for the page's pause button.
// Captions live only in the band, so they can never cover the action.
// Camera framing rules: either the whole editor window, or a deliberate 16:10 rectangle from meta.json
// ("the screenshot plus an even margin", or one cell of the hero scene) whose edges fall on whitespace.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), VIDEO = path.join(ROOT, 'video'), MEDIA = path.join(ROOT, 'media');
const W = 1920, SH = 1200, BAND = 80, H = SH + BAND, K = W / 1600; // footage is 1600x1000 CSS px
const SOLID = '#b93300';
const FULL_ONLY = new Set(['badges', 'pixelate', 'export', 'keyboard']);   // options panel / dialogs must stay in frame
const LEGACY_SHOT = { x: 270, y: 130, w: 1180, h: 737.5 };                   // footage recorded before rect cams
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const kbd = (keys) => keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('');
const SCISSORS = 'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z';
const svg = `<svg viewBox="0 0 24 24"><path d="${SCISSORS}"/></svg>`;

const CSS = `
@font-face{font-family:Assistant;src:url(Assistant-Variable.woff2) format("woff2");font-weight:200 800}
@font-face{font-family:Bricolage;src:url(BricolageGrotesque-Variable.woff2) format("woff2");font-weight:200 800}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#17171a;font-family:Assistant,system-ui,sans-serif}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#17171a}
#stage{position:absolute;left:0;top:0;width:${W}px;height:${SH}px;overflow:hidden;background:#fff}
#cam,#cam1{position:absolute;left:0;top:0;width:${W}px;height:${SH}px;transform-origin:0 0}
#cam1{opacity:0}
#foot,#foot1,#loop{position:absolute;left:0;top:0;width:${W}px;height:${SH}px;object-fit:fill}
#loop{opacity:0}
#band{position:absolute;left:0;top:${SH}px;width:${W}px;height:${BAND}px;background:#17171a}
#brand{position:absolute;left:36px;top:${SH + 18}px;display:flex;align-items:center;gap:12px;color:#fff;font:800 32px/44px Assistant,sans-serif;letter-spacing:-.02em}
#brand i{display:grid;place-items:center;width:44px;height:44px;border-radius:11px;background:${SOLID}}
#brand svg{width:28px;height:28px;fill:#fff}
.cap{position:absolute;left:272px;top:${SH + 14}px;padding-left:28px;border-left:2px solid #4a4a50;height:52px;display:flex;align-items:center;gap:18px;color:#fff;font:700 34px/52px Assistant,sans-serif;letter-spacing:-.01em;opacity:0;white-space:nowrap}
.cap kbd{display:inline-grid;place-items:center;min-width:46px;height:46px;padding:0 14px;margin-right:8px;font:700 25px/1 Assistant,sans-serif;color:#17171a;background:#fff;border-radius:10px;box-shadow:inset 0 -4px 0 #cfcfcb}
.full{position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:${SOLID};color:#fff}
#sting .lock{position:absolute;left:0;right:0;top:450px;display:flex;justify-content:center;align-items:center;gap:44px}
#sting svg{width:230px;height:230px;fill:#fff}
#sting .word{font:800 230px/1 Assistant,sans-serif;letter-spacing:-.045em}
#sting .tag{position:absolute;left:0;right:0;top:750px;text-align:center;font:600 52px/1.2 Assistant,sans-serif}
#end{opacity:0}
#end .shot{position:absolute;left:96px;top:290px;width:1090px;height:681px;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 50px 110px -30px rgba(40,10,0,.7);transform:rotate(-2deg)}
#end .shot img{width:100%;height:100%;display:block}
#end .txt{position:absolute;left:1262px;top:330px;width:600px}
#end h2{font:700 96px/.98 Bricolage,Assistant,sans-serif;letter-spacing:-.035em}
#end .cta{display:inline-flex;align-items:center;height:104px;margin-top:56px;padding:0 48px;background:#fff;color:#17171a;border-radius:26px;font:700 46px/1 Assistant,sans-serif}
#end .sub{margin-top:30px;font:600 38px/1.25 Assistant,sans-serif}
#end .brand{position:absolute;left:96px;top:96px;display:flex;align-items:center;gap:18px;font:800 62px/1 Assistant,sans-serif;letter-spacing:-.03em}
#end .brand svg{width:66px;height:66px;fill:#fff}
`;

function build(name) {
  const dir = path.join(VIDEO, name), meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const hero = name === 'hero', fps = meta.fps, FD = meta.frames / fps;
  const T0 = hero ? 1.7 : 0, END = hero ? 3.4 : 0;
  const D = +(T0 + FD + END - (hero ? 0.35 : 0)).toFixed(3);
  for (const f of ['Assistant-Variable.woff2', 'BricolageGrotesque-Variable.woff2']) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(dir, f));
  fs.copyFileSync(path.join(ROOT, 'node_modules/gsap/dist/gsap.min.js'), path.join(dir, 'gsap.min.js'));

  const rectOf = (c) => (!c || FULL_ONLY.has(name) ? null : Array.isArray(c) ? LEGACY_SHOT : c);
  const beats = meta.beats.map((b, i) => ({ ...b, cam: rectOf(b.cam), t: T0 + b.f / fps, end: T0 + (meta.beats[i + 1] ? meta.beats[i + 1].f / fps : FD - (hero ? 0.2 : 0.75)) }));
  const tl = [];
  // camera: frame exactly the rectangle (16:10), or the whole window
  const camOf = (r) => { if (!r) return { scale: 1, x: 0, y: 0 }; const z = 1600 / r.w; return { scale: +z.toFixed(4), x: Math.round(-r.x * K * z), y: Math.round(-r.y * K * z) }; };
  // Whole window <-> rectangle is a zoom. Rectangle -> rectangle is a short dissolve between two camera layers,
  // so the film never shows an in-between crop that cuts through text.
  const FULLCAM = JSON.stringify(camOf(null)); let last = FULLCAM, layer = 0, twoLayers = false;
  beats.forEach((b) => { const c = camOf(b.cam), s = JSON.stringify(c); if (s === last) return; const t = (b.t + 0.05).toFixed(3);
    if (last !== FULLCAM && s !== FULLCAM) { twoLayers = true; const other = 1 - layer;
      tl.push(`tl.set("#cam${other || ''}",{scale:${c.scale},x:${c.x},y:${c.y}},${t});`);
      tl.push(`tl.to("#cam1",{opacity:${other},duration:0.4,ease:"power1.inOut"},${t});`); layer = other;
    } else tl.push(`tl.to("#cam${layer || ''}",{scale:${c.scale},x:${c.x},y:${c.y},duration:1,ease:"power2.inOut"},${t});`);
    last = s; });
  if (last !== FULLCAM) tl.push(`tl.to("#cam${layer || ''}",{scale:1,x:0,y:0,duration:0.8,ease:"power2.inOut"},${(T0 + FD - (hero ? 0.9 : 1.6)).toFixed(3)});`);
  // captions: one per run of beats with the same label, shown in the band
  let caps = ''; const runs = [];
  beats.forEach((b) => { const p = runs.at(-1); if (p && p.label === b.label) p.end = b.end; else runs.push({ label: b.label, keys: b.keys, t: b.t, end: b.end }); });
  runs.forEach((r, i) => { if (!r.label || r.end - r.t < 0.3) return;
    caps += `<div class="cap clip" id="cap${i}" data-start="${r.t.toFixed(3)}" data-duration="${(r.end - r.t).toFixed(3)}" data-track-index="3"><span>${esc(r.label)}</span>${r.keys.length ? `<span>${kbd(r.keys)}</span>` : ''}</div>\n`;
    tl.push(`tl.fromTo("#cap${i}",{opacity:0,y:14},{opacity:1,y:0,duration:0.28,ease:"power2.out"},${(r.t + 0.04).toFixed(3)});`);
    tl.push(`tl.to("#cap${i}",{opacity:0,duration:0.2,ease:"power1.in"},${(r.end - 0.22).toFixed(3)});`); });

  let extra = '';
  if (hero) {
    extra += `<div class="full clip" id="sting" data-start="0" data-duration="2.25" data-track-index="5"><div class="lock"><div id="mark">${svg}</div><div class="word" id="word">Snapty</div></div><div class="tag" id="tag">Mark up a screenshot, right in your browser.</div></div>\n`;
    tl.push('tl.fromTo("#mark",{opacity:0,scale:0.5,rotation:-35},{opacity:1,scale:1,rotation:0,duration:0.55,ease:"back.out(1.8)"},0.1);');
    tl.push('tl.fromTo("#word",{opacity:0,x:-50},{opacity:1,x:0,duration:0.5,ease:"power3.out"},0.32);');
    tl.push('tl.fromTo("#tag",{opacity:0,y:20},{opacity:1,y:0,duration:0.4,ease:"power2.out"},0.75);');
    tl.push('tl.to("#sting",{opacity:0,duration:0.45,ease:"power2.in"},1.75);');
    const e0 = T0 + FD - 0.35;
    extra += `<div class="full clip" id="end" data-start="${e0.toFixed(3)}" data-duration="${(D - e0).toFixed(3)}" data-track-index="6"><div class="brand" id="ebrand">${svg}<span>Snapty</span></div><div class="shot" id="eshot"><img src="result.png" alt=""></div><div class="txt" id="etxt"><h2>Point at exactly what you mean.</h2><div class="cta">Open the editor</div><div class="sub">Free. No account. Nothing uploaded.</div></div></div>\n`;
    tl.push(`tl.to("#end",{opacity:1,duration:0.4,ease:"power1.out"},${e0.toFixed(3)});`);
    tl.push(`tl.fromTo("#eshot",{y:70,scale:0.94},{y:0,scale:1,duration:0.7,ease:"power3.out"},${e0.toFixed(3)});`);
    tl.push(`tl.fromTo("#etxt",{opacity:0,x:40},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${(e0 + 0.3).toFixed(3)});`);
    tl.push(`tl.fromTo("#ebrand",{opacity:0},{opacity:1,duration:0.4},${(e0 + 0.2).toFixed(3)});`);
    tl.push(`tl.to(["#eshot","#etxt","#ebrand"],{opacity:0,duration:0.35,ease:"power1.in"},${(D - 0.4).toFixed(3)});`); // ends on the plain brand field = first frame of the sting
  } else {
    const l0 = FD - 0.5; // cross-fade back to the clean first frame so the loop has no cut
    extra += `<img class="clip" id="loop" src="first.jpg" alt="" data-start="${l0.toFixed(3)}" data-duration="0.5" data-track-index="2">\n`;
    tl.push(`tl.to("#loop",{opacity:1,duration:0.45,ease:"power1.inOut"},${l0.toFixed(3)});`);
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${name}</title><style>${CSS}</style></head><body>
<div id="root" data-composition-id="root" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" data-fps="${fps}">
<div id="stage"><div id="cam"><video class="clip" id="foot" src="footage.mp4" muted playsinline data-start="${T0}" data-duration="${FD.toFixed(3)}" data-track-index="1"></video>${hero ? '' : extra}</div>${twoLayers ? `<div id="cam1"><video class="clip" id="foot1" src="footage.mp4" muted playsinline data-start="${T0}" data-duration="${FD.toFixed(3)}" data-track-index="2"></video></div>` : ''}</div>
<div id="band"></div><div id="brand"><i>${svg}</i><span>Snapty</span></div>
${caps}${hero ? extra : ''}</div>
<script src="gsap.min.js"></script>
<script>
const tl = gsap.timeline({ paused: true });
${tl.join('\n')}
tl.set({}, {}, ${D});
window.__timelines = window.__timelines || {}; window.__timelines["root"] = tl;
</script></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  return { dir, D, FD, T0, hero };
}

function render(name, { dir, D, FD, T0, hero }) {
  const master = path.join(dir, 'master.mp4');
  const t = Date.now();
  execFileSync('npx', ['hyperframes', 'render', dir, '-o', master, '--fps', '30', '--crf', '10', '--video-frame-format', 'jpg', '--workers', '1', '--quiet'], { stdio: ['ignore', 'ignore', 'inherit'], shell: true, cwd: ROOT });
  const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  const mp4 = path.join(MEDIA, name + '.mp4'), webm = path.join(MEDIA, name + '.webm'), poster = path.join(MEDIA, name + '.webp');
  ff(['-i', master, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '24', '-pix_fmt', 'yuv420p', '-g', '90', '-movflags', '+faststart', '-an', mp4]);
  ff(['-i', master, '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-cpu-used', '2', '-g', '90', '-pix_fmt', 'yuv420p', '-an', webm]);
  const pt = hero ? T0 + FD - 1.2 : FD - 0.8; // poster: the finished annotation, before the loop fade / end card
  ff(['-ss', pt.toFixed(2), '-i', master, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '84', poster]);
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';
  console.log(`${name}: ${D.toFixed(1)}s  mp4 ${kb(mp4)}  webm ${kb(webm)}  poster ${kb(poster)}  (render ${((Date.now() - t) / 1000).toFixed(0)}s)`);
}

for (const name of process.argv.slice(2).filter((a) => !a.startsWith('--'))) { const info = build(name); if (!process.argv.includes('--build-only')) render(name, info); }
