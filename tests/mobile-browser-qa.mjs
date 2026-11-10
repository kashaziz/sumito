// Browser QA for the board-first game shell.
// Usage: start the app (npm start) and Chrome with --remote-debugging-port=$CDP_PORT, then run
//   CDP_PORT=9336 SUMITO_URL=http://127.0.0.1:3000 node tests/mobile-browser-qa.mjs
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const cdpPort = process.env.CDP_PORT ?? "9336";
const baseUrl = process.env.SUMITO_URL ?? "http://127.0.0.1:3000";

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(`${message.params.entry.text} (${message.params.entry.url ?? ""})`);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") browserErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++requestId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${expression.slice(0, 120)}`);
  return result.result.value;
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

async function open(path, width, height, { reducedMotion = false, freshStorage = true, start = true } = {}) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 1000 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }] });
  if (freshStorage) {
    await send("Storage.clearDataForOrigin", { origin: new URL(baseUrl).origin, storageTypes: "local_storage" });
  }
  await send("Page.navigate", { url: `${baseUrl}${path}` });
  await sleep(1400);
  await evaluate(`window.__sounds = []; addEventListener("sumito:sound", (event) => window.__sounds.push(event.detail)); true`);
  if (start && path === "/") await startFromTitle();
}

async function startFromTitle() {
  await evaluate(`document.querySelector('nav[aria-label="Start"] .is-primary').click(); true`);
  await sleep(350);
  await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
  await sleep(450);
}

const layoutProbe = `(() => {
  const visible = [...document.querySelectorAll("body *")].filter((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || element.closest("dialog:not([open])") || element.closest(".sr-only") || element.closest("svg")) return false;
    return [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
  });
  const sizes = visible.map((element) => parseFloat(getComputedStyle(element).fontSize));
  const dock = [...document.querySelectorAll(".dock button")].map((button) => Math.round(button.getBoundingClientRect().height));
  const frame = document.querySelector(".board-frame")?.getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    minFont: Math.min(...sizes),
    svgTextHeights: [...document.querySelectorAll("svg text")].filter((text) => text.getBoundingClientRect().height && !text.closest("dialog:not([open])")).map((text) => Math.round(text.getBoundingClientRect().height)),
    smallText: visible.filter((element) => parseFloat(getComputedStyle(element).fontSize) < 11).map((element) => element.textContent.trim().slice(0, 30)),
    board: frame ? [Math.round(frame.width), Math.round(frame.top), Math.round(frame.bottom)] : null,
    dockHeights: dock,
    hudHeight: Math.round(document.querySelector(".hud")?.getBoundingClientRect().height ?? 0),
    namesFit: [...document.querySelectorAll(".score-name")].every((name) => name.scrollWidth <= name.clientWidth),
  };
})()`;

