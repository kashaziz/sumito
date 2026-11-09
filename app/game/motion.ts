/** Shared motion settings. All durations scale by the value from getMotionScale(). */
export const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
export const EASE_IN_OUT = "cubic-bezier(.4,0,.6,1)";
export const MOTION_STORAGE_KEY = "sumito-reduce-motion";

/** 0 when the player or the OS asks for reduced motion, otherwise 1. */
export function getMotionScale() {
  if (typeof window === "undefined") return 0;
  if (document.documentElement.dataset.motion === "reduced") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
}

export function applyReducedMotion(reduced: boolean) {
  if (reduced) document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
}

export function vibrate(milliseconds: number) {
  if (!getMotionScale()) return;
  // Browsers block (and log) vibration until the user has interacted with the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(milliseconds);
  } catch {
    // Haptics are optional and unsupported on iOS Safari.
  }
}
