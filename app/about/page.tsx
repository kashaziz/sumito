import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../game/icons";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "About Sumito — an open-source hexagon strategy game",
  description: "What Sumito is, who made it, how it is built, and its relationship to the board game Abalone.",
};

export default function AboutPage() {
  return <main className="lp">
    <header className="lp-nav">
      <Link className="lp-brand" href="/">Sumito</Link>
      <Link className="lp-button is-primary" href="/"><Icon name="play" />Play now</Link>
    </header>

    <section className="lp-hero">
      <span className="lp-eyebrow">About</span>
      <h1>A free game of<br />push and position.</h1>
      <p>Sumito is a two-player strategy game on a hexagon board. Move lines of up to three marbles, outnumber your rival to push, and be the first to push six of their marbles off the edge.</p>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="what-title">
      <span className="lp-eyebrow">The game</span>
      <h2 id="what-title">What you can do</h2>
      <ul>
        <li><strong>Play a friend</strong> on one device, or <strong>play the computer</strong> at three levels. The computer explains its moves.</li>
        <li><strong>Learn</strong> with a one-minute tutorial on the real board, hints, and three short puzzles.</li>
        <li><strong>Review</strong> any match move by move, and share the replay with one link.</li>
        <li>Play on a phone in portrait or landscape, on a tablet, or on a desktop. It also works offline once loaded.</li>
      </ul>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="open-title">
      <span className="lp-eyebrow">Open source</span>
      <h2 id="open-title">Built in the open</h2>
      <p>Sumito is open source under the <strong>MIT licence</strong>. The code, rules engine, tests, and a small Python research environment are on <a href="https://github.com/kashaziz/sumito" target="_blank" rel="noopener">GitHub</a>. Bug reports, ideas, and pull requests are welcome.</p>
      <p>It is built with React and <a href="https://github.com/cloudflare/vinext" target="_blank" rel="noopener">vinext</a>, and runs on Cloudflare Workers. Sounds are made in the browser, and all artwork is drawn with CSS and SVG.</p>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="credits-title">
      <span className="lp-eyebrow">Credits</span>
      <h2 id="credits-title">Who made it</h2>
      <p>Designed and developed by <a href="https://kashifaziz.me" target="_blank" rel="noopener">Kashif Aziz</a>.</p>
      <p>Title fonts: <strong>Cinzel</strong> and <strong>Cinzel Decorative</strong> by Natanael Gama, served by Google Fonts under the SIL Open Font License.</p>
    </section>

    <section className="lp-section lp-prose" id="disclaimer" aria-labelledby="disclaimer-title">
      <span className="lp-eyebrow">Disclaimer</span>
      <h2 id="disclaimer-title">Inspired by Abalone</h2>
      <div className="lp-note">
        <p>Sumito is an independent, open-source game inspired by the board game <strong>Abalone</strong>, designed by Michel Lalet and Laurent Lévi (1987). Abalone is a trademark of its respective owner.</p>
        <p>Sumito is <strong>not affiliated with, endorsed by, or sponsored by</strong> the Abalone trademark owner or publisher. All code, artwork, sounds, and text in Sumito are original.</p>
      </div>
      <p>The name comes from <em>sumito</em>, the term players use for a push made with more marbles than the opponent.</p>
    </section>

    <SiteFooter />
  </main>;
}
