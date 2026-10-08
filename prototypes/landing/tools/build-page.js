// node build-page.js   regenerates the generated parts of index.html (re-runnable):
//   the theme button, the hero film markup, and the merged "tools + keyboard" section (one playlist, one headline).
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'index.html'); let h = fs.readFileSync(file, 'utf8');
const between = (a, b, repl, { keepEnd = true } = {}) => { const i = h.indexOf(a), j = h.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('marker missing: ' + a.slice(0, 50)); h = h.slice(0, i) + repl + h.slice(keepEnd ? j : j + b.length); };
const film = (name, label, extra = '') => `<video width="1920" height="1280" muted playsinline preload="none" data-film="${name}"${extra}\n            aria-label="${label}"></video>`;

// ---- theme: one button that cycles System -> Dark -> Light (Tabler icons, the same paths the editor uses)
const THEME = `<!-- theme:start --><button class="nav-btn theme-btn" id="theme" type="button" data-choice="system" aria-label="Theme: System. Switch to Dark" title="Theme: System. Switch to Dark">
        <svg class="t-system" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10" /><path d="M7 20h10" /><path d="M9 16v4" /><path d="M15 16v4" /></svg>
        <svg class="t-dark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" /></svg>
        <svg class="t-light" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></svg>
      </button><!-- theme:end -->
      `;
if (h.includes('<!-- theme:start -->')) between('<!-- theme:start -->', '<!-- theme:end -->\n      ', THEME, { keepEnd: false });
else between('      <div class="theme" role="radiogroup"', '      <a class="nav-btn" href="https://github.com', '      ' + THEME);
h = h.replace('      <a href="#keys">Keyboard</a>\n', '');

// ---- hero film (3:2, the film's own shape)
between('      <figure class="shot shot-hero" data-clip>', '      <p class="note note-hero"', `      <figure class="shot shot-hero" data-clip>
        <video width="1920" height="1280" muted playsinline loop preload="metadata" poster="media/hero.webp" data-eager
          aria-label="Film: the Snapty logo, then a screenshot of a failing webhook page is pasted into the editor and marked up with an arrow, a rectangle, numbered badges, a pixelated secret, a highlighter stroke and a callout, then copied."><source src="media/hero.webm" type="video/webm"><source src="media/hero.mp4" type="video/mp4"></video>
      </figure>
`);

