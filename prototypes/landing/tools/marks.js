// Generates the hand-drawn page annotations with rough.js (same library the editor draws with).
const rough = require('D:/src/github.com/kdkumawat/snapty/node_modules/roughjs/bundled/rough.cjs.js');
const g = rough.generator();
const o = { roughness: 1.3, bowing: 1.6, strokeWidth: 3, seed: 7, disableMultiStroke: false };
const P = (d) => g.toPaths(d).map((x) => x.d).join(' ');
const arrow = (pts, seed) => { const oo = { ...o, seed }; const [a, b] = pts.slice(-2); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const h = 20; const w = 0.5;
  return [P(g.curve(pts, oo)), P(g.line(b[0], b[1], b[0] - h * Math.cos(ang - w), b[1] - h * Math.sin(ang - w), oo)), P(g.line(b[0], b[1], b[0] - h * Math.cos(ang + w), b[1] - h * Math.sin(ang + w), oo))]; };
const out = {
  heroArrow: arrow([[150, 8], [120, 50], [70, 78], [18, 92]], 3),
  ctaArrow: arrow([[10, 14], [60, 6], [118, 30], [150, 70]], 11),
  circle: [P(g.ellipse(120, 44, 220, 68, { ...o, seed: 5, roughness: 1.6 }))],
  underline: [P(g.line(4, 10, 296, 8, { ...o, seed: 9, roughness: 2 }))],
};
console.log(JSON.stringify(out, null, 1));
