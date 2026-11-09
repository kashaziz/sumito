"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { Difficulty } from "../../lib/game/ai";
import { DIRECTIONS, PLAYER_NAMES, SETUPS, type MoveRecord, type Scores, type SetupId } from "../../lib/game/engine";
import { PUZZLES, type PuzzleId } from "../../lib/game/puzzles";
import { DIRECTION_GLYPHS } from "../../lib/game/ui";
import { Icon } from "./icons";
import { getMotionScale } from "./motion";

export type GameMode = "local" | "computer" | "puzzle" | "tutorial";
export type SheetName = "match" | "review" | "menu" | "result" | "rules";

type SheetProps = {
  open: boolean;
  /** Wide drawer on desktop, for content that should fit without scrolling. */
  wide?: boolean;
  /** Centred card on desktop (bottom sheet on phones), for short moments like a result. */
  center?: boolean;
  label: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
};

/** Bottom sheet on phones, side drawer on desktop. Uses a native modal dialog for focus and Esc handling. */
export function Sheet({ open, wide = false, center = false, label, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  // The slide-in runs once per opening. Tying it to a class (not to [open]) stops it replaying
  // when a rotation switches the sheet between bottom-sheet and drawer layouts.
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setEntering(true);
      dialog.showModal();
      // showModal focuses the first button, which may scroll a long sheet; always start at the top.
      dialog.scrollTop = 0;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 190 * getMotionScale());
  }, [onClose]);

  return <dialog
    ref={ref}
    className={`sheet${wide ? " is-wide" : ""}${center ? " is-center" : ""}${entering ? " is-entering" : ""}${closing ? " is-closing" : ""}`}
    aria-label={label}
    onAnimationEnd={(event) => { if (event.target === event.currentTarget && !event.pseudoElement) setEntering(false); }}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div className="sheet-body">
      <div className="sheet-grab" aria-hidden="true" />
      <button type="button" className="sheet-close" onClick={close} aria-label="Close" data-tip="Close"><Icon name="close" /></button>
      {children(close)}
    </div>
  </dialog>;
}

const difficultyLabel: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const modeCards: { mode: Exclude<GameMode, "tutorial">; icon: string; title: string; note: string }[] = [
  { mode: "local", icon: "👥", title: "Pass and play", note: "Two players, one device" },
  { mode: "computer", icon: "🤖", title: "Vs computer", note: "It explains every move" },
  { mode: "puzzle", icon: "🧩", title: "Puzzles", note: "Three short tactics" },
];

export type MatchChoice = { mode: Exclude<GameMode, "tutorial">; setupId: SetupId; difficulty: Difficulty; puzzleId: PuzzleId };

type Settings = {
  reduceMotion: boolean;
  showPad: boolean;
  sound: boolean;
  onReduceMotion: (value: boolean) => void;
  onShowPad: (value: boolean) => void;
  onSound: (value: boolean) => void;
};
type MatchSheetProps = { initial: MatchChoice; onStart: (choice: MatchChoice) => void; settings: Settings };

export function MatchSheetContent({ initial, onStart, settings }: MatchSheetProps) {
  const [choice, setChoice] = useState(initial);
  const update = (patch: Partial<MatchChoice>) => setChoice((current) => ({ ...current, ...patch }));
  return <>
    <h2 className="sheet-title">New match</h2>
    {/* Two columns in landscape so Start stays visible without scrolling. */}
    <div className="match-grid">
    <div className="match-col">
    <div className="mode-cards" role="radiogroup" aria-label="Mode">
      {modeCards.map((card) => <button
        type="button"
        role="radio"
        aria-checked={choice.mode === card.mode}
        className={choice.mode === card.mode ? "is-on" : ""}
        onClick={() => update({ mode: card.mode })}
        key={card.mode}
      >
        <span aria-hidden="true">{card.icon}</span>
        <span><b>{card.title}</b><small>{card.note}</small></span>
      </button>)}
    </div>
    </div>
    <div className="match-col">
    {choice.mode === "computer" && <ChipGroup label="Difficulty" value={choice.difficulty} options={Object.entries(difficultyLabel) as [Difficulty, string][]} onChange={(difficulty) => update({ difficulty })} />}
    {choice.mode === "puzzle"
      ? <ChipGroup label="Puzzle" value={choice.puzzleId} options={Object.values(PUZZLES).map((puzzle) => [puzzle.id, `${puzzle.name} · ${puzzle.level}`] as [PuzzleId, string])} onChange={(puzzleId) => update({ puzzleId })} />
      : <ChipGroup label="Opening" value={choice.setupId} options={Object.values(SETUPS).map((setup) => [setup.id, setup.name] as [SetupId, string])} onChange={(setupId) => update({ setupId })} />}
    <button type="button" className="sheet-primary" onClick={() => onStart(choice)}>Start</button>
    </div>
    </div>
    <SettingsToggles {...settings} />
  </>;
}

function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div className="chip-group">
    <span className="chip-label" id={`chips-${label}`}>{label}</span>
    <div className="chips" role="radiogroup" aria-labelledby={`chips-${label}`}>
      {options.map(([optionValue, text]) => <button
        type="button"
        role="radio"
        aria-checked={value === optionValue}
        className={value === optionValue ? "is-on" : ""}
        onClick={() => onChange(optionValue)}
        key={optionValue}
      >{text}</button>)}
    </div>
  </div>;
}

