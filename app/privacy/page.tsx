import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../game/icons";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Privacy — Sumito",
  description: "Sumito has no accounts, no ads, and no tracking. This page lists exactly what is stored and which services are involved.",
};

export default function PrivacyPage() {
  return <main className="lp">
    <header className="lp-nav">
      <Link className="lp-brand" href="/">Sumito</Link>
      <Link className="lp-button is-primary" href="/"><Icon name="play" />Play now</Link>
    </header>

    <section className="lp-hero">
      <span className="lp-eyebrow">Privacy</span>
      <h1>No accounts.<br />No tracking.</h1>
      <p>Sumito does not ask who you are, does not show ads, and does not use analytics or tracking cookies. Effective 9 November 2026.</p>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="device-title">
      <span className="lp-eyebrow">On your device</span>
      <h2 id="device-title">What the game stores</h2>
      <p>The game saves a few small items in your browser’s local storage. They never leave your device, and you can clear them at any time in your browser settings:</p>
      <ul>
        <li>Your settings: sound effects, reduce motion, and direction buttons.</li>
        <li>Which first-time tips you have already seen.</li>
        <li>The match type you chose last.</li>
        <li>Your last 20 finished matches, so they stay on this device.</li>
      </ul>
      <p>A service worker also keeps a copy of the game files, so the game loads fast and works offline.</p>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="services-title">
      <span className="lp-eyebrow">Services</span>
      <h2 id="services-title">Who else is involved</h2>
      <ul>
        <li><strong>Cloudflare</strong> hosts the game. Like any web host, it receives your IP address and browser details to deliver the pages and protect the site. See the <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare privacy policy</a>.</li>
        <li><strong>Google Fonts</strong> serves the title fonts. Your browser requests them from Google, which receives your IP address. See the <a href="https://developers.google.com/fonts/faq/privacy" target="_blank" rel="noopener">Google Fonts privacy FAQ</a>.</li>
        <li><strong>GitHub</strong> is involved only if you follow a link to the source code.</li>
      </ul>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="share-title">
      <span className="lp-eyebrow">Sharing</span>
      <h2 id="share-title">Shared replay links</h2>
      <p>When you share a match, the link contains only the opening and the list of moves. It contains no name or other personal data. Anyone with the link can view that replay.</p>
    </section>

    <section className="lp-section lp-prose" aria-labelledby="contact-title">
      <span className="lp-eyebrow">Contact</span>
      <h2 id="contact-title">Questions and changes</h2>
      <p>If the game later adds accounts or online play, this page will change first and will list the new data. Questions: open an issue on <a href="https://github.com/kashaziz/sumito/issues" target="_blank" rel="noopener">GitHub</a> or get in touch through <a href="https://kashifaziz.me" target="_blank" rel="noopener">kashifaziz.me</a>.</p>
    </section>

    <SiteFooter />
  </main>;
}
