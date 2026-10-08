'use client';
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
      <header className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="#top" aria-label="Snapty home">
            <img src="/logo.svg" width="30" height="30" alt="" />
            <span>Snapty</span>
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#tools">Tools</a>
            <a href="#uses">Use cases</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="nav-act">
            <ThemeToggle className="nav-btn" />
                  <a className="nav-btn" href="https://github.com/kdkumawat/snapty" aria-label="Snapty on GitHub">
              <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" className="fill"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            </a>
            <Link className="btn btn-sm" href="/editor">Open the editor</Link>
          </div>
        </div>
      </header>
      
      <span className="top-sentinel" aria-hidden="true"></span>
      
      <main id="main">
      
      
      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Point at exactly what you mean.</h1>
            <p className="lede">Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.</p>
            <div className="hero-act">
              <Link className="btn btn-lg" href="/editor">Open the editor</Link>
              <p className="paste-hint" id="paste-hint">or paste a screenshot here <kbd>Ctrl</kbd><kbd>V</kbd></p>
            </div>
            <p className="paste-result" id="paste-result" role="status" hidden></p>
          </div>
      
          <div className="hero-stage">
            <figure className="shot shot-hero" data-clip>
              <video width="1920" height="1280" muted playsInline loop preload="none" poster="/landing/hero.webp" data-film="hero"
                aria-label="Film: the Snapty logo, then a screenshot of a failing webhook page is pasted into the editor and marked up with an arrow, a rectangle, numbered badges, a pixelated secret, a highlighter stroke and a callout, then copied."></video>
            </figure>
            <p className="note note-hero" aria-hidden="true">the real editor, recorded</p>
            <Mark name="heroArrow" className="mark mark-hero" viewBox="0 0 80 44" />
          </div>
        </div>
      </section>
      
      
      <section className="tools" id="tools" aria-labelledby="tools-h">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="tools-h">Every tool is one key away.</h2>
            <p>Press a tool&rsquo;s key right now, or pick it from the list, and watch it work. Every film is the editor itself, recorded.</p>
          </div>
      
          <div className="tour" id="tour">
            <article className="step" data-step data-keys="ar">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Arrows and boxes you can write on</span><span className="keys" aria-label="Shortcut: A R"><kbd>A</kbd><kbd>R</kbd></span></button></h3>
              <p className="step-desc">Drag an arrow, drag a rectangle. Double-click either one to type on it.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="arrow"
                  aria-label="Film: an arrow labelled spike is drawn to a chart peak, then a rectangle is drawn under it and Sunday looks wrong is typed inside."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="opl">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Ellipse, freehand, line</span><span className="keys" aria-label="Shortcut: O P L"><kbd>O</kbd><kbd>P</kbd><kbd>L</kbd></span></button></h3>
              <p className="step-desc">Circle a number, scribble around a point, underline a total. Hand-drawn by default, clean if you prefer.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="shapes"
                  aria-label="Film: an ellipse circles an order count, a freehand loop goes around a chart point and a line underlines a total."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="k">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Highlighter</span><span className="keys" aria-label="Shortcut: K"><kbd>K</kbd></span></button></h3>
              <p className="step-desc">A translucent stroke that keeps the text underneath readable.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="highlighter"
                  aria-label="Film: two lines of text on a product page are highlighted in yellow."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="n">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Numbers, letters, stamps</span><span className="keys" aria-label="Shortcut: N"><kbd>N</kbd></span></button></h3>
              <p className="step-desc">Click to drop 1, 2, 3. Switch to A, B, C and the count starts over. Add a pointing finger or a stamp: ✅ ❌ ⚠️ ❓ ⭐ 🔥.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="badges"
                  aria-label="Film: badges 1, 2 and 3 are placed on three steps of a settings page, then the style is switched to letters and A, B and C are placed, then a pointing-finger badge and a check stamp."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="u">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Callouts that stay on target</span><span className="keys" aria-label="Shortcut: U"><kbd>U</kbd></span></button></h3>
              <p className="step-desc">Press on the thing you mean and drag away. The tail stays where you pressed, the bubble lands where you let go, and you type.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="callout"
                  aria-label="Film: a callout is pressed on a pale button and dragged out to open space, and a comment about contrast is typed into it."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="b">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Hide what should not travel</span><span className="keys" aria-label="Shortcut: B"><kbd>B</kbd></span></button></h3>
              <p className="step-desc">Drag over an API key or an email address and it is pixelated before the picture goes anywhere.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="pixelate"
                  aria-label="Film: a secret API key and an email address on an account page are pixelated."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="s">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Spotlight</span><span className="keys" aria-label="Shortcut: S"><kbd>S</kbd></span></button></h3>
              <p className="step-desc">Dim everything outside one region so nobody has to hunt for it.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="spotlight"
                  aria-label="Film: a spotlight is dragged over the product details and the rest of the page dims."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="m">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Magnifier</span><span className="keys" aria-label="Shortcut: M"><kbd>M</kbd></span></button></h3>
              <p className="step-desc">Drag over a small detail. It reappears enlarged in a bubble that stays connected to its source.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="magnifier"
                  aria-label="Film: a small percentage under a revenue figure is magnified into a large connected bubble."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="c">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Crop, then export</span><span className="keys" aria-label="Shortcut: C then Ctrl E"><kbd>C</kbd><span className="plus">then</span><kbd>Ctrl</kbd><kbd>E</kbd></span></button></h3>
              <p className="step-desc">Crop to what matters. Copy to the clipboard or download PNG, JPG, WebP or SVG at 1x or 2x, with optional padding, background and a device frame.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="export"
                  aria-label="Film: a screenshot is cropped, then the export panel switches to WebP at 2x and copies the image."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="z">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Undo, redo, dark mode</span><span className="keys" aria-label="Shortcut: Ctrl Z"><kbd>Ctrl</kbd><kbd>Z</kbd></span></button></h3>
              <p className="step-desc">A tool stays selected, so three arrows are three drags. Undo and redo freely, flip the theme with Alt Shift D, and reload without losing your work.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="flow"
                  aria-label="Film: three arrows are drawn one after another, two are undone and redone, then the editor switches to dark mode."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">Command palette and every shortcut</span><span className="keys" aria-label="Shortcut: Ctrl K"><kbd>Ctrl</kbd><kbd>K</kbd></span></button></h3>
              <p className="step-desc">Type three letters and press Enter to run anything. Press ? for the full, searchable list of shortcuts.</p>
              <figure className="shot" data-clip>
                <video width="1920" height="1280" muted playsInline preload="none" data-film="keyboard"
                  aria-label="Film: the command palette opens with Control K and finds the callout tool, then the shortcuts list opens with a question mark and is searched for undo."></video>
              </figure>
            </article>
            <article className="step" data-step data-keys="">
              <h3 className="step-h"><button type="button" className="step-head" aria-expanded="false"><span className="step-title">On a phone too</span><span className="keys keys-plain">Touch</span></button></h3>
              <p className="step-desc">Same editor, toolbar at your thumb. Useful when the screenshot is already on the phone.</p>
              <figure className="shot shot-phone" data-clip>
                <video width="780" height="1560" muted playsInline preload="none" data-film="phone" data-mp4only
                  aria-label="Screen recording at phone size: number badges are tapped onto a settings screenshot, a rectangle is drawn, and the image is copied."></video>
              </figure>
            </article>
          </div>
      
          <dl className="combos" aria-label="Essential shortcuts">
            <div><dt><kbd>Ctrl</kbd><kbd>V</kbd></dt><dd>Paste a screenshot</dd></div>
            <div><dt><kbd>Ctrl</kbd><kbd>C</kbd></dt><dd>Copy the finished image</dd></div>
            <div><dt><kbd>Ctrl</kbd><kbd>E</kbd></dt><dd>Download options</dd></div>
            <div><dt><kbd>Ctrl</kbd><kbd>Z</kbd></dt><dd>Undo, with Shift to redo</dd></div>
            <div><dt><kbd>?</kbd></dt><dd>All shortcuts. On a Mac, Ctrl is ⌘</dd></div>
          </dl>
        </div>
      </section>
      
      
      <section className="uses" id="uses" aria-labelledby="uses-h">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="uses-h">Four pictures you send every week.</h2>
            <p>Drag the divider to compare the raw screenshot with what you would actually send.</p>
          </div>
      
          <div className="uses-body">
          <div className="tabs" role="tablist" aria-label="Use cases">
            <button role="tab" id="tab-bug" aria-controls="panel-bug" aria-selected="true">Bug report<span className="tab-note" aria-hidden="true"><span>“The total is wrong” becomes a ticket nobody has to ask about.</span><span>Magnifier, rectangle, two callouts.</span></span></button>
            <button role="tab" id="tab-tut" aria-controls="panel-tut" aria-selected="false" tabIndex={-1}>Step-by-step<span className="tab-note" aria-hidden="true"><span>Five clicks, five numbers, and the docs page writes itself.</span><span>Number badges, text.</span></span></button>
            <button role="tab" id="tab-red" aria-controls="panel-red" aria-selected="false" tabIndex={-1}>Redaction<span className="tab-note" aria-hidden="true"><span>Hide the key before the screenshot reaches a chat that never forgets.</span><span>Pixelate, callout.</span></span></button>
            <button role="tab" id="tab-des" aria-controls="panel-des" aria-selected="false" tabIndex={-1}>Design feedback<span className="tab-note" aria-hidden="true"><span>Feedback pinned to the pixel it is about, not paragraph four of a message.</span><span>Spotlight, highlighter, stamps, text.</span></span></button>
          </div>
      
          <div className="panel" role="tabpanel" id="panel-bug" aria-labelledby="tab-bug" tabIndex={0}>
            <div className="cmp" data-cmp>
              <img className="cmp-before" loading="lazy" src="/landing/ex-bug-before.webp" width="2888" height="1808" alt="Dashboard screenshot, unannotated." decoding="async" />
              <img className="cmp-after" loading="lazy" src="/landing/ex-bug-after.webp" width="2888" height="1808" alt="The same dashboard: a magnifier enlarges the revenue figure, a rectangle marks the order total, and two callouts say the numbers disagree." decoding="async" />
              <span className="cmp-tag cmp-tag-b" aria-hidden="true">Before</span><span className="cmp-tag cmp-tag-a" aria-hidden="true">After</span>
              <span className="cmp-line" aria-hidden="true"></span>
              <input type="range" min="0" max="100" defaultValue={100} aria-label="Divider position between before and after" />
            </div>
            <div className="panel-text">
              <p className="panel-line">“The total is wrong” becomes a ticket nobody has to ask about.</p>
              <p className="panel-tools">Magnifier, rectangle, two callouts.</p>
            </div>
          </div>
      
          <div className="panel" role="tabpanel" id="panel-tut" aria-labelledby="tab-tut" tabIndex={0} hidden>
            <div className="cmp" data-cmp>
              <img className="cmp-before" loading="lazy" src="/landing/ex-tut-before.webp" width="2888" height="1808" alt="Notification settings screenshot, unannotated." decoding="async" />
              <img className="cmp-after" loading="lazy" src="/landing/ex-tut-after.webp" width="2888" height="1808" alt="The same settings screen with numbered badges 1 to 5 and short handwritten instructions next to each control." decoding="async" />
              <span className="cmp-tag cmp-tag-b" aria-hidden="true">Before</span><span className="cmp-tag cmp-tag-a" aria-hidden="true">After</span>
              <span className="cmp-line" aria-hidden="true"></span>
              <input type="range" min="0" max="100" defaultValue={100} aria-label="Divider position between before and after" />
            </div>
            <div className="panel-text">
              <p className="panel-line">Five clicks, five numbers, and the docs page writes itself.</p>
              <p className="panel-tools">Number badges, text.</p>
            </div>
          </div>
      
          <div className="panel" role="tabpanel" id="panel-red" aria-labelledby="tab-red" tabIndex={0} hidden>
            <div className="cmp" data-cmp>
              <img className="cmp-before" loading="lazy" src="/landing/ex-red-before.webp" width="2888" height="1808" alt="Account page showing an email address, a secret API key and card details." decoding="async" />
              <img className="cmp-after" loading="lazy" src="/landing/ex-red-after.webp" width="2888" height="1808" alt="The same account page with the email, the secret key and the card details pixelated, and a callout reading Hidden before sharing." decoding="async" />
              <span className="cmp-tag cmp-tag-b" aria-hidden="true">Before</span><span className="cmp-tag cmp-tag-a" aria-hidden="true">After</span>
              <span className="cmp-line" aria-hidden="true"></span>
              <input type="range" min="0" max="100" defaultValue={100} aria-label="Divider position between before and after" />
            </div>
            <div className="panel-text">
              <p className="panel-line">Hide the key before the screenshot reaches a chat that never forgets.</p>
              <p className="panel-tools">Pixelate, callout.</p>
            </div>
          </div>
      
          <div className="panel" role="tabpanel" id="panel-des" aria-labelledby="tab-des" tabIndex={0} hidden>
            <div className="cmp" data-cmp>
              <img className="cmp-before" loading="lazy" src="/landing/ex-des-before.webp" width="2888" height="1808" alt="Product page for a table lamp, unannotated." decoding="async" />
              <img className="cmp-after" loading="lazy" src="/landing/ex-des-after.webp" width="2888" height="1808" alt="The same product page with a spotlight on the details column, the price highlighted, check and cross stamps and handwritten notes about contrast." decoding="async" />
              <span className="cmp-tag cmp-tag-b" aria-hidden="true">Before</span><span className="cmp-tag cmp-tag-a" aria-hidden="true">After</span>
              <span className="cmp-line" aria-hidden="true"></span>
              <input type="range" min="0" max="100" defaultValue={100} aria-label="Divider position between before and after" />
            </div>
            <div className="panel-text">
              <p className="panel-line">Feedback pinned to the pixel it is about, not paragraph four of a message.</p>
              <p className="panel-tools">Spotlight, highlighter, stamps, text.</p>
            </div>
          </div>
          </div>
        </div>
      </section>
      
      
      <section className="privacy" id="privacy" aria-labelledby="privacy-h">
        <div className="wrap privacy-grid">
          <div className="privacy-copy">
            <h2 id="privacy-h">Nothing is uploaded. Your screenshots stay on your device.</h2>
            <p>There is no upload to trust, because there is no server that handles images. Pasting, drawing, blurring and exporting all happen on your device.</p>
            <ul className="facts">
              <li><strong>No account.</strong> Nothing to sign up for, nothing to log in to.</li>
              <li><strong>One optional counter.</strong> The site counts anonymous page views with Google Analytics. It never sees an image, and Settings has an off switch.</li>
              <li><strong>Open source, MIT.</strong> You do not have to take our word for any of this.</li>
            </ul>
            <a className="btn btn-ghost" href="https://github.com/kdkumawat/snapty">
              <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" className="fill"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              Read the source on GitHub
            </a>
          </div>
      
          <figure className="net" id="net">
            <figcaption>Network activity while a screenshot was pasted, blurred, annotated, copied and exported</figcaption>
            <div className="net-scroll">
              <table>
                <thead><tr><th scope="col">Request</th><th scope="col">Type</th><th scope="col" className="num">Sent</th></tr></thead>
                <tbody>
                  <tr><td>blob: pasted screenshot <span className="dim">(read from memory)</span></td><td>image</td><td className="num">0 B</td></tr>
                  <tr><td>editor-canvas.js</td><td>script</td><td className="num">0 B</td></tr>
                  <tr><td>konva.js</td><td>script</td><td className="num">0 B</td></tr>
                  <tr><td>annotation-clipboard.js</td><td>script</td><td className="num">0 B</td></tr>
                  <tr><td>6 more chunks of the editor&apos;s own code</td><td>script</td><td className="num">0 B</td></tr>
                  <tr><td>Excalifont-Regular.woff2</td><td>font</td><td className="num">0 B</td></tr>
                </tbody>
              </table>
            </div>
            <dl className="net-sum">
              <div><dt>Requests</dt><dd>11</dd></div>
              <div><dt>To another server</dt><dd>0</dd></div>
              <div className="net-zero"><dt>Image bytes uploaded</dt><dd>0<Mark name="circle" className="mark mark-zero" viewBox="0 0 240 88" stretch /></dd></div>
            </dl>
            <p className="net-foot">Measured in a real browser: every request made after pasting an image, with its size. Check it yourself: open DevTools, watch the Network tab, and paste a screenshot.</p>
          </figure>
        </div>
      </section>
      
      
      <section className="close" aria-labelledby="close-h">
        <div className="wrap close-in">
          <h2 id="close-h">Your next screenshot is probably already on the clipboard.</h2>
          <div className="close-act">
            <span className="note note-close" aria-hidden="true">opens instantly</span>
            <Mark name="ctaArrow" className="mark mark-close" viewBox="0 0 160 84" />
            <Link className="btn btn-lg" href="/editor">Open the editor</Link>
          </div>
        </div>
      </section>
      
      </main>
      
      <footer className="foot">
        <div className="wrap foot-in">
          <a className="brand" href="#top" aria-label="Snapty, back to top">
            <img src="/logo.svg" width="24" height="24" alt="" />
            <span>Snapty</span>
          </a>
          <p>Free and open source under the MIT licence.</p>
          <nav aria-label="Footer">
            <Link href="/guide">Guide</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="https://github.com/kdkumawat/snapty">GitHub</a>
          </nav>
        </div>
      </footer>
      
      
    </div>
  );
}