const cellCenter = (key) => evaluate(`(() => { const r = document.querySelector('[data-key="${key}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
async function mouse(type, x, y) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });
}
async function drag(from, to, steps = 8) {
  await mouse("mousePressed", from[0], from[1]);
  for (let step = 1; step <= steps; step += 1) {
    await mouse("mouseMoved", from[0] + (to[0] - from[0]) * step / steps, from[1] + (to[1] - from[1]) * step / steps);
    await sleep(16);
  }
  await mouse("mouseReleased", to[0], to[1]);
}
const state = () => evaluate(`({
  selected: [...document.querySelectorAll('.cell[aria-pressed="true"]')].map((cell) => cell.dataset.key),
  targets: document.querySelectorAll(".cell.is-target").length,
  playable: document.querySelectorAll(".cell.is-playable").length,
  turn: document.querySelector(".score-pill")?.className.match(/turn-(\\w+)/)?.[1],
  status: document.querySelector(".status-row")?.textContent.trim(),
  score: [...document.querySelectorAll(".score-side b")].map((b) => b.textContent),
  marbleAnimations: document.getAnimations().filter((animation) => animation.effect?.target?.closest?.(".board")).length,
  fallers: document.querySelectorAll(".faller").length,
  openSheet: document.querySelector("dialog[open]")?.getAttribute("aria-label") ?? null,
  toast: document.querySelector(".toast")?.textContent ?? null,
})`);

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

// 0. Title screen: name, description, inactive board, start choices in the bottom bar.
for (const [width, height, name] of [[320, 568, "small phone"], [390, 844, "phone"], [844, 390, "phone landscape"], [1280, 800, "desktop"]]) {
  await open("/", width, height, { start: false });
  const title = await evaluate(`({
    h1: document.querySelector(".intro h1")?.textContent,
    text: document.querySelector(".intro p")?.textContent,
    idle: document.querySelector(".board-area").classList.contains("is-idle"),
    playable: document.querySelectorAll(".cell.is-playable").length,
    dock: [...document.querySelectorAll(".dock button")].map((b) => b.textContent.replace(/[^A-Za-z ]/g, "").trim()),
    pill: Boolean(document.querySelector(".score-pill")),
    sidePanels: document.querySelectorAll(".side-panel").length,
    credit: document.querySelector('.credit a[href*="kashifaziz.me"]')?.href,
    creditText: document.querySelector(".credit")?.textContent,
    ripples: document.getAnimations().filter((animation) => animation.animationName === "ripple").length,
    documentHeight: document.documentElement.scrollHeight,
    documentWidth: document.documentElement.scrollWidth,
    dockHeights: [...document.querySelectorAll(".dock button")].map((b) => Math.round(b.getBoundingClientRect().height)),
  })`);
  check(`${name} title: name and description`, title.h1 === "Sumito" && /push six of their marbles/.test(title.text ?? ""), title.h1);
  check(`${name} title: © line links to kashifaziz.me`, title.credit === "https://kashifaziz.me/" && /Developed by Kashif Aziz/.test(title.creditText ?? ""), title.creditText);
  check(`${name} title: idle board ripples`, title.ripples >= 61, title.ripples);
  check(`${name} title: board shown but inactive`, title.idle && title.playable === 0 && !title.pill, { idle: title.idle, playable: title.playable });
  check(`${name} title: start choices in the bottom bar`, title.dock.join() === "Play,How to play,Tutorial,Puzzles", title.dock);
  check(`${name} title: no side panels, no page scroll`, title.sidePanels === 0 && title.documentHeight <= height && title.documentWidth <= width, title);
  check(`${name} title: bottom bar buttons ≥ 44px`, title.dockHeights.every((value) => value >= 44), title.dockHeights);
}
await open("/", 1280, 800, { start: false });
const fontCheck = await evaluate(`document.fonts.ready.then(() => ({ family: getComputedStyle(document.querySelector(".intro h1")).fontFamily, loaded: document.fonts.check('900 48px "Cinzel Decorative"') }))`);
check("title uses the Cinzel Decorative display font", /Cinzel Decorative/.test(fontCheck.family) && fontCheck.loaded, fontCheck);
const tips = await evaluate(`[...document.querySelectorAll(".dock button, .hud button")].map((b) => b.dataset.tip ?? "")`);
check("every bar button has a tooltip", tips.length >= 5 && tips.every(Boolean), tips);
const playButton = await evaluate(`(() => { const r = document.querySelector('nav[aria-label="Start"] .is-primary').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: playButton[0], y: playButton[1] });
await sleep(600);
const tipShown = await evaluate(`getComputedStyle(document.querySelector('nav[aria-label="Start"] .is-primary'), "::after").opacity`);
check("hovering a bar button shows its tooltip", tipShown === "1", tipShown);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("How to play")).click(); true`);
await sleep(500);
const wideRules = await evaluate(`(() => { const d = document.querySelector("dialog[open]"); return { scroll: d.scrollHeight - d.clientHeight, width: Math.round(d.getBoundingClientRect().width) }; })()`);
check("desktop: How to play fits without scrolling", wideRules.scroll <= 1, wideRules);
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);
await open("/", 390, 844, { start: false });
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("How to play")).click(); true`);
await sleep(400);
check("title: How to play opens the rules section", await evaluate(`document.querySelector("dialog[open]")?.getAttribute("aria-label")`) === "How to play");
const phoneRules = await evaluate(`(() => { const d = document.querySelector("dialog[open]"); return d.scrollHeight - d.clientHeight; })()`);
check("phone: How to play fits without scrolling", phoneRules <= 1, phoneRules);
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Puzzles")).click(); true`);
await sleep(400);
check("title: Puzzles opens the match section with Puzzles selected", await evaluate(`document.querySelector('dialog[open] .mode-cards [aria-checked="true"]')?.textContent.includes("Puzzles")`));
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);
await evaluate(`document.querySelector(".board-area").click(); true`);
await sleep(400);
check("title: tapping the board opens the match section", await evaluate(`document.querySelector("dialog[open]")?.getAttribute("aria-label")`) === "New match");
await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
await sleep(450);
const live = await evaluate(`({ idle: document.querySelector(".board-area").classList.contains("is-idle"), playable: document.querySelectorAll(".cell.is-playable").length, dock: [...document.querySelectorAll(".dock button")].map((b) => b.textContent.replace(/[^A-Za-z ]/g, "").trim()) })`);
check("Start turns the board live with the game bar", !live.idle && live.playable > 0 && live.dock.join() === "Undo,Hint,Review,Match", live);
const boardWidth = await evaluate(`Math.round(document.querySelector(".board-frame").getBoundingClientRect().width)`);
check("phone: the live board uses the full width", boardWidth >= 384, boardWidth);
await evaluate(`document.querySelector('[aria-label="Back to start"]').click(); true`);
await sleep(400);
check("Back to start (top-left) returns to the title screen", await evaluate(`Boolean(document.querySelector(".intro h1"))`));
await evaluate(`document.querySelector('[aria-label="Open menu"]').click(); true`);
await sleep(350);
const menuText = await evaluate(`document.querySelector("dialog[open]").textContent`);
check("menu has no Pro option", !/\bPro\b/.test(menuText.replace(/Profile/g, "")), menuText.slice(0, 80));
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);

// 1. Layout at four sizes: the game fills one screen, nothing scrolls, text stays readable.
for (const [width, height, name] of [[320, 568, "small phone"], [390, 844, "phone"], [844, 390, "phone landscape"], [1280, 800, "desktop"]]) {
  await open("/", width, height);
  const layout = await evaluate(layoutProbe);
  check(`${name}: no horizontal scroll`, layout.documentWidth <= width, layout.documentWidth);
  check(`${name}: no vertical page scroll`, layout.documentHeight <= height, layout.documentHeight);
  check(`${name}: text ≥ 11px`, layout.minFont >= 11, { minFont: layout.minFont, smallText: layout.smallText });
  check(`${name}: dock buttons ≥ 44px`, layout.dockHeights.length === 4 && layout.dockHeights.every((value) => value >= 44), layout.dockHeights);
  check(`${name}: player names are not cut off`, layout.namesFit);
  check(`${name}: picture labels draw at ≥ 11px`, layout.svgTextHeights.every((height) => height >= 11), layout.svgTextHeights);
  check(`${name}: board fits on screen`, layout.board && layout.board[2] <= height && layout.board[0] >= Math.min(width, height) * 0.5, layout.board);
}

