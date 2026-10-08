// node sheet.js <name...>   contact sheet (start, every ~2 s, end) of each delivered film -> ../review/film-<name>.jpg
const path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
for (const name of process.argv.slice(2)) {
  const src = path.join(ROOT, 'media', name + '.mp4');
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString();
  const step = dur > 20 ? 2.4 : dur > 11 ? 2 : 1.5, n = Math.floor((dur - 0.1) / step) + 1, cols = 3, rows = Math.ceil((n + 1) / cols);
  // every `step` seconds plus the very last frame
  const sel = `select='not(mod(n\\,${Math.round(step * 30)}))+eq(n\\,${Math.round(dur * 30) - 1})'`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `${sel},scale=960:-1,tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', '-q:v', '3', path.join(ROOT, 'review', `film2-${name}.jpg`)]);
  console.log(name, dur.toFixed(1) + 's', n + 1, 'frames');
}
