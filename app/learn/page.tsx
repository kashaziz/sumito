import type { Metadata } from "next";
import Link from "next/link";
import { SETUPS } from "../../lib/game/engine";
import { Icon, type IconName } from "../game/icons";
import { RulesCards } from "../game/rules";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Learn Sumito — Rules, hints and strategy",
  description: "Learn the hexagonal game of push and position: how lines move, how pushes work, and three ideas to play by.",
};

const helpers: { icon: IconName; title: string; text: string }[] = [
  { icon: "hint", title: "Ask for a hint", text: "The engine picks a good move and says why: it captures, builds pressure, takes the centre, joins a group, or leaves the edge." },
  { icon: "review", title: "Review every turn", text: "Scrub back and forward through a match without changing the live game. Share the exact replay with one link." },
  { icon: "puzzle", title: "Train a tactic", text: "Three short puzzles teach edge pressure, the power of three, and reading the diagonals." },
];

const ideas = [
  { title: "Stay connected", text: "A compact group has more moves and fewer weak edges. Lonely marbles get pushed." },
  { title: "Own the middle", text: "Central marbles can move in six directions. Edge marbles are one push from danger." },
  { title: "Count before you push", text: "Three beats two. Two beats one. Equal lines never move each other." },
];

export default function LearnPage() {
  return <main className="lp">
    <header className="lp-nav">
      <Link className="lp-brand" href="/">Sumito</Link>
      <Link className="lp-button is-primary" href="/"><Icon name="play" />Play now</Link>
    </header>

    <section className="lp-hero">
      <span className="lp-eyebrow">The hexagon duel</span>
      <h1>Hold the centre.<br />Move as one.</h1>
      <p>Sumito is a game of push and position for two players. Slide lines of up to three marbles, outnumber your rival, and be the first to push six of their marbles off the edge.</p>
      <div className="lp-actions">
        <Link className="lp-button is-primary" href="/"><Icon name="play" />Play now</Link>
        <Link className="lp-button" href="/?tutorial=1"><Icon name="learn" />1-minute tutorial</Link>
      </div>
    </section>

    <section className="lp-section" aria-labelledby="rules-title">
      <span className="lp-eyebrow">Rules</span>
      <h2 id="rules-title">How to play</h2>
      <div className="lp-rules"><RulesCards ids="learn-rules" /></div>
    </section>

    <section className="lp-section" aria-labelledby="ideas-title">
      <span className="lp-eyebrow">Strategy</span>
      <h2 id="ideas-title">Three ideas to play by</h2>
      <ol className="lp-ideas">
        {ideas.map((idea, index) => <li key={idea.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{idea.title}</h3><p>{idea.text}</p></li>)}
      </ol>
    </section>

    <section className="lp-section" aria-labelledby="helpers-title">
      <span className="lp-eyebrow">Built-in coach</span>
      <h2 id="helpers-title">Learn while you play</h2>
      <div className="lp-cards">
        {helpers.map((helper) => <article key={helper.title}><span className="lp-icon"><Icon name={helper.icon} /></span><h3>{helper.title}</h3><p>{helper.text}</p></article>)}
      </div>
      <div className="lp-actions">
        <Link className="lp-button" href="/?puzzle=edge-push"><Icon name="puzzle" />Try a puzzle</Link>
      </div>
    </section>

    <section className="lp-section" aria-labelledby="openings-title">
      <span className="lp-eyebrow">Openings</span>
      <h2 id="openings-title">Three ways to start</h2>
      <div className="lp-cards">
        {Object.values(SETUPS).map((setup) => <article key={setup.id}><h3>{setup.name}</h3><p>{setup.note}</p></article>)}
      </div>
    </section>

    <SiteFooter />
  </main>;
}