// 2. Tap select, tap move, slide animation, turn marker.
await open("/", 390, 844);
await evaluate(`localStorage.setItem("sumito-coach-seen", JSON.stringify({ select: true, target: true, push: true })); true`);
await open("/", 390, 844, { freshStorage: false });
const idle = await evaluate(`({ status: document.querySelector(".status-chip")?.textContent, names: [...document.querySelectorAll(".score-name")].map((n) => n.textContent), pill: document.querySelector(".score-pill").textContent })`);
check("idle board says what to tap", /Onyx to move · tap a marble with a green dot/.test(idle.status ?? ""), idle.status);
await evaluate(`document.querySelector(".rules-button").click(); true`);
await sleep(400);
const rulesSheet = await evaluate(`(() => { const d = document.querySelector("dialog[open]"); return { label: d?.getAttribute("aria-label"), cards: d?.querySelectorAll(".rules li").length, scrollTop: d?.scrollTop, titles: [...(d?.querySelectorAll(".rules b") ?? [])].map((b) => b.textContent) }; })()`);
check("Rules button opens 4 illustrated rules", rulesSheet.label === "How to play" && rulesSheet.cards === 4, rulesSheet);
check("rules sheet opens at the top", rulesSheet.scrollTop === 0, rulesSheet.scrollTop);
const gradientIds = await evaluate(`[...document.querySelectorAll("radialGradient")].map((g) => g.id)`);
check("rule picture gradients have unique ids (so they paint)", gradientIds.length >= 2 && new Set(gradientIds).size === gradientIds.length, gradientIds);
await evaluate(`[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Got it").click(); true`);
await sleep(350);
const nameFit = await evaluate(`[...document.querySelectorAll(".score-name")].every((n) => n.scrollWidth <= n.clientWidth)`);
check("score pill names both sides without truncation", idle.names.join() === "Onyx,Pearl" && nameFit, idle);
await open("/", 390, 844);
let snapshot = await state();
check("coach tip shows on first visit", /Tap a marble with a green dot/.test(snapshot.status), snapshot.status);
check("Onyx has playable marbles marked", snapshot.playable > 0, snapshot.playable);
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(60);
snapshot = await state();
check("tap selects a marble and shows targets", snapshot.selected.length === 1 && snapshot.targets > 0, snapshot);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(30);
snapshot = await state();
check("move starts a slide animation", snapshot.marbleAnimations > 0, snapshot.marbleAnimations);
check("a move plays the tap sound", (await evaluate(`window.__sounds`)).includes("move"));
const pill = await evaluate(`({ height: Math.round(document.querySelector(".score-pill").getBoundingClientRect().height), font: parseFloat(getComputedStyle(document.querySelector(".score-side b")).fontSize) })`);
check("score bar is larger (52px tall, 24px numbers)", pill.height >= 52 && pill.font >= 24, pill);
await sleep(400);
snapshot = await state();
check("turn marker moves to Pearl", snapshot.turn === "white" && /Pearl to move/.test(snapshot.status), snapshot);

// 3. Drag-select a line, then swipe it to move.
// Pearl starts at the bottom; drag its front row of three.
const a = await cellCenter("-2,2");
const b = await cellCenter("0,2");
await drag(a, b);
await sleep(80);
snapshot = await state();
check("drag selects a straight line of three", snapshot.selected.length === 3, snapshot.selected);
const end = await cellCenter("0,2");
await mouse("mousePressed", end[0], end[1]);
await mouse("mouseReleased", end[0], end[1]);
await sleep(60);
snapshot = await state();
check("tapping a selected end marble deselects it (no accidental move)", snapshot.selected.length === 2 && snapshot.turn === "white", snapshot.selected);
const start = await cellCenter("-1,2");
await mouse("mousePressed", start[0], start[1]);
for (let step = 1; step <= 6; step += 1) { await mouse("mouseMoved", start[0] + 3 * step, start[1] - 12 * step); await sleep(16); }
const ghosts = await evaluate(`document.querySelectorAll(".board .ghost").length`);
check("ghost outlines preview the swipe destination", ghosts === 2, ghosts);
await mouse("mouseReleased", start[0] + 18, start[1] - 72);
await sleep(40);
snapshot = await state();
check("swipe on the selection commits a move", snapshot.turn === "black", snapshot);
await sleep(400);

// 4. Invalid tap shakes instead of printing a warning.
const opponent = await cellCenter(await evaluate(`document.querySelector(".cell.has-marble.white").dataset.key`));
await mouse("mousePressed", opponent[0], opponent[1]);
await mouse("mouseReleased", opponent[0], opponent[1]);
await sleep(20);
snapshot = await state();
check("tapping an opponent marble shakes it", snapshot.marbleAnimations > 0 && !/Choose/.test(snapshot.status), snapshot);

