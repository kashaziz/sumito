import { getMotionScale } from "./motion";

const COLORS = ["#d5f04a", "#e85e2b", "#eef0ec", "#f1ede3", "#7a8381", "#b9e02a"];

/**
 * Confetti burst from both bottom corners. Uses a popover so it draws above an open modal sheet.
 * Every piece animates transform and opacity only, then the layer removes itself.
 */
export function celebrate(pieces = 80) {
  if (typeof document === "undefined" || !getMotionScale()) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("popover", "manual");
  document.body.appendChild(layer);
  try {
    layer.showPopover();
  } catch {
    // Without popover support the layer still shows, but beneath an open dialog.
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const animations: Animation[] = [];
  for (let index = 0; index < pieces; index += 1) {
    const fromLeft = index % 2 === 0;
    const piece = document.createElement("i");
    const size = 6 + Math.random() * 7;
    piece.style.width = `${size}px`;
    piece.style.height = `${Math.random() < 0.5 ? size : size * 0.45}px`;
    piece.style.background = COLORS[index % COLORS.length];
    piece.style.borderRadius = Math.random() < 0.35 ? "50%" : "2px";
    piece.style.left = fromLeft ? "-10px" : `${width + 10}px`;
    piece.style.top = `${height * 0.85}px`;
    layer.appendChild(piece);
    const direction = fromLeft ? 1 : -1;
    const reachX = direction * (width * (0.25 + Math.random() * 0.55));
    const peakY = -height * (0.45 + Math.random() * 0.4);
    const spin = (Math.random() * 900 + 360) * direction;
    animations.push(piece.animate([
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${reachX * 0.75}px, ${peakY}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${reachX}px, ${peakY + height * 0.55}px) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 1700 + Math.random() * 900, delay: Math.random() * 180, easing: "cubic-bezier(.15,.7,.3,1)", fill: "both" }));
  }
  Promise.all(animations.map((animation) => animation.finished)).catch(() => undefined).finally(() => layer.remove());
}
