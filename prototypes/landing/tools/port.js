// node port.js   carries the approved prototype into the Next app verbatim (re-runnable):
//   styles.css  -> src/components/landing/landing.css      same rules, scoped under .lp so nothing leaks into the editor
//   index.html  -> src/components/landing/landing-page.tsx same markup as JSX (Link, ThemeToggle, Mark)
//   marks.js    -> src/components/landing/marks.ts
//   media/, fonts -> public/landing/, public/fonts/
// Scoping rules: :root/body/html -> .lp; dark theme -> html.dark .lp; rem -> px (the app's root font size cannot
// change the landing); fonts keep their files but get landing-only family names (the app declares Assistant with a
// narrower weight range). tools/compare.js proves the result against the prototype pixel by pixel.
const fs = require('fs'), path = require('path');
const P = path.join(__dirname, '..'), APP = path.join(P, '..', '..'), OUT = path.join(APP, 'src/components/landing');

// ---------- CSS ----------
let css = fs.readFileSync(path.join(P, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
css = css.replace(/(-?\d*\.?\d+)rem\b/g, (m, n) => +(n * 16).toFixed(3) + 'px');
css = css.replace(/"Bricolage Grotesque"/g, '"LP Bricolage"').replace(/"Assistant"/g, '"LP Assistant"').replace(/"Excalifont"/g, '"LP Excalifont"').replace(/url\("assets\//g, 'url("/fonts/');
const blocks = (src) => { const out = []; let i = 0; while (i < src.length) { const o = src.indexOf('{', i); if (o < 0) break; let d = 1, j = o + 1; while (d && j < src.length) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; } out.push([src.slice(i, o).trim(), src.slice(o + 1, j - 1)]); i = j; } return out; };
const sel = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).map((x) => {
  if (x === ':root' || x === 'body' || x === 'html') return '.lp';
  if (x === 'html[data-theme="dark"]') return null;
  if (x.startsWith(':root[data-theme="dark"]')) return ('html.dark .lp ' + x.slice(24)).trim();
  return '.lp ' + x;
}).filter(Boolean).join(', ');
const conv = (src) => blocks(src).map(([head, body]) => {
  if (head.startsWith('@font-face') || head.startsWith('@keyframes')) return `${head} {${body}}\n`;
  if (head.startsWith('@media')) return `${head} {\n${conv(body)}}\n`;
  const s = sel(head); if (!s) return '';
  if (head === 'html') body = ' scroll-behavior: smooth; scroll-padding-top: 76px; ';
  // .lp is the page's own scroll container (the root layout is a fixed shell) and its own stacking context,
  // so the hero's dot grid (z-index: -1) paints above the page background instead of behind it.
  if (head === 'body') body = body.replace('margin: 0;', '').replace('overflow-x: clip;', 'height: 100%; overflow-x: hidden; overflow-y: auto; isolation: isolate;');
  return `${s} {${body}}\n`;
}).join('');
fs.writeFileSync(path.join(OUT, 'landing.css'), `/* Generated from prototypes/landing/styles.css by prototypes/landing/tools/port.js. Do not edit by hand:
   change the prototype and run the port, then tools/compare.js. Everything is scoped to .lp. */\n` + conv(css));

// ---------- marks ----------
const marks = fs.readFileSync(path.join(P, 'marks.js'), 'utf8').match(/window\.SNAPTY_MARKS=(.*);/)[1];
fs.writeFileSync(path.join(OUT, 'marks.ts'), `// Hand-drawn page annotations: rough.js path data (prototypes/landing/tools/marks.js).\nexport const MARKS: Record<string, string[]> = ${marks};\n`);

// ---------- JSX ----------
let h = fs.readFileSync(path.join(P, 'index.html'), 'utf8');
h = h.slice(h.indexOf('<header class="nav">'), h.indexOf('<script src="marks.js"'));
h = h.replace(/<!-- theme:start -->[\s\S]*?<!-- theme:end -->/, '<ThemeToggle className="nav-btn" />');
h = h.replace(/<!--[\s\S]*?-->/g, '');
h = h.replace(/<svg class="(mark [^"]*)" data-mark="(\w+)" viewBox="([^"]*)"([^>]*)><\/svg>/g, (m, c, n, vb, rest) => `<Mark name="${n}" className="${c}" viewBox="${vb}"${/preserveAspectRatio/.test(rest) ? ' stretch' : ''} />`);
h = h.replace(/<a ([^>]*?)href="http:\/\/localhost:3001(\/\w+)" data-prod="[^"]*"([^>]*)>([\s\S]*?)<\/a>/g, '<Link $1href="$2"$3>$4</Link>');
h = h.replace(/\bclass=/g, 'className=').replace(/\btabindex=/g, 'tabIndex=').replace(/\bplaysinline\b/g, 'playsInline').replace(/ value="100"/g, ' defaultValue={100}').replace(/tabIndex="(-?\d+)"/g, 'tabIndex={$1}');
h = h.replace(/<(img|input|source|br)\b([^>]*?)\s*\/?>/g, '<$1$2 />');
h = h.replace(/"media\//g, '"/landing/').replace(/"assets\/logo\.svg"/g, '"/logo.svg"');
h = h.replace(/(>[^<>{}]*)'([^<>{}]*<)/g, '$1&apos;$2').replace(/(>[^<>{}]*)'([^<>{}]*<)/g, '$1&apos;$2');
fs.writeFileSync(path.join(OUT, 'landing-page.tsx'), `'use client';
// Generated from prototypes/landing/index.html by prototypes/landing/tools/port.js. Change the prototype, then re-run the port.
import Link from 'next/link';
import { useRef } from 'react';
import ThemeToggle from '@/components/theme-toggle';
import { MARKS } from './marks';
import { useLandingMotion } from './use-landing-motion';
import './landing.css';

/** A hand-drawn annotation; it draws itself on when it scrolls into view. */
function Mark({ name, className, viewBox, stretch }: { name: string; className: string; viewBox: string; stretch?: boolean }) {
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true" preserveAspectRatio={stretch ? 'none' : undefined}>
      {(MARKS[name] || []).map((d, i) => <path key={i} d={d} pathLength={1} />)}
    </svg>
  );
}

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);
  return (
    <div className="lp" ref={root}>
${h.split('\n').map((l) => '      ' + l).join('\n')}
    </div>
  );
}
`);

// ---------- assets ----------
// media/ is gitignored. On a fresh clone copy public/landing to media/ first; without it the shipped films are left alone.
const pub = path.join(APP, 'public/landing'); const hasMedia = fs.existsSync(path.join(P, 'media'));
if (hasMedia) { fs.rmSync(pub, { recursive: true, force: true }); fs.mkdirSync(pub, { recursive: true }); }
let total = 0; if (hasMedia) for (const f of fs.readdirSync(path.join(P, 'media'))) { if (!/^(hero|arrow|shapes|highlighter|badges|callout|pixelate|spotlight|magnifier|export|flow|keyboard|phone|ex-|bgm\.mp3)/.test(f)) continue; fs.copyFileSync(path.join(P, 'media', f), path.join(pub, f)); total += fs.statSync(path.join(pub, f)).size; }
fs.copyFileSync(path.join(P, 'assets/BricolageGrotesque-Variable.woff2'), path.join(APP, 'public/fonts/BricolageGrotesque-Variable.woff2'));
console.log('ported. public/landing total', (total / 1048576).toFixed(1) + ' MB');