// 5. Keyboard: arrow keys move focus across cells.
const focused = await evaluate(`(() => { document.querySelector('[data-key="0,0"]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); return document.activeElement.dataset.key; })()`);
check("arrow key moves focus to the next cell", focused === "1,0", focused);
const tabbable = await evaluate(`document.querySelectorAll('.board .cell[tabindex="0"]').length`);
check("only one board cell is in the tab order", tabbable === 1, tabbable);

// 6. Review sheet: open, step back, return to live.
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Review")).click(); true`);
await sleep(350);
snapshot = await state();
check("review sheet opens", snapshot.openSheet === "Move review", snapshot.openSheet);
await evaluate(`document.querySelector('[aria-label="Previous move"]').click(); true`);
await sleep(100);
const reviewing = await evaluate(`({ reviewing: document.querySelector(".board").classList.contains("is-reviewing"), status: document.querySelector(".status-chip")?.textContent })`);
check("previous move shows the earlier position", reviewing.reviewing && /Review · move 1 of 2/.test(reviewing.status), reviewing);
await evaluate(`[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Back to live").click(); true`);
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);
snapshot = await state();
check("sheet closes and play is live again", snapshot.openSheet === null && !/Review/.test(snapshot.status), snapshot);

// 7. Hint runs in the worker and selects a line.
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Hint")).click(); true`);
await sleep(1500);
snapshot = await state();
check("hint selects marbles and explains in a short chip", snapshot.selected.length > 0 && /Hint:/.test(snapshot.status), snapshot);

// 8. Match sheet: switch to the computer and let it reply.
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Match")).click(); true`);
await sleep(350);
await evaluate(`[...document.querySelectorAll("dialog[open] .mode-cards button")].find((b) => b.textContent.includes("Vs computer")).click(); true`);
await sleep(50);
const chipsShown = await evaluate(`[...document.querySelectorAll("dialog[open] .chips button")].map((b) => b.textContent)`);
check("computer mode shows difficulty chips", chipsShown.includes("Easy") && chipsShown.includes("Hard"), chipsShown);
await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
await sleep(300);
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(30);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(100);
snapshot = await state();
check("computer shows a thinking state", /thinking/.test(snapshot.status), snapshot.status);
await sleep(2500);
snapshot = await state();
check("computer replies with a move", snapshot.turn === "black" && /Your turn/.test(snapshot.status), snapshot);
const workers = await evaluate(`performance.getEntriesByType("resource").filter((entry) => /ai\\.worker/.test(entry.name)).length`);
check("AI worker script is loaded once", workers <= 1, workers);

// 9. Capture: the marble falls off, then the score pops and the puzzle is solved.
await open("/?puzzle=edge-push", 390, 844);
const puzzleChip = await evaluate(`({ label: document.querySelector(".status-chip small")?.textContent, text: document.querySelector(".status-chip")?.textContent, exit: Boolean(document.querySelector('[aria-label="Back to start"]')) })`);
check("puzzle status shows a label above the goal, and an exit button", puzzleChip.label === "Puzzle · Edge pressure" && /Push Pearl beyond/.test(puzzleChip.text ?? "") && puzzleChip.exit, puzzleChip);
await evaluate(`document.querySelector('[data-key="2,0"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector('[data-key="3,0"]').click(); true`);
await sleep(60);
await evaluate(`document.querySelector('[data-key="4,0"]').click(); true`);
await sleep(60);
snapshot = await state();
check("captured marble falls off the edge", snapshot.fallers === 1 && snapshot.marbleAnimations > 0, snapshot);
await sleep(800);
snapshot = await state();
check("faller is removed and score reaches 6", snapshot.fallers === 0 && snapshot.score[0].startsWith("6"), snapshot);
check("winner marbles pulse", await evaluate(`document.querySelector(".board").classList.contains("won-black")`));
const win = await evaluate(`({
  sheet: document.querySelector("dialog[open]")?.getAttribute("aria-label"),
  title: document.querySelector("dialog[open] .result-title")?.textContent,
  centred: getComputedStyle(document.querySelector("dialog[open] .result")).textAlign,
  score: document.querySelector("dialog[open] .result-score")?.textContent,
  actions: [...document.querySelectorAll("dialog[open] .result button")].map((b) => b.textContent),
  confetti: document.querySelectorAll(".confetti i").length,
  confettiOnTop: document.querySelector(".confetti")?.matches(":popover-open") ?? false,
  sounds: window.__sounds,
})`);
check("solved puzzle opens a centred result panel", win.sheet === "Match result" && win.title === "Puzzle solved!" && win.centred === "center" && /6–0/.test(win.score ?? ""), win);
check("result panel offers Next puzzle, Retry, Back to start", win.actions.join() === "Next puzzle,Retry,Back to start", win.actions);
const colours = await evaluate(`(() => {
  const panel = document.querySelector("dialog[open] .result");
  const title = panel.querySelector(".result-title");
  const win = { title: getComputedStyle(title).backgroundImage, leader: getComputedStyle(panel.querySelector(".is-leader")).color };
  // A loss to the AI needs a full game, so check the loss styling by switching the class on this panel.
  panel.classList.replace("is-celebrating", "is-loss");
  const loss = { title: getComputedStyle(title).backgroundImage, leader: getComputedStyle(panel.querySelector(".is-leader")).color };
  panel.classList.replace("is-loss", "is-celebrating");
  return { win, loss };
})()`);
check("win title and leading score are lime", /213, 240, 74/.test(colours.win.title) && colours.win.leader === "rgb(213, 240, 74)", colours.win);
check("loss title and leading score are orange", /232, 94, 43/.test(colours.loss.title) && colours.loss.leader === "rgb(232, 94, 43)", colours.loss);
check("a win fires confetti above the panel", win.confetti >= 60 && win.confettiOnTop, { confetti: win.confetti, onTop: win.confettiOnTop });
check("after a win the turn marker stays on the winner", await evaluate(`document.querySelector(".score-pill").classList.contains("turn-black")`));
check("capture and win sounds play", win.sounds.includes("capture") && win.sounds.includes("win"), win.sounds);
await sleep(2800);
check("confetti cleans itself up", await evaluate(`document.querySelectorAll(".confetti").length`) === 0);
await evaluate(`[...document.querySelectorAll("dialog[open] .result button")].find((b) => b.textContent === "Next puzzle").click(); true`);
await sleep(400);
check("Next puzzle loads the second puzzle", /Puzzle · Three beats two/.test(await evaluate(`document.querySelector(".status-chip")?.textContent ?? ""`)));

