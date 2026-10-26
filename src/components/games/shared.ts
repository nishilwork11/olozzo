import type { GameSlug } from "./games";

// Helpers shared by the mini games: directions, shuffling, time formatting and the best scores, which are
// kept only in this browser's localStorage. Storage can be blocked (private windows, disabled site data),
// so every access is wrapped in try/catch and the games work without it.

export type Dir = "up" | "down" | "left" | "right";

export const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

const ARROW_KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
// Physical WASD first (so ZQSD works on AZERTY keyboards), then the printed letters
const WASD_CODES: Record<string, Dir> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
const WASD_KEYS: Record<string, Dir> = { w: "up", s: "down", a: "left", d: "right" };

/** The direction a key stands for: arrow keys and WASD. */
export function keyDirection(e: KeyboardEvent): Dir | null {
  const key = e.key ?? "";
  return ARROW_KEYS[key] ?? WASD_CODES[e.code] ?? WASD_KEYS[key.toLowerCase()] ?? null;
}

/** Arrow keys only (no letters) — for moving focus around a grid of buttons. */
export function arrowDirection(e: { key: string }): Dir | null {
  return ARROW_KEYS[e.key] ?? null;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const numberFmt = new Intl.NumberFormat("en-GB");

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

// ── Best scores ─────────────────────────────────────────────

/** A finished timed game: fewer moves is better, then less time. */
export type TimedResult = { moves: number; seconds: number };

export const BEST_KEYS: Record<GameSlug, string> = {
  memory: "olozzo_games_memory_best",
  "2048": "olozzo_games_2048_best",
  puzzle: "olozzo_games_puzzle_best",
  snake: "olozzo_games_snake_best",
};

export function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full — the best score just isn't remembered */
  }
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;

export function isScore(v: unknown): v is number {
  return isCount(v);
}

export function isTimedResult(v: unknown): v is TimedResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isCount(r.moves) && r.moves > 0 && isCount(r.seconds);
}

export function isBetterTimed(result: TimedResult, best: TimedResult | null): boolean {
  return !best || result.moves < best.moves || (result.moves === best.moves && result.seconds < best.seconds);
}

export function formatTimed(r: TimedResult): string {
  return `${r.moves} moves · ${formatTime(r.seconds)}`;
}

/** The stored best for a game as display text, or null when it hasn't been played here yet. */
export function describeBest(slug: GameSlug): string | null {
  const value = readStored(BEST_KEYS[slug]);
  if (slug === "memory" || slug === "puzzle") return isTimedResult(value) ? formatTimed(value) : null;
  return isScore(value) && value > 0 ? `${formatNumber(value)} points` : null;
}
