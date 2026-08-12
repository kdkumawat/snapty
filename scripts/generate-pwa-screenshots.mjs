/**
 * Generates the PWA install-promotion screenshots referenced by manifest.json.
 *
 * The screenshots are stylized mockups of the editor rendered with sharp's SVG
 * pipeline - no browser needed, deterministic output. `npm run pwa:assets`
 * regenerates them alongside the icons.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const ICON_PATH =
  'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z';

/** Reusable mock chrome: toolbar row, settings rail, and a framed screenshot. */
function editorMock({ width, height, phone = false }) {
  const k = width / 1280; // scale everything from a 1280 design
  const px = (n) => Math.round(n * k);
  const barH = px(64);
  const railW = phone ? 0 : px(72);
  const inset = px(phone ? 24 : 56);
  const imgW = width - (phone ? inset * 2 : railW + inset * 2);
  const imgH = px(720);
  const cardX = phone ? inset : railW + inset;
  const cardY = barH + px(56);
  const framePad = px(28);

  const tools = phone
    ? ['→', '▭', '◯', '✏', '🖍', 'T', '①']
    : ['→', '▭', '◯', '⬟', '-', '✏', '🖍', 'T', '①', '✕', '▦', '●'];

  const toolButtons = tools
    .map(
      (t, i) =>
        `<g transform="translate(${px(20 + i * (phone ? 44 : 52))} ${px(16)})">
           <rect width="${px(phone ? 36 : 40)}" height="${px(40)}" rx="${px(9)}"
             fill="${i === 0 ? '#f97316' : 'transparent'}" opacity="${i === 0 ? 0.16 : 0}" />
           <text x="${px(phone ? 18 : 20)}" y="${px(26)}" text-anchor="middle"
             font-size="${px(phone ? 17 : 18)}" fill="${i === 0 ? '#f97316' : '#a8a29e'}">${t}</text>
         </g>`,
    )
    .join('');

  const urlBar = phone
    ? ''
    : `<rect x="${px(300)}" y="${px(22)}" width="${px(420)}" height="${px(26)}" rx="${px(13)}" fill="#f5f5f4" stroke="#e7e5e4"/>
       <text x="${px(510)}" y="${px(39)}" text-anchor="middle" font-size="${px(13)}" fill="#a8a29e">snapty.pages.dev</text>`;

  const dots = phone
    ? ''
    : ['#fca5a5', '#fcd34d', '#86efac']
        .map(
          (c, i) =>
            `<circle cx="${px(28 + i * 18)}" cy="${px(34)}" r="${px(6)}" fill="${c}"/>`,
        )
        .join('');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#fafaf9"/>
    <!-- top bar -->
    <rect x="0" y="0" width="${width}" height="${barH}" fill="#ffffff" stroke="#e7e5e4" stroke-width="1"/>
    <g transform="translate(${px(20)} ${px(12)})">
      <rect width="${px(40)}" height="${px(40)}" rx="${px(10)}" fill="#f97316"/>
      <path d="${ICON_PATH}" transform="translate(${px(10)} ${px(10)}) scale(${px(40) / 24})" fill="#ffffff"/>
    </g>
    <text x="${px(72)}" y="${px(37)}" font-size="${px(19)}" font-weight="700" fill="#1c1917">Snapty</text>
    <text x="${px(72)}" y="${px(53)}" font-size="${px(12)}" fill="#a8a29e">Annotate · Style · Export</text>
    ${urlBar}
    ${dots}
    <!-- floating toolbar pill -->
    <rect x="${px(phone ? 12 : 180)}" y="${px(14)}" width="${px(phone ? 336 : 500)}" height="${px(phone ? 56 : 60)}" rx="${px(phone ? 28 : 30)}" fill="#ffffff" stroke="#e7e5e4" shadow-color="#00000012" shadow-blur="${px(24)}" shadow-offset-y="${px(4)}"/>
    ${toolButtons}
    <!-- settings rail -->
    ${phone ? '' : `
    <g transform="translate(${px(14)} ${barH + px(70)})">
      <rect width="${railW - px(28)}" height="${px(360)}" rx="${px(16)}" fill="#ffffff" stroke="#e7e5e4"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${px(13)}" y="${px(14 + i * 52)}" width="${px(30)}" height="${px(30)}" rx="${px(8)}" fill="${i === 0 ? '#f97316' : '#f5f5f4'}"/>`).join('')}
    </g>`}
    <!-- framed screenshot card -->
    <g>
      <rect x="${cardX - framePad}" y="${cardY - framePad}" width="${imgW + framePad * 2}" height="${imgH + framePad * 2}" rx="${px(18)}" fill="#ffffff" stroke="#e7e5e4" shadow-color="#0000001f" shadow-blur="${px(48)}" shadow-offset-y="${px(20)}"/>
      <rect x="${cardX}" y="${cardY}" width="${imgW}" height="${imgH}" rx="${px(10)}" fill="#e7e5e4"/>
      <!-- fake UI in the screenshot -->
      <rect x="${cardX + px(64)}" y="${cardY + px(70)}" width="${imgW - px(128)}" height="${px(140)}" rx="${px(12)}" fill="#ffffff" stroke="#d6d3d1"/>
      <rect x="${cardX + px(96)}" y="${cardY + px(100)}" width="${px(120)}" height="${px(14)}" rx="${px(7)}" fill="#e7e5e4"/>
      <rect x="${cardX + px(96)}" y="${cardY + px(126)}" width="${px(200)}" height="${px(12)}" rx="${px(6)}" fill="#f5f5f4"/>
      <rect x="${cardX + px(96)}" y="${cardY + px(148)}" width="${px(160)}" height="${px(12)}" rx="${px(6)}" fill="#f5f5f4"/>
      <rect x="${cardX + px(64)}" y="${cardY + px(250)}" width="${imgW - px(128)}" height="${px(300)}" rx="${px(12)}" fill="#f5f5f4"/>
      <!-- annotations -->
      <path d="M ${cardX + px(220)} ${cardY + px(340)} L ${cardX + px(400)} ${cardY + px(240)}" stroke="#ef4444" stroke-width="${px(5)}" fill="none" stroke-linecap="round"/>
      <path d="M ${cardX + px(400)} ${cardY + px(240)} l ${px(16)} ${px(-8)} l ${px(-4)} ${px(16)} z" fill="#ef4444"/>
      <rect x="${cardX + px(320)}" y="${cardY + px(360)}" width="${px(150)}" height="${px(90)}" rx="${px(8)}" fill="none" stroke="#22c55e" stroke-width="${px(4)}" stroke-dasharray="${px(10)} ${px(6)}"/>
      <circle cx="${cardX + px(520)}" cy="${cardY + px(300)}" r="${px(34)}" fill="#3b82f6"/>
      <text x="${cardX + px(520)}" y="${cardY + px(310)}" text-anchor="middle" font-size="${px(30)}" font-weight="700" fill="#ffffff">1</text>
      <text x="${cardX + px(280)}" y="${cardY + px(470)}" font-size="${px(30)}" font-family="'Caveat','Segoe Print',cursive" fill="#111827">Ship it! 🚀</text>
    </g>
  </svg>`;
}

const targets = [
  { name: 'desktop.png', width: 1280, height: 900, phone: false },
  { name: 'mobile.png', width: 480, height: 1000, phone: true },
];

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is required. Run: npm i -D sharp');
  process.exit(1);
}

for (const t of targets) {
  await sharp(Buffer.from(editorMock({ ...t })))
    .png()
    .toFile(path.join(outDir, t.name));
  console.log('wrote', t.name);
}
console.log('done');