await open("/?puzzle=edge-push", 1280, 800);
await evaluate(`document.querySelector('[data-key="2,0"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector('[data-key="3,0"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector('[data-key="4,0"]').click(); true`);
await sleep(1200);
const card = await evaluate(`(() => { const r = document.querySelector("dialog[open]").getBoundingClientRect(); return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), w: Math.round(r.width) }; })()`);
check("desktop: the result is a centred card", Math.abs(card.cx - 640) <= 2 && Math.abs(card.cy - 400) <= 2 && card.w <= 460, card);

// 10. Reduced motion (OS setting): moves apply instantly with no animations.
await open("/", 390, 844, { reducedMotion: true });
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(20);
snapshot = await state();
check("reduced motion: no marble animations", snapshot.marbleAnimations === 0 && snapshot.turn === "white", snapshot);
await open("/?puzzle=edge-push", 390, 844, { reducedMotion: true });
await evaluate(`document.querySelector('[data-key="2,0"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector('[data-key="3,0"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector('[data-key="4,0"]').click(); true`);
await sleep(200);
const calmWin = await evaluate(`({ sheet: document.querySelector("dialog[open]")?.getAttribute("aria-label"), confetti: document.querySelectorAll(".confetti").length })`);
check("reduced motion: result panel still opens, without confetti", calmWin.sheet === "Match result" && calmWin.confetti === 0, calmWin);
await open("/", 390, 844, { reducedMotion: true, start: false });
check("reduced motion: idle board does not ripple", await evaluate(`document.getAnimations().filter((a) => a.animationName === "ripple").length`) === 0);

// 11. Reduced motion from the settings toggle (Match section) persists.
await open("/", 390, 844);
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Match")).click(); true`);
await sleep(350);
await evaluate(`[...document.querySelectorAll("dialog[open] label")].find((l) => l.textContent.includes("Reduce motion")).querySelector("input").click(); true`);
await sleep(50);
const motionFlag = await evaluate(`document.documentElement.dataset.motion`);
check("settings toggle sets reduced motion", motionFlag === "reduced", motionFlag);
await evaluate(`[...document.querySelectorAll("dialog[open] label")].find((l) => l.textContent.includes("Sound effects")).querySelector("input").click(); true`);
await sleep(50);
await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
await sleep(350);
await evaluate(`window.__sounds = []; true`);
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(80);
check("Sound effects off: moves are silent", (await evaluate(`window.__sounds`)).length === 0, await evaluate(`window.__sounds`));
await open("/", 390, 844, { freshStorage: false, start: false });
check("reduced motion setting survives reload", await evaluate(`document.documentElement.dataset.motion`) === "reduced");

// 12. Interactive tutorial advances on real actions.
await open("/?tutorial=1", 390, 844);
snapshot = await state();
check("tutorial starts at step 1", /Step 1 of 4/.test(snapshot.status), snapshot.status);
await evaluate(`document.querySelector(".cell.is-playable").click(); true`);
await sleep(60);
snapshot = await state();
check("tutorial advances after the first tap", /Step 2 of 4/.test(snapshot.status), snapshot.status);
await evaluate(`[...document.querySelectorAll(".coach button")].find((b) => b.textContent === "Exit").click(); true`);
await sleep(400);
check("tutorial Exit returns to the title screen", await evaluate(`Boolean(document.querySelector(".intro h1"))`));

// 13. The last match type is remembered and preselected on the next visit.
await open("/", 390, 844, { start: false });
await evaluate(`document.querySelector('nav[aria-label="Start"] .is-primary').click(); true`);
await sleep(350);
await evaluate(`[...document.querySelectorAll("dialog[open] .mode-cards button")].find((b) => b.textContent.includes("Vs computer")).click(); true`);
await sleep(50);
await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
await sleep(300);
await evaluate(`localStorage.setItem("sumito-coach-seen", JSON.stringify({ select: true, target: true, push: true })); true`);
await open("/", 390, 844, { freshStorage: false, start: false });
check("return visit shows the title screen again", await evaluate(`Boolean(document.querySelector(".intro h1"))`));
await evaluate(`document.querySelector('nav[aria-label="Start"] .is-primary').click(); true`);
await sleep(350);
const preselected = await evaluate(`document.querySelector('dialog[open] .mode-cards [aria-checked="true"]')?.textContent`);
check("Play preselects the last match type", /Vs computer/.test(preselected ?? ""), preselected);
await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
await sleep(450);
const remembered = await evaluate(`({ names: [...document.querySelectorAll(".score-name")].map((n) => n.textContent), status: document.querySelector(".status-chip")?.textContent })`);
check("vs computer match names You and AI", remembered.names[0] === "You" && remembered.names[1] === "AI", remembered);
check("the live board says what to tap", /Your turn · tap a marble with a green dot/.test(remembered.status ?? ""), remembered.status);

