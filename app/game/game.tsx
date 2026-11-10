"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isDifficulty, reasonText, type Difficulty, type MoveReason } from "../../lib/game/ai";
import {
  CELLS,
  DIRECTIONS,
  PLAYER_NAMES,
  SETUPS,
  applyMove as applyEngineMove,
  createInitialBoard,
  createMoveRecord,
  getWinner,
  isInside,
  isValidGroup,
  keyOf,
  legalMoves,
  otherPlayer,
  parseCoord,
  parseGame,
  replayGame,
  same,
  serializeGame,
  type Board,
  type Coord,
  type GameRecord,
  type LegalMove,
  type MoveRecord,
  type Player,
  type Scores,
  type SetupId,
} from "../../lib/game/engine";
import { PUZZLES, solvesPuzzle, type PuzzleId } from "../../lib/game/puzzles";
import { DIRECTION_GLYPHS, motionPlan } from "../../lib/game/ui";
import { GameBoard, type BoardMotion, type BoardShake } from "./board";
import { MOTION_STORAGE_KEY, applyReducedMotion, getMotionScale, vibrate } from "./motion";
import { MatchSheetContent, MenuSheetContent, ResultSheetContent, ReviewSheetContent, Sheet, type GameMode, type MatchChoice, type ResultAction, type SheetName } from "./sheets";
import { celebrate } from "./celebrate";
import { Icon } from "./icons";
import { SOUND_STORAGE_KEY, playSound, setSoundEnabled } from "./sound";
import { RulesCards } from "./rules";
import { useAi } from "./use-ai";

type UiSnapshot = { board: Board; currentPlayer: Player; scores: Scores; moveCount: number; lastMove: string };
type CoachId = "select" | "target" | "push";

const AI_MIN_THINK_MS = 350;
const PAD_STORAGE_KEY = "sumito-show-pad";
const COACH_STORAGE_KEY = "sumito-coach-seen";
const LAST_MATCH_STORAGE_KEY = "sumito-last-match";
const describeReasons = (reasons: MoveReason[]) => reasons.map((reason) => reasonText[reason]).join(" and ");

const coachText: Record<CoachId, string> = {
  select: "Tap a marble with a green dot — or drag across up to 3",
  target: "Tap a glowing dot, or swipe the line to move",
  push: "Outnumber them to push: 3 beats 2, 2 beats 1",
};

const boardOf = (black: Coord[], white: Coord[]): Board => {
  const board: Board = {};
  black.forEach((coord) => { board[keyOf(coord)] = "black"; });
  white.forEach((coord) => { board[keyOf(coord)] = "white"; });
  return board;
};
const TUTORIAL_STEPS = [
  { title: "Tap a marble with a green dot", board: () => boardOf([{ q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 2 }], [{ q: 0, r: -2 }, { q: 1, r: -2 }]) },
  { title: "Tap a neighbour to make a line. Lines hold up to 3." },
  { title: "Tap a glowing dot — or swipe the line — to move" },
  { title: "3 beats 2. Push a Pearl marble off the edge.", board: () => ({ ...PUZZLES["two-line"].board }) },
];

function encodeSharedGame(record: GameRecord) {
  const bytes = new TextEncoder().encode(serializeGame(record));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeSharedGame(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Device storage is optional; play never depends on it.
  }
}

let motionCounter = 0;