// ---- tools + keyboard, merged
const steps = [
  ['ar', ['A', 'R'], 'Arrows and boxes you can write on', 'Drag an arrow, drag a rectangle. Double-click either one to type on it.', 'arrow', 'Film: an arrow labelled spike is drawn to a chart peak, then a rectangle is drawn under it and Sunday looks wrong is typed inside.'],
  ['opl', ['O', 'P', 'L'], 'Ellipse, freehand, line', 'Circle a number, scribble around a point, underline a total. Hand-drawn by default, clean if you prefer.', 'shapes', 'Film: an ellipse circles an order count, a freehand loop goes around a chart point and a line underlines a total.'],
  ['k', ['K'], 'Highlighter', 'A translucent stroke that keeps the text underneath readable.', 'highlighter', 'Film: two lines of text on a product page are highlighted in yellow.'],
  ['n', ['N'], 'Numbers, letters, stamps', 'Click to drop 1, 2, 3. Switch to A, B, C and the count starts over. Add a pointing finger or a stamp: ✅ ❌ ⚠️ ❓ ⭐ 🔥.', 'badges', 'Film: badges 1, 2 and 3 are placed on three steps of a settings page, then the style is switched to letters and A, B and C are placed, then a pointing-finger badge and a check stamp.'],
  ['u', ['U'], 'Callouts that stay on target', 'Press on the thing you mean and drag away. The tail stays where you pressed, the bubble lands where you let go, and you type.', 'callout', 'Film: a callout is pressed on a pale button and dragged out to open space, and a comment about contrast is typed into it.'],
  ['b', ['B'], 'Hide what should not travel', 'Drag over an API key or an email address and it is pixelated before the picture goes anywhere.', 'pixelate', 'Film: a secret API key and an email address on an account page are pixelated.'],
  ['s', ['S'], 'Spotlight', 'Dim everything outside one region so nobody has to hunt for it.', 'spotlight', 'Film: a spotlight is dragged over the product details and the rest of the page dims.'],
  ['m', ['M'], 'Magnifier', 'Drag over a small detail. It reappears enlarged in a bubble that stays connected to its source.', 'magnifier', 'Film: a small percentage under a revenue figure is magnified into a large connected bubble.'],
  ['c', ['C', 'then', 'Ctrl', 'E'], 'Crop, then export', 'Crop to what matters. Copy to the clipboard or download PNG, JPG, WebP or SVG at 1x or 2x, with optional padding, background and a device frame.', 'export', 'Film: a screenshot is cropped, then the export panel switches to WebP at 2x and copies the image.'],
  ['z', ['Ctrl', 'Z'], 'Undo, redo, dark mode', 'A tool stays selected, so three arrows are three drags. Undo and redo freely, flip the theme with Alt Shift D, and reload without losing your work.', 'flow', 'Film: three arrows are drawn one after another, two are undone and redone, then the editor switches to dark mode.'],
  ['', ['Ctrl', 'K'], 'Command palette and every shortcut', 'Type three letters and press Enter to run anything. Press ? for the full, searchable list of shortcuts.', 'keyboard', 'Film: the command palette opens with Control K and finds the callout tool, then the shortcuts list opens with a question mark and is searched for undo.'],
];
const keys = (ks) => ks.map((k) => (k === 'then' ? `<span class="plus">${k}</span>` : `<kbd>${k}</kbd>`)).join('');
let tour = `<section class="tools" id="tools" aria-labelledby="tools-h">
  <div class="wrap">
    <div class="sec-head">
      <h2 id="tools-h">Every tool is one key away.</h2>
      <p>Press a tool&rsquo;s key right now, or pick it from the list, and watch it work. Every film is the editor itself, recorded in a browser.</p>
    </div>

    <div class="tour" id="tour">
`;
for (const [k, ks, title, text, name, label] of steps) tour += `      <article class="step" data-step data-keys="${k}">
        <h3 class="step-h"><button type="button" class="step-head" aria-expanded="false"><span class="step-title">${title}</span><span class="keys" aria-label="Shortcut: ${ks.join(' ')}">${keys(ks)}</span></button></h3>
        <p class="step-desc">${text}</p>
        <figure class="shot" data-clip>
          ${film(name, label)}
        </figure>
      </article>
`;
tour += `      <article class="step" data-step data-keys="">
        <h3 class="step-h"><button type="button" class="step-head" aria-expanded="false"><span class="step-title">On a phone too</span><span class="keys keys-plain">Touch</span></button></h3>
        <p class="step-desc">Same editor, toolbar at your thumb. Useful when the screenshot is already on the phone.</p>
        <figure class="shot shot-phone" data-clip>
          <video width="780" height="1560" muted playsinline preload="none" data-film="phone" data-mp4only
            aria-label="Screen recording at phone size: number badges are tapped onto a settings screenshot, a rectangle is drawn, and the image is copied."></video>
        </figure>
      </article>
    </div>

    <dl class="combos" aria-label="Essential shortcuts">
      <div><dt><kbd>Ctrl</kbd><kbd>V</kbd></dt><dd>Paste a screenshot</dd></div>
      <div><dt><kbd>Ctrl</kbd><kbd>C</kbd></dt><dd>Copy the finished image</dd></div>
      <div><dt><kbd>Ctrl</kbd><kbd>E</kbd></dt><dd>Download options</dd></div>
      <div><dt><kbd>Ctrl</kbd><kbd>Z</kbd></dt><dd>Undo, with Shift to redo</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>All shortcuts. On a Mac, Ctrl is ⌘</dd></div>
    </dl>
  </div>
</section>

`;
between('<section class="tools" id="tools"', '<!-- ───────────── Use cases', tour);
// the separate keyboard section is gone: its ideas now live in the playlist above
if (h.includes('<!-- ───────────── Keyboard')) between('<!-- ───────────── Keyboard', '<!-- ───────────── Closing', '');
fs.writeFileSync(file, h); console.log('page built', h.length);