// Robustness: delayed actions and late hints never act on a game the player has left.
await open("/?tutorial=1", 390, 844);
await evaluate(`document.querySelector(".cell.is-playable").click(); true`);
await sleep(80);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(80);
await evaluate(`[...document.querySelectorAll(".coach button")].find((b) => b.textContent === "Exit").click(); true`);
await sleep(900);
const afterTutorialExit = await evaluate(`({ title: Boolean(document.querySelector(".intro h1")), tutorial: /Step/.test(document.querySelector(".status-row")?.textContent ?? "") })`);
check("Exit right after a tutorial move stays on the title screen", afterTutorialExit.title && !afterTutorialExit.tutorial, afterTutorialExit);

await open("/?puzzle=edge-push", 390, 844);
await evaluate(`document.querySelector('[data-key="2,0"]').click(); true`);
await sleep(60);
await evaluate(`document.querySelector('[data-key="3,0"]').click(); true`);
await sleep(60);
await evaluate(`document.querySelector('[data-key="4,0"]').click(); true`);
await sleep(80);
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Undo")).click(); true`);
await sleep(1200);
const afterUndo = await evaluate(`({ sheet: document.querySelector("dialog[open]")?.getAttribute("aria-label") ?? null, score: document.querySelector(".score-side b")?.textContent })`);
check("Undo right after a winning push cancels the win screen", afterUndo.sheet === null && /^5/.test(afterUndo.score ?? ""), afterUndo);

await open("/", 390, 844);
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Hint")).click(); document.querySelector('[aria-label="Back to start"]').click(); true`);
await sleep(1500);
const afterHintHome = await evaluate(`({ title: Boolean(document.querySelector(".intro h1")), selected: document.querySelectorAll(".cell.is-selected").length })`);
check("a hint that arrives after Back to start is ignored", afterHintHome.title && afterHintHome.selected === 0, afterHintHome);

await open("/", 390, 844, { start: false });
await evaluate(`localStorage.setItem("sumito-last-match", JSON.stringify({ mode: "computer", setupId: "standard", difficulty: "expert", puzzleId: "edge-push" })); true`);
await open("/", 390, 844, { freshStorage: false, start: false });
await evaluate(`document.querySelector('nav[aria-label="Start"] .is-primary').click(); true`);
await sleep(400);
const restoredDifficulty = await evaluate(`[...document.querySelectorAll('dialog[open] .chips [aria-checked="true"]')].map((b) => b.textContent)`);
check("a corrupt saved difficulty falls back to Medium", restoredDifficulty.includes("Medium"), restoredDifficulty);
await evaluate(`document.querySelector("dialog[open] .sheet-primary").click(); true`);
await sleep(500);
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(60);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(2500);
check("…and the computer still replies", /Your turn/.test(await evaluate(`document.querySelector(".status-chip")?.textContent ?? ""`)));

