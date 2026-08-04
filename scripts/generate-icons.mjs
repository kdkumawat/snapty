import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const scissors =
  'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z';

function makeSvg(size, { maskable = false, glyphScale = 0.52 } = {}) {
  // Smaller glyph = more padding so macOS dock / maskable crops don't clip
  const scale = maskable ? 0.42 : glyphScale;
  const glyphSize = 24;
  const s = (size * scale) / glyphSize;
  const tx = size / 2;
  const ty = size / 2;
  const rx = Math.round(size * 0.22);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : rx}" fill="#f97316"/>
  <g transform="translate(${tx} ${ty}) scale(${s}) translate(-12 -12)" fill="#ffffff">
    <path d="${scissors}"/>
  </g>
</svg>`);
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is required. Run: npm i -D sharp');
  process.exit(1);
}

for (const t of targets) {
  const svg = makeSvg(t.size, { maskable: t.maskable });
  await sharp(svg).png().toFile(path.join(outDir, t.name));
  console.log('wrote', t.name);
}

// Also refresh icon.svg with padded glyph
fs.writeFileSync(
  path.join(outDir, 'icon.svg'),
  makeSvg(512, { maskable: false, glyphScale: 0.52 }).toString('utf8')
);
console.log('done');
