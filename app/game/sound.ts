/**
 * Tiny synthesized sound effects (Web Audio API). No audio files to download.
 * The AudioContext is created on first use, after the player has interacted with the page.
 */
export type SoundName = "move" | "capture" | "win" | "lose";
export const SOUND_STORAGE_KEY = "sumito-sound";

let enabled = true;
let context: AudioContext | null = null;

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

type Tone = { type: OscillatorType; from: number; to?: number; at: number; length: number; volume: number };

function tone(ctx: AudioContext, { type, from, to, at, length, volume }: Tone) {
  const start = ctx.currentTime + at;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.03);
}

const SOUNDS: Record<SoundName, Tone[]> = {
  // A soft wooden tap.
  move: [
    { type: "sine", from: 520, to: 360, at: 0, length: 0.07, volume: 0.05 },
    { type: "triangle", from: 170, at: 0, length: 0.05, volume: 0.04 },
  ],
  // A falling whistle that matches the 420ms drop, then a low thud as it lands.
  capture: [
    { type: "sine", from: 760, to: 120, at: 0.04, length: 0.42, volume: 0.09 },
    { type: "sine", from: 95, to: 45, at: 0.46, length: 0.2, volume: 0.22 },
    { type: "triangle", from: 180, to: 90, at: 0.46, length: 0.08, volume: 0.06 },
  ],
  // A rising major arpeggio with a held top note.
  win: [
    { type: "triangle", from: 523.25, at: 0, length: 0.18, volume: 0.09 },
    { type: "triangle", from: 659.25, at: 0.12, length: 0.18, volume: 0.09 },
    { type: "triangle", from: 783.99, at: 0.24, length: 0.2, volume: 0.09 },
    { type: "triangle", from: 1046.5, at: 0.38, length: 0.55, volume: 0.1 },
    { type: "sine", from: 523.25, at: 0.38, length: 0.55, volume: 0.05 },
  ],
  // Two gentle falling notes.
  lose: [
    { type: "sine", from: 392, at: 0, length: 0.32, volume: 0.07 },
    { type: "sine", from: 311.13, at: 0.26, length: 0.5, volume: 0.07 },
  ],
};

export function playSound(name: SoundName) {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;
  SOUNDS[name].forEach((part) => tone(ctx, part));
  // Lets tests observe sounds without hooking the audio graph. Nothing is sent anywhere.
  window.dispatchEvent(new CustomEvent("sumito:sound", { detail: name }));
}