export function Game() {
  const requestAi = useAi();
  const [setupId, setSetupId] = useState<SetupId>("standard");
  const [mode, setMode] = useState<GameMode>("local");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [puzzleId, setPuzzleId] = useState<PuzzleId>("edge-push");
  const [board, setBoard] = useState<Board>(() => createInitialBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>("black");
  const [selected, setSelected] = useState<Coord[]>([]);
  const [scores, setScores] = useState<Scores>({ black: 0, white: 0 });
  const [history, setHistory] = useState<UiSnapshot[]>([]);
  const [moveLog, setMoveLog] = useState<MoveRecord[]>([]);
  const [lastMove, setLastMove] = useState("Onyx opens the match.");
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [hintPending, setHintPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  // false = title screen: the board is shown but inactive until the player picks a match.
  const [started, setStarted] = useState(false);
  const [matchPreset, setMatchPreset] = useState<MatchChoice["mode"] | null>(null);
  const [motion, setMotion] = useState<BoardMotion | null>(null);
  const [shake, setShake] = useState<BoardShake | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [sound, setSound] = useState(true);
  const [coachSeen, setCoachSeen] = useState<Record<CoachId, boolean>>({ select: true, target: true, push: true });

  const reviewing = reviewIndex !== null;
  const liveWinner = mode === "tutorial" ? null : getWinner(scores);
  const reviewState = useMemo(
    () => reviewIndex === null ? null : replayGame(setupId, moveLog, reviewIndex),
    [setupId, moveLog, reviewIndex],
  );
  const shownBoard = reviewState?.board ?? board;
  const shownScores = reviewState?.scores ?? scores;
  const shownPlayer = reviewState?.currentPlayer ?? currentPlayer;
  const shownWinner = getWinner(shownScores);
  const humanCanMove = started && !reviewing && !aiThinking && !hintPending && !liveWinner && (mode !== "computer" || currentPlayer === "black");

  const moves = useMemo(
    () => humanCanMove ? legalMoves(board, selected, currentPlayer) : [],
    [board, selected, currentPlayer, humanCanMove],
  );
  const moveTargets = useMemo(() => {
    const targets = new Map<string, LegalMove>();
    // Inline moves list the line's own cells as destinations; those cells stay tappable to deselect.
    const own = new Set(selected.map(keyOf));
    moves.forEach((move) => {
      move.destinations.forEach((coord) => { if (isInside(coord) && !own.has(keyOf(coord))) targets.set(keyOf(coord), move); });
      move.opponents.forEach((coord) => targets.set(keyOf(coord), move));
    });
    return targets;
  }, [moves, selected]);
  // Playable marbles depend only on the position, so compute them once per turn, not per cell per render.
  const playable = useMemo(() => {
    if (!humanCanMove) return new Set<string>();
    return new Set(CELLS
      .filter((coord) => board[keyOf(coord)] === currentPlayer && legalMoves(board, [coord], currentPlayer).length > 0)
      .map(keyOf));
  }, [board, currentPlayer, humanCanMove]);

  // Delayed UI actions (tutorial steps, the result sheet) and in-flight hints belong to one game.
  // Starting a new game, going home or undoing cancels them, so they never act on a game that moved on.
  const timersRef = useRef<number[]>([]);
  const generationRef = useRef(0);
  const later = useCallback((action: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timer) => timer !== id);
      action();
    }, delay);
    timersRef.current.push(id);
  }, []);
  const cancelPending = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    generationRef.current += 1;
  }, []);

  const resetMatchState = useCallback(() => {
    cancelPending();
    setSelected([]);
    setNotice(null);
    setHistory([]);
    setMoveLog([]);
    setReviewIndex(null);
    setAiThinking(false);
    setMotion(null);
    setConfirmRestart(false);
  }, [cancelPending]);

  const startGame = useCallback((nextSetup: SetupId = setupId) => {
    resetMatchState();
    setBoard(createInitialBoard(nextSetup));
    setCurrentPlayer("black");
    setScores({ black: 0, white: 0 });
    setLastMove(`Fresh ${SETUPS[nextSetup].name} board. Onyx opens.`);
  }, [setupId, resetMatchState]);

  const startPuzzle = useCallback((nextPuzzle: PuzzleId = puzzleId) => {
    const puzzle = PUZZLES[nextPuzzle];
    resetMatchState();
    setBoard({ ...puzzle.board });
    setCurrentPlayer(puzzle.currentPlayer);
    setScores({ ...puzzle.scores });
    setNotice(puzzle.goal);
    setLastMove(`${puzzle.level} puzzle. ${puzzle.goal}`);
  }, [puzzleId, resetMatchState]);

  const startTutorial = useCallback((step = 0) => {
    resetMatchState();
    setStarted(true);
    setMode("tutorial");
    setTutorialStep(step);
    setBoard(TUTORIAL_STEPS[step].board?.() ?? TUTORIAL_STEPS[0].board!());
    setCurrentPlayer("black");
    setScores(step === 3 ? { ...PUZZLES["two-line"].scores } : { black: 0, white: 0 });
    setLastMove(`Tutorial step ${step + 1} of 4. ${TUTORIAL_STEPS[step].title}`);
  }, [resetMatchState]);

  const markCoach = useCallback((id: CoachId) => {
    setCoachSeen((current) => {
      if (current[id]) return current;
      const next = { ...current, [id]: true };
      writeStorage(COACH_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const commitMove = useCallback((moving: Coord[], move: LegalMove, reasons: MoveReason[] = []) => {
    const snapshot: UiSnapshot = { board: { ...board }, currentPlayer, scores: { ...scores }, moveCount: moveLog.length, lastMove };
    const result = applyEngineMove(board, moving, currentPlayer, scores, move);
    const record = createMoveRecord(moving, move, currentPlayer, result.captured);
    const animated = getMotionScale() > 0;
    setMotion({ id: ++motionCounter, plan: motionPlan(move), player: currentPlayer, animated });
    setHistory((items) => [...items, snapshot]);
    setBoard(result.board);
    setScores(result.scores);
    setMoveLog((items) => [...items, record]);
    setSelected([]);
    setNotice(null);
    setReviewIndex(null);
    markCoach("target");
    if (move.opponents.length) markCoach("push");
    vibrate(8);
    playSound(result.captured ? "capture" : "move");

    const reason = reasons.length ? ` — ${describeReasons(reasons)}` : "";
    setLastMove(result.captured
      ? `${PLAYER_NAMES[currentPlayer]} pushed a marble off the board${reason}.`
      : `${PLAYER_NAMES[currentPlayer]} moved ${move.direction.label}${reason}.`);

    if (mode === "tutorial") {
      // The learner keeps the move; Pearl never replies during the tutorial.
      setCurrentPlayer("black");
      if (tutorialStep < 3) {
        later(() => startTutorial(3), animated ? 450 : 0);
      } else if (result.captured) {
        later(() => {
          setToast("Tutorial complete — you are ready.");
          setMode("local");
          startGame("standard");
        }, animated ? 700 : 0);
      } else {
        later(() => {
          startTutorial(3);
          setNotice("Not yet. Use all three marbles in a line.");
        }, animated ? 700 : 0);
      }
      return;
    }

    setCurrentPlayer(otherPlayer(currentPlayer));
    if (mode === "computer" && currentPlayer === "black") setAiThinking(true);
    // End of game (or a solved puzzle): wait for the fall to finish, then celebrate and show the result.
    const winner = getWinner(result.scores);
    const showResult = mode === "puzzle" ? solvesPuzzle(PUZZLES[puzzleId], currentPlayer, result.captured) : Boolean(winner);
    if (showResult) {
      const humanLost = mode === "computer" && winner === "white";
      later(() => {
        playSound(humanLost ? "lose" : "win");
        if (!humanLost) celebrate();
        openSheet("result");
      }, animated ? 650 : 0);
    }
  }, [board, currentPlayer, scores, moveLog.length, lastMove, mode, puzzleId, tutorialStep, markCoach, startTutorial, startGame, later]);

  // On rotation the layout jumps between portrait and landscape. Pause CSS transitions for a moment,
  // so nothing (score marker, board, buttons) slides diagonally between its old and new place.
  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    let timer = 0;
    const onRotate = () => {
      document.documentElement.dataset.rotating = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { delete document.documentElement.dataset.rotating; }, 450);
    };
    query.addEventListener("change", onRotate);
    return () => {
      query.removeEventListener("change", onRotate);
      window.clearTimeout(timer);
    };
  }, []);

  const commitRef = useRef(commitMove);
  useLayoutEffect(() => { commitRef.current = commitMove; }, [commitMove]);

  // Load settings and deep links once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const replay = params.get("replay");
    const puzzle = params.get("puzzle") as PuzzleId | null;
    const tutorial = params.get("tutorial");
    queueMicrotask(() => {
      const reduced = readStorage(MOTION_STORAGE_KEY, false);
      setReduceMotion(reduced);
      applyReducedMotion(reduced);
      setShowPad(readStorage(PAD_STORAGE_KEY, false));
      const soundOn = readStorage(SOUND_STORAGE_KEY, true);
      setSound(soundOn);
      setSoundEnabled(soundOn);
      setCoachSeen(readStorage(COACH_STORAGE_KEY, { select: false, target: false, push: false }));
      if (replay) {
        try {
          const record = parseGame(decodeSharedGame(replay));
          const state = replayGame(record.setup, record.moves);
          setSetupId(record.setup);
          setMode("local");
          setBoard(state.board);
          setScores(state.scores);
          setCurrentPlayer(state.currentPlayer);
          setMoveLog(record.moves);
          setHistory([]);
          setLastMove(`Shared match loaded. ${record.moves.length} moves.`);
          setReviewIndex(record.moves.length);
          setStarted(true);
          setSheet("review");
        } catch {
          setToast("That shared match link is invalid or incomplete.");
        }
      } else if (puzzle && Object.hasOwn(PUZZLES, puzzle)) {
        setMode("puzzle");
        setPuzzleId(puzzle);
        setStarted(true);
        startPuzzle(puzzle);
      } else if (tutorial) {
        startTutorial(0);
      } else {
        // Title screen: preselect the match type the player chose last, but do not start it.
        const last = readStorage<MatchChoice | null>(LAST_MATCH_STORAGE_KEY, null);
        if (last && ["local", "computer", "puzzle"].includes(last.mode) && Object.hasOwn(SETUPS, last.setupId) && Object.hasOwn(PUZZLES, last.puzzleId)) {
          setMode(last.mode);
          setSetupId(last.setupId);
          setDifficulty(isDifficulty(last.difficulty) ? last.difficulty : "medium");
          setPuzzleId(last.puzzleId);
          setBoard(createInitialBoard(last.setupId));
        }
      }
    });
    // Deep links are read once on first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computer reply: reuse one worker, and never answer faster than a human can follow.
  useEffect(() => {
    if (mode !== "computer" || currentPlayer !== "white" || liveWinner || reviewing) return;
    let cancelled = false;
    let timer = 0;
    const started = performance.now();
    requestAi({ board, scores, player: "white", difficulty }).then((choice) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (choice) {
          commitRef.current(choice.move.selected, choice.move, choice.reasons);
        } else {
          // Pearl has no legal move (or the AI failed): pass the turn so the game never freezes.
          setCurrentPlayer("black");
          setLastMove("Pearl has no legal move and passes.");
          setNotice("Pearl passes · your turn");
        }
        setAiThinking(false);
      }, Math.max(0, AI_MIN_THINK_MS - (performance.now() - started)));
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [board, scores, currentPlayer, mode, difficulty, liveWinner, reviewing, requestAi]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!confirmRestart) return;
    const timer = window.setTimeout(() => setConfirmRestart(false), 2500);
    return () => window.clearTimeout(timer);
  }, [confirmRestart]);

  useEffect(() => {
    if (!liveWinner || !moveLog.length || mode === "puzzle") return;
    const record = { version: 1 as const, setup: setupId, moves: moveLog };
    const key = serializeGame(record);
    const current = readStorage<Array<{ key: string }>>("sumito-match-history", []);
    if (!current.some((item) => item.key === key)) {
      writeStorage("sumito-match-history", [{ key, winner: liveWinner, mode, createdAt: new Date().toISOString() }, ...current].slice(0, 20));
    }
  }, [liveWinner, moveLog, setupId, mode]);

  function bump(coord: Coord) {
    setShake({ id: ++motionCounter, key: keyOf(coord) });
  }

  function select(next: Coord[]) {
    setSelected(next);
    setNotice(null);
    if (next.length) markCoach("select");
    if (mode === "tutorial") {
      if (tutorialStep === 0 && next.length >= 1) setTutorialStep(1);
      if (tutorialStep === 1 && next.length >= 2) setTutorialStep(2);
    }
    if (next.length && !legalMoves(board, next, currentPlayer).length) {
      bump(next[next.length - 1]);
      setLastMove("That line is blocked. Choose a marble with a green dot.");
    }
  }

  function chooseMarble(coord: Coord) {
    if (!humanCanMove) return;
    const targetMove = moveTargets.get(keyOf(coord));
    if (targetMove) return commitMove(selected, targetMove);
    const occupant = board[keyOf(coord)];
    if (!occupant) {
      if (selected.length) select([]);
      return;
    }
    if (occupant !== currentPlayer) {
      bump(coord);
      setLastMove(`${PLAYER_NAMES[currentPlayer]} moves now. Choose a ${currentPlayer === "black" ? "dark" : "light"} marble.`);
      return;
    }
    if (selected.some((item) => same(item, coord))) {
      select(selected.filter((item) => !same(item, coord)));
      return;
    }
    const next = [...selected, coord];
    select(next.length <= 3 && isValidGroup(next) ? next : [coord]);
  }

  function undo() {
    if (!history.length || aiThinking) return;
    cancelPending();
    let targetIndex = history.length - 1;
    if (mode === "computer" && history[targetIndex].currentPlayer === "white" && targetIndex > 0) targetIndex -= 1;
    const previous = history[targetIndex];
    setBoard(previous.board);
    setCurrentPlayer(previous.currentPlayer);
    setScores(previous.scores);
    setMoveLog((items) => items.slice(0, previous.moveCount));
    setHistory((items) => items.slice(0, targetIndex));
    setSelected([]);
    setReviewIndex(null);
    setNotice(null);
    setMotion(null);
    setLastMove("Last turn undone.");
  }

  async function requestHint() {
    if (!humanCanMove) return;
    setHintPending(true);
    const generation = generationRef.current;
    const choice = await requestAi({ board, scores, player: currentPlayer, difficulty: "medium" });
    setHintPending(false);
    // Ignore a hint for a game the player has already left, restarted or undone.
    if (!choice || generation !== generationRef.current) return;
    setSelected(choice.move.selected);
    const index = DIRECTIONS.findIndex((direction) => same(direction, choice.move.direction));
    setNotice(`Hint: ${DIRECTION_GLYPHS[index]} ${describeReasons(choice.reasons)}`);
    setLastMove(`Hint: move ${choice.move.direction.label} — ${describeReasons(choice.reasons)}.`);
  }

  /** Step through review; stepping forward one move animates that move. */
  function seek(index: number | null) {
    const from = reviewIndex ?? moveLog.length;
    const to = index ?? moveLog.length;
    if (to === from + 1 && to <= moveLog.length) {
      const before = replayGame(setupId, moveLog, from);
      const record = moveLog[from];
      const moving = record.selected.map(parseCoord);
      const move = legalMoves(before.board, moving, record.player).find((candidate) => same(candidate.direction, DIRECTIONS[record.direction]));
      if (move) setMotion({ id: ++motionCounter, plan: motionPlan(move), player: record.player, animated: getMotionScale() > 0 });
    } else {
      setMotion(null);
    }
    setReviewIndex(index);
  }

  async function shareMatch() {
    const encoded = encodeSharedGame({ version: 1, setup: setupId, moves: moveLog });
    const url = `${window.location.origin}${window.location.pathname}?replay=${encoded}`;
    try {
      const canShare = typeof navigator.share === "function";
      if (canShare) await navigator.share({ title: "Sumito match", text: "Review this Sumito match", url });
      else await navigator.clipboard.writeText(url);
      setToast(canShare ? "Share sheet opened." : "Match link copied.");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setToast("Could not share this match.");
    }
  }

  function openSheet(name: SheetName, preset: MatchChoice["mode"] | null = null) {
    setSheetKey((value) => value + 1);
    setMatchPreset(preset);
    setSheet(name);
  }

  function goHome() {
    setSheet(null);
    resetMatchState();
    setStarted(false);
    if (mode === "tutorial") setMode("local");
    setBoard(createInitialBoard(setupId));
    setCurrentPlayer("black");
    setScores({ black: 0, white: 0 });
  }

  function startMatch(choice: MatchChoice) {
    setSheet(null);
    setStarted(true);
    writeStorage(LAST_MATCH_STORAGE_KEY, choice);
    applyMatch(choice);
  }

  function applyMatch(choice: MatchChoice) {
    setMode(choice.mode);
    setSetupId(choice.setupId);
    setDifficulty(choice.difficulty);
    setPuzzleId(choice.puzzleId);
    if (choice.mode === "puzzle") startPuzzle(choice.puzzleId);
    else startGame(choice.setupId);
  }

  function restart() {
    if (moveLog.length && !liveWinner && !confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    setSheet(null);
    if (mode === "puzzle") startPuzzle();
    else if (mode === "tutorial") startTutorial(0);
    else startGame();
  }

  function updateReduceMotion(value: boolean) {
    setReduceMotion(value);
    applyReducedMotion(value);
    writeStorage(MOTION_STORAGE_KEY, value);
  }

  function updateSound(value: boolean) {
    setSound(value);
    setSoundEnabled(value);
    writeStorage(SOUND_STORAGE_KEY, value);
    if (value) playSound("move");
  }

  function updateShowPad(value: boolean) {
    setShowPad(value);
    writeStorage(PAD_STORAGE_KEY, value);
  }

  const status = confirmRestart
    ? "Tap ↻ again to restart"
    : reviewing
      ? `Review · move ${reviewIndex} of ${moveLog.length}`
      : liveWinner
        ? `${PLAYER_NAMES[liveWinner]} wins`
        : aiThinking
          ? `${PLAYER_NAMES.white} is thinking…`
          : hintPending
            ? "Finding a hint…"
            : notice ?? (selected.length
              ? `${selected.length} selected · tap a dot or swipe`
              : `${mode === "computer" ? "Your turn" : `${PLAYER_NAMES[currentPlayer]} to move`} · tap a marble with a green dot`);

  // Tips teach the basics in normal play; puzzles keep their goal visible instead.
  const coach: CoachId | null = mode === "tutorial" || mode === "puzzle" || !humanCanMove || reviewing
    ? null
    : moves.some((move) => move.opponents.length) && !coachSeen.push
      ? "push"
      : selected.length && moves.length && !coachSeen.target
        ? "target"
        : !selected.length && !moveLog.length && !coachSeen.select
          ? "select"
          : null;

  // Name each side so the score pill explains itself: who is who, and how far each is from 6.
  const sideName: Record<Player, string> = mode === "computer"
    ? { black: "You", white: "AI" }
    : { black: PLAYER_NAMES.black, white: PLAYER_NAMES.white };
  const canReview = mode === "local" || mode === "computer";
  const settings = { reduceMotion, showPad, sound, onReduceMotion: updateReduceMotion, onShowPad: updateShowPad, onSound: updateSound };

  function result(close: () => void): { title: string; subtitle: string; celebrate: boolean; scores: Scores; actions: ResultAction[] } {
    if (mode === "puzzle") {
      const ids = Object.keys(PUZZLES) as PuzzleId[];
      const next = ids[ids.indexOf(puzzleId) + 1];
      const puzzle = PUZZLES[puzzleId];
      return {
        title: "Puzzle solved!",
        subtitle: `${puzzle.name} · ${puzzle.level}`,
        celebrate: true,
        scores,
        actions: [
          next
            ? { label: "Next puzzle", primary: true, onClick: () => { setSheet(null); setPuzzleId(next); startPuzzle(next); } }
            : { label: "Back to start", primary: true, onClick: goHome },
          { label: "Retry", onClick: () => { setSheet(null); startPuzzle(); } },
          ...(next ? [{ label: "Back to start", onClick: goHome }] : []),
        ],
      };
    }
    const humanLost = mode === "computer" && liveWinner === "white";
    const title = !liveWinner ? "Match over" : mode === "computer" ? (humanLost ? "The AI wins" : "You win!") : `${PLAYER_NAMES[liveWinner]} wins!`;
    return {
      title,
      subtitle: humanLost ? `So close. ${moveLog.length} moves — try again?` : `${moveLog.length} moves`,
      celebrate: !humanLost,
      scores,
      actions: [
        { label: "Rematch", primary: true, onClick: () => { setSheet(null); startGame(); } },
        { label: "Review", onClick: () => { close(); window.setTimeout(() => { seek(0); openSheet("review"); }, 220 * getMotionScale()); } },
        { label: "Share ↗", onClick: shareMatch },
      ],
    };
  }

  return <main className={`game${aiThinking ? " is-thinking" : ""}${started ? "" : " is-intro"}`}>
    {toast && <div className="toast" role="status">{toast}</div>}
    <p className="sr-only" aria-live="polite">{lastMove}</p>

    <header className="hud">
      {started
        ? <button type="button" className="hud-button" onClick={goHome} aria-label="Back to start" data-tip="Back to start"><Icon name="home" /></button>
        : <button type="button" className="hud-button" onClick={() => openSheet("menu")} aria-label="Open menu" data-tip="Menu"><Icon name="menu" /></button>}
      {started && <>
      <div className={`score-pill turn-${shownWinner ?? shownPlayer}`} aria-label={`Score. ${sideName.black} ${shownScores.black} of 6, ${sideName.white} ${shownScores.white} of 6. ${PLAYER_NAMES[shownPlayer]} to move.`}>
        <span className="score-marker" aria-hidden="true" />
        <span className="score-side black">
          <span className="mini-marble black" />
          <span className="score-name">{sideName.black}</span>
          <b key={`b${shownScores.black}`}>{shownScores.black}<small>/6</small></b>
        </span>
        <span className="score-side white">
          <b key={`w${shownScores.white}`}>{shownScores.white}<small>/6</small></b>
          <span className="score-name">{sideName.white}</span>
          <span className="mini-marble white" />
        </span>
      </div>
      <button type="button" className={`hud-button${confirmRestart ? " is-armed" : ""}`} onClick={restart} aria-label={confirmRestart ? "Confirm restart" : "Restart"} data-tip={confirmRestart ? "Tap again to restart" : "Restart this match"}><Icon name="restart" /></button>
      </>}
    </header>

    {!started && <div className="intro">
      <h1>Sumito</h1>
      <p>A duel of push and position on a hexagon board. Slide lines of up to three marbles, outnumber your rival, and be the first to push six of their marbles off the edge.</p>
    </div>}
    {started && <div className="status-row">
      {mode === "tutorial"
        ? <div className="coach is-tutorial" key={`t${tutorialStep}`}>
          <span><small>Step {tutorialStep + 1} of 4</small>{notice ?? TUTORIAL_STEPS[tutorialStep].title}</span>
          <button type="button" onClick={goHome} data-tip="Leave the tutorial">Exit</button>
        </div>
        : coach
          ? <div className="coach" key={coach}>
            <span>{coachText[coach]}</span>
            <button type="button" aria-label="Dismiss tip" onClick={() => markCoach(coach)}>×</button>
          </div>
          : <span className={`status-chip${liveWinner && !reviewing ? " is-win" : ""}${mode === "puzzle" ? " is-puzzle" : ""}`}>
            <span className={`turn-dot ${shownPlayer}`} aria-hidden="true" />
            <span>{mode === "puzzle" && !liveWinner && <small>Puzzle · {PUZZLES[puzzleId].name}</small>}{status}</span>
          </span>}
      {mode !== "tutorial" && <button type="button" className="rules-button" onClick={() => openSheet("rules")} aria-label="How to play: rules" data-tip="Rules in 4 pictures"><Icon name="help" /><span>Rules</span></button>}
    </div>}

    <section
      className={`board-area${started ? "" : " is-idle"}`}
      aria-label="Sumito game"
      onClick={started ? undefined : () => openSheet("match")}
    >
      <GameBoard
        board={shownBoard}
        currentPlayer={currentPlayer}
        interactive={humanCanMove}
        reviewing={reviewing}
        winner={shownWinner}
        selected={selected}
        playable={playable}
        moves={moves}
        moveTargets={moveTargets}
        motion={motion}
        shake={shake}
        onTap={chooseMarble}
        onSelectLine={select}
        onMove={(move) => commitMove(selected, move)}
        onClear={() => select([])}
      />
      {showPad && selected.length > 0 && humanCanMove && <div className="direction-pad" aria-label="Move selected marbles">
        {DIRECTIONS.map((direction, index) => {
          const move = moves.find((candidate) => same(candidate.direction, direction));
          return <button type="button" key={direction.label} onClick={() => move && commitMove(selected, move)} disabled={!move} aria-label={`Move ${direction.label}`}>{DIRECTION_GLYPHS[index]}</button>;
        })}
      </div>}
    </section>

    {!started && <nav className="dock" aria-label="Start">
      <button type="button" className="is-primary" onClick={() => openSheet("match")} data-tip="Start a match"><Icon name="play" />Play</button>
      <button type="button" onClick={() => openSheet("rules")} data-tip="The rules in 4 pictures"><Icon name="help" />How to play</button>
      <button type="button" onClick={() => startTutorial(0)} data-tip="Learn by playing · 1 minute"><Icon name="learn" />Tutorial</button>
      <button type="button" onClick={() => openSheet("match", "puzzle")} data-tip="Short tactics to solve"><Icon name="puzzle" />Puzzles</button>
    </nav>}
    {!started && <footer className="credit">
      © {new Date().getFullYear()} Sumito · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · Developed by <a href="https://kashifaziz.me" target="_blank" rel="noopener">Kashif Aziz</a>
    </footer>}
    {started && <nav className="dock" aria-label="Game actions">
      <button type="button" onClick={undo} disabled={!history.length || aiThinking} data-tip="Take back the last move"><Icon name="undo" />Undo</button>
      <button type="button" className={`is-primary${hintPending ? " is-busy" : ""}`} onClick={requestHint} disabled={!humanCanMove} data-tip="Suggest a good move"><Icon name="hint" />Hint</button>
      <button type="button" onClick={() => openSheet("review")} disabled={!canReview} data-tip="Step through the moves"><Icon name="review" />Review</button>
      <button type="button" onClick={() => openSheet("match")} data-tip="New match and settings"><Icon name="settings" />Match</button>
    </nav>}

    <Sheet open={sheet === "match"} label="New match" onClose={() => setSheet(null)}>
      {() => <MatchSheetContent
        key={sheetKey}
        initial={{ mode: matchPreset ?? (mode === "tutorial" ? "local" : mode), setupId, difficulty, puzzleId }}
        onStart={startMatch}
        settings={settings}
      />}
    </Sheet>
    <Sheet open={sheet === "review"} label="Move review" onClose={() => setSheet(null)}>
      {() => <ReviewSheetContent moveLog={moveLog} reviewIndex={reviewIndex} onSeek={seek} onShare={shareMatch} />}
    </Sheet>
    <Sheet open={sheet === "menu"} label="Menu" onClose={() => setSheet(null)}>
      {() => <MenuSheetContent
        onTutorial={() => { setSheet(null); startTutorial(0); }}
        settings={settings}
      />}
    </Sheet>
    <Sheet open={sheet === "rules"} label="How to play" wide onClose={() => setSheet(null)}>
      {(close) => <>
        <h2 className="sheet-title">How to play</h2>
        <RulesCards ids="rules-sheet" />
        <div className="sheet-actions sheet-actions-two">
          <button type="button" onClick={() => { setSheet(null); startTutorial(0); }}>▶ Tutorial</button>
          <button type="button" className="sheet-primary" onClick={close}>Got it</button>
        </div>
      </>}
    </Sheet>
    <Sheet open={sheet === "result"} label="Match result" center onClose={() => setSheet(null)}>
      {(close) => <ResultSheetContent {...result(close)} />}
    </Sheet>
  </main>;
}