type ReviewProps = {
  moveLog: MoveRecord[];
  reviewIndex: number | null;
  onSeek: (index: number | null) => void;
  onShare: () => void;
};

export function ReviewSheetContent({ moveLog, reviewIndex, onSeek, onShare }: ReviewProps) {
  const [, startTransition] = useTransition();
  const shown = reviewIndex ?? moveLog.length;
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: getMotionScale() ? "smooth" : "auto" });
  }, [shown]);
  return <>
    <h2 className="sheet-title">Move review <small>{moveLog.length ? `Move ${shown} of ${moveLog.length}` : "No moves yet"}</small></h2>
    <div className="review-scrub">
      <button type="button" aria-label="Previous move" disabled={shown === 0} onClick={() => onSeek(Math.max(0, shown - 1))}>‹</button>
      <input
        type="range"
        min={0}
        max={moveLog.length}
        value={shown}
        disabled={!moveLog.length}
        aria-label="Move"
        onChange={(event) => { const next = Number(event.target.value); startTransition(() => onSeek(next === moveLog.length ? null : next)); }}
      />
      <button type="button" aria-label="Next move" disabled={shown >= moveLog.length} onClick={() => onSeek(shown + 1 >= moveLog.length ? null : shown + 1)}>›</button>
    </div>
    {moveLog.length > 0 && <div className="move-chips">
      {moveLog.map((record, offset) => {
        const index = offset + 1;
        return <button
          type="button"
          className={`${index === shown ? "is-on" : ""} ${record.player}`}
          ref={index === shown ? activeRef : undefined}
          onClick={() => onSeek(index === moveLog.length ? null : index)}
          aria-label={`Move ${index}, ${PLAYER_NAMES[record.player]} ${DIRECTIONS[record.direction].label}${record.captured ? ", captured" : ""}`}
          key={index}
        >{index} {DIRECTION_GLYPHS[record.direction]}{record.captured ? " ●" : ""}</button>;
      })}
    </div>}
    <div className="sheet-actions sheet-actions-two">
      <button type="button" onClick={() => onSeek(null)} disabled={reviewIndex === null}>Back to live</button>
      <button type="button" onClick={onShare} disabled={!moveLog.length}>Share ↗</button>
    </div>
  </>;
}

type MenuProps = { onTutorial: () => void; settings: Settings };

export function MenuSheetContent({ onTutorial, settings }: MenuProps) {
  return <>
    <h2 className="sheet-title">Menu</h2>
    <nav className="menu-links" aria-label="Main navigation">
      <button type="button" onClick={onTutorial}><Icon name="learn" /><span><b>Tutorial</b><small>Learn by playing on the real board</small></span></button>
      <a href="/learn"><Icon name="help" /><span><b>Learn and strategy</b><small>Rules, ideas, and openings</small></span></a>
      <a href="/about"><Icon name="info" /><span><b>About Sumito</b><small>The game, credits, and disclaimer</small></span></a>
      <a href="/privacy"><Icon name="privacy" /><span><b>Privacy</b><small>No accounts, no tracking</small></span></a>
      <a href="https://github.com/kashaziz/sumito" target="_blank" rel="noopener"><Icon name="code" /><span><b>Source code</b><small>Open source on GitHub (MIT)</small></span></a>
    </nav>
    <SettingsToggles {...settings} />
  </>;
}

function SettingsToggles({ reduceMotion, showPad, sound, onReduceMotion, onShowPad, onSound }: Settings) {
  return <div className="menu-toggles">
    <span className="chip-label">Settings</span>
    <label><input type="checkbox" checked={sound} onChange={(event) => onSound(event.target.checked)} /> Sound effects</label>
    <label><input type="checkbox" checked={reduceMotion} onChange={(event) => onReduceMotion(event.target.checked)} /> Reduce motion</label>
    <label><input type="checkbox" checked={showPad} onChange={(event) => onShowPad(event.target.checked)} /> Show direction buttons</label>
  </div>;
}

export type ResultAction = { label: string; primary?: boolean; onClick: () => void };
type ResultProps = { title: string; subtitle: string; celebrate: boolean; scores: Scores; actions: ResultAction[] };

/** End-of-game panel: centred headline and score, then the next actions. */
export function ResultSheetContent({ title, subtitle, celebrate, scores, actions }: ResultProps) {
  const leader = scores.black === scores.white ? null : scores.black > scores.white ? "black" : "white";
  // Win = lime and a pop; loss = orange (the "attention" accent) and a gentle settle.
  return <div className={`result ${celebrate ? "is-celebrating" : "is-loss"}`}>
    <h2 className="result-title">{title}</h2>
    <p className="result-score" aria-label={`Onyx ${scores.black}, Pearl ${scores.white}`}>
      <span className="mini-marble black" /><b className={leader === "black" ? "is-leader" : ""}>{scores.black}</b><span className="result-dash">–</span><b className={leader === "white" ? "is-leader" : ""}>{scores.white}</b><span className="mini-marble white" />
    </p>
    <p className="result-sub">{subtitle}</p>
    <div className={`sheet-actions${actions.length === 2 ? " sheet-actions-two" : ""}`}>
      {actions.map((action) => <button type="button" className={action.primary ? "sheet-primary" : ""} onClick={action.onClick} key={action.label}>{action.label}</button>)}
    </div>
  </div>;
}
