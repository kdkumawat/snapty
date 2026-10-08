import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import "@/components/landing/landing.css";

/**
 * Shell for /guide and /privacy. Reuses the landing's `.lp` surface (its own
 * scroll container, fonts, tokens, light and dark) plus the same nav and
 * footer; `.doc` rules in globals.css set the reading measure.
 */
export default function ContentPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp">
      <header className="nav is-stuck">
        <div className="wrap nav-in">
          <Link className="brand" href="/" aria-label="Snapty home">
            <img src="/logo.svg" width="30" height="30" alt="" />
            <span>Snapty</span>
          </Link>
          <nav className="nav-links" aria-label="Pages">
            <Link href="/guide">Guide</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <div className="nav-act">
            <ThemeToggle className="nav-btn" />
            <Link className="btn btn-sm" href="/editor">Open the editor</Link>
          </div>
        </div>
      </header>
      <main id="main" className="wrap doc">{children}</main>
      <footer className="foot">
        <div className="wrap foot-in">
          <Link className="brand" href="/" aria-label="Snapty home">
            <img src="/logo.svg" width="24" height="24" alt="" />
            <span>Snapty</span>
          </Link>
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