// 14. Phone landscape: board at full height, controls split between the thumbs.
for (const [width, height] of [[844, 390], [667, 375], [932, 430]]) {
  const tag = `${width}×${height}`;
  await open("/", width, height, { start: false });
  const title = await evaluate(`(() => {
    const frame = document.querySelector(".board-frame").getBoundingClientRect();
    const menu = document.querySelector('[aria-label="Open menu"]').getBoundingClientRect();
    const rail = [...document.querySelectorAll(".dock button")].map((b) => Math.round(b.getBoundingClientRect().left));
    return { board: Math.round(frame.height), boardLeft: frame.left, menuLeft: menu.left, menuTop: menu.top, rail, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth };
  })()`);
  check(`${tag} title: large board, menu top-left, choices in a right rail, no scroll`, title.board >= height * 0.85 && title.menuLeft < 30 && title.menuTop < 30 && new Set(title.rail).size === 1 && title.rail[0] > title.boardLeft && title.docH <= height && title.docW <= width, title);
  await startFromTitle();
  const game = await evaluate(`(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    const frame = r(".board-frame"), hud = r(".hud"), dock = r(".dock"), black = r(".score-side.black"), white = r(".score-side.white");
    return { board: Math.round(frame.width), hudRight: hud.right, dockLeft: dock.left, frameLeft: frame.left, frameRight: frame.right,
      stacked: white.top >= black.bottom - 1, docH: document.documentElement.scrollHeight,
      namesFit: [...document.querySelectorAll(".score-name")].every((n) => n.scrollWidth <= n.clientWidth) };
  })()`);
  check(`${tag} game: board ≥ 340px and nothing overlaps it`, game.board >= 340 && game.hudRight <= game.frameLeft + 1 && game.dockLeft >= game.frameRight - 1 && game.docH <= height, game);
  check(`${tag} game: scores stack in the left column, names fit`, game.stacked && game.namesFit, game);
  await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Match")).click(); true`);
  await sleep(450);
  const startButton = await evaluate(`(() => { const b = document.querySelector("dialog[open] .sheet-primary").getBoundingClientRect(); return { bottom: Math.round(b.bottom), right: Math.round(b.right) }; })()`);
  check(`${tag} Play panel: Start is visible without scrolling`, startButton.bottom <= height && startButton.right <= width, startButton);
  await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
  await sleep(350);
  await evaluate(`document.querySelector(".rules-button").click(); true`);
  await sleep(450);
  const rulesFit = await evaluate(`(() => { const d = document.querySelector("dialog[open]"); return d.scrollHeight - d.clientHeight; })()`);
  check(`${tag} How to play fits without scrolling`, rulesFit <= 1, rulesFit);
  await evaluate(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true })); true`);
  await sleep(350);
}

await open("/?puzzle=edge-push", 844, 390);
for (const key of ["2,0", "3,0", "4,0"]) { await evaluate(`document.querySelector('[data-key="${key}"]').click(); true`); await sleep(60); }
await sleep(1200);
const landscapeCard = await evaluate(`(() => { const r = document.querySelector("dialog[open]").getBoundingClientRect(); const last = [...document.querySelectorAll("dialog[open] .result button")].pop().getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), buttonsBottom: Math.round(last.bottom) }; })()`);
check("844×390 result card fits with its buttons in view", landscapeCard.top >= 0 && landscapeCard.bottom <= 390 && landscapeCard.buttonsBottom <= 390, landscapeCard);

// Rotating keeps the game and jumps cleanly to the new layout: no sliding, flashing, or replayed panels.
const motionDuringRotation = `document.getAnimations().filter((a) => a.playState === "running" && a.animationName !== "ripple" && a.animationName !== "think").map((a) => (a.transitionProperty ?? a.animationName ?? "script") + "@" + String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? "").split(" ")[0])`;
const portraitMetrics = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } };
const landscapeMetrics = { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "landscapePrimary", angle: 90 } };
await open("/", 390, 844);
await evaluate(`document.querySelector('[data-key="1,-2"]').click(); true`);
await sleep(40);
await evaluate(`document.querySelector(".cell.is-target:not(.has-marble)").click(); true`);
await sleep(600);
const before = await evaluate(`({ turn: document.querySelector(".score-pill").className, marbles: document.querySelectorAll(".cell.has-marble").length })`);
await send("Emulation.setDeviceMetricsOverride", landscapeMetrics);
await sleep(30);
const toLandscape = await evaluate(motionDuringRotation);
const rotatingFlag = await evaluate(`"rotating" in document.documentElement.dataset`);
await sleep(600);
const after = await evaluate(`({ turn: document.querySelector(".score-pill").className, marbles: document.querySelectorAll(".cell.has-marble").length, flag: "rotating" in document.documentElement.dataset })`);
check("rotating to landscape keeps the game state", before.turn === after.turn && before.marbles === after.marbles && /turn-white/.test(after.turn), { before, after });
check("rotating: nothing slides or flashes (score marker, board)", toLandscape.length === 0 && rotatingFlag, toLandscape);
check("rotating: transitions come back after the turn", after.flag === false);
await send("Emulation.setDeviceMetricsOverride", portraitMetrics);
await sleep(30);
check("rotating back to portrait: nothing slides or flashes", (await evaluate(motionDuringRotation)).length === 0, await evaluate(motionDuringRotation));
await sleep(600);
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Match")).click(); true`);
await sleep(600);
for (const [name, metrics] of [["landscape", landscapeMetrics], ["portrait", portraitMetrics]]) {
  await send("Emulation.setDeviceMetricsOverride", metrics);
  await sleep(30);
  const replay = await evaluate(motionDuringRotation);
  check(`rotating to ${name} with a panel open does not replay its slide-in`, replay.length === 0 && (await evaluate(`Boolean(document.querySelector("dialog[open]"))`)), replay);
  await sleep(600);
}

// Every panel has a visible close (✕) button that works.
const closeOne = async (label) => {
  const info = await evaluate(`(() => { const d = document.querySelector("dialog[open]"); const b = d?.querySelector(".sheet-close"); if (!b) return null; const r = b.getBoundingClientRect(); return { label: d.getAttribute("aria-label"), w: Math.round(r.width), visible: r.top >= 0 && r.right <= innerWidth }; })()`);
  await evaluate(`document.querySelector("dialog[open] .sheet-close")?.click(); true`);
  await sleep(350);
  const closed = await evaluate(`!document.querySelector("dialog[open]")`);
  check(`${label}: ✕ is visible and closes the panel`, info && info.visible && info.w >= 40 && closed, info);
};
await closeOne("Match panel");
await evaluate(`document.querySelector(".rules-button").click(); true`); await sleep(450); await closeOne("How to play panel");
await evaluate(`[...document.querySelectorAll(".dock button")].find((b) => b.textContent.includes("Review")).click(); true`); await sleep(450); await closeOne("Review panel");
await open("/", 390, 844, { start: false });
await evaluate(`document.querySelector('[aria-label="Open menu"]').click(); true`); await sleep(450); await closeOne("Menu panel");
await open("/?puzzle=edge-push", 1280, 800);
for (const key of ["2,0", "3,0", "4,0"]) { await evaluate(`document.querySelector('[data-key="${key}"]').click(); true`); await sleep(60); }
await sleep(1200);
await closeOne("Result card");

