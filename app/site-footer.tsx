import Link from "next/link";

/** Footer for the content pages (/learn, /about, /privacy). */
export function SiteFooter() {
  return <footer className="lp-footer">
    <Link className="lp-button is-primary" href="/">Back to the board</Link>
    <nav className="lp-footer-links" aria-label="Site">
      <Link href="/learn">Learn</Link>
      <Link href="/about">About</Link>
      <Link href="/privacy">Privacy</Link>
      <a href="https://github.com/kashaziz/sumito" target="_blank" rel="noopener">GitHub</a>
    </nav>
    <p>© {new Date().getFullYear()} Sumito · Developed by <a href="https://kashifaziz.me" target="_blank" rel="noopener">Kashif Aziz</a> · MIT licence</p>
  </footer>;
}