// Notch: with safe-area insets, no control sits under the notch.
let insetsSupported = true;
try {
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, left: 47, bottom: 21, right: 47 } });
} catch {
  insetsSupported = false;
}
if (insetsSupported) {
  await open("/", 844, 390, { start: true });
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, left: 47, bottom: 21, right: 47 } });
  await sleep(300);
  const notch = await evaluate(`(() => {
    const viewportFit = [...document.querySelectorAll('meta[name="viewport"]')].pop().content;
    const left = Math.min(...[...document.querySelectorAll(".hud button, .score-pill, .status-row > *")].map((e) => e.getBoundingClientRect().left));
    const right = Math.max(...[...document.querySelectorAll(".dock button")].map((e) => e.getBoundingClientRect().right));
    const namesFit = [...document.querySelectorAll(".score-name")].every((n) => n.scrollWidth <= n.clientWidth);
    const board = Math.round(document.querySelector(".board-frame").getBoundingClientRect().width);
    return { viewportFit, left: Math.round(left), right: Math.round(right), namesFit, board };
  })()`);
  check("landscape notch: controls stay clear of 47px safe areas", /viewport-fit=cover/.test(notch.viewportFit) && notch.left >= 47 && notch.right <= 844 - 47 && notch.namesFit && notch.board >= 340, notch);
  await open("/", 390, 844, { start: true });
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, left: 0, bottom: 34, right: 0 } });
  await sleep(300);
  const portraitNotch = await evaluate(`(() => {
    const top = Math.min(...[...document.querySelectorAll(".hud button, .score-pill")].map((e) => e.getBoundingClientRect().top));
    const bottom = Math.max(...[...document.querySelectorAll(".dock button")].map((e) => e.getBoundingClientRect().bottom));
    return { top: Math.round(top), bottom: Math.round(bottom), docH: document.documentElement.scrollHeight };
  })()`);
  check("portrait notch: top bar below the notch, bottom bar above the home indicator", portraitNotch.top >= 47 && portraitNotch.bottom <= 844 - 34 && portraitNotch.docH <= 844, portraitNotch);
  await send("Emulation.setSafeAreaInsetsOverride", { insets: {} }).catch(() => {});
} else {
  check("landscape notch: viewport-fit=cover is set (inset emulation unsupported in this Chrome)", /viewport-fit=cover/.test(await evaluate(`[...document.querySelectorAll('meta[name="viewport"]')].pop().content`)));
}

// Desktop mouse: hover-only tooltip rules must not move the sheet ✕ (it once fell over the title).
await open("/", 1654, 891, { start: false });
await evaluate(`(() => {
  // Headless Chrome reports no hover pointer, so copy the (hover:hover) rules in unconditionally.
  const css = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
    .filter((rule) => rule.media && rule.media.mediaText.includes("hover")).flatMap((rule) => [...rule.cssRules].map((r) => r.cssText)).join(" ");
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); return css.length;
})()`);
await evaluate(`document.querySelector('[aria-label="Open menu"]').click(); true`);
await sleep(600);
const menuClose = await evaluate(`(() => {
  const d = document.querySelector("dialog[open]"), x = d.querySelector(".sheet-close").getBoundingClientRect(), r = d.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(d.querySelector(".sheet-title")); const t = range.getBoundingClientRect();
  return { position: getComputedStyle(d.querySelector(".sheet-close")).position, closeRight: Math.round(r.right - x.right), overlapsTitle: x.left < t.right && x.right > t.left && x.top < t.bottom && x.bottom > t.top, links: [...d.querySelectorAll(".menu-links b")].map((b) => b.textContent) };
})()`);
check("desktop mouse: the menu ✕ stays top-right, clear of the title", menuClose.position === "absolute" && menuClose.closeRight <= 16 && !menuClose.overlapsTitle, menuClose);
check("menu links: Tutorial, Learn, About, Privacy, Source code", menuClose.links.join() === "Tutorial,Learn and strategy,About Sumito,Privacy,Source code", menuClose.links);
await open("/", 390, 844, { start: false });
const creditLinks = await evaluate(`[...document.querySelectorAll(".credit a")].map((a) => a.getAttribute("href"))`);
check("title credit links to About, Privacy, and kashifaziz.me", creditLinks.join() === "/about,/privacy,https://kashifaziz.me", creditLinks);

// 15. Content pages stay mobile friendly.
await open("/learn", 1280, 800);
const learnInfo = await evaluate(`({ h1: getComputedStyle(document.querySelector(".lp h1")).fontFamily, rules: document.querySelectorAll(".lp .rules li").length, pro: Boolean(document.querySelector('a[href="/pro"]')), credit: document.querySelector(".lp-footer a[href*='kashifaziz']")?.href })`);
check("/learn: heading font, 4 rule cards, credit, no Pro link", /Cinzel/.test(learnInfo.h1) && learnInfo.rules === 4 && !learnInfo.pro && Boolean(learnInfo.credit), learnInfo);
for (const path of ["/learn", "/about", "/privacy"]) {
  await open(path, 390, 844);
  const layout = await evaluate(layoutProbe);
  check(`${path}: no horizontal scroll at 390px`, layout.documentWidth <= 390, layout.documentWidth);
  check(`${path}: text ≥ 11px`, layout.minFont >= 11, { minFont: layout.minFont, smallText: layout.smallText.slice(0, 5) });
}

check("no browser errors", browserErrors.length === 0, browserErrors.slice(0, 5));
socket.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
