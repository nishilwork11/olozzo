"use client";

import { useEffect, useRef, useState } from "react";
import { PartyPopper, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveRegion, NewBestBadge, Overlay, Stat, Stats } from "./GameUI";
import { useBest, useGameKeys, useSwipe } from "./hooks";
import { BEST_KEYS, formatNumber, isScore, keyDirection, type Dir } from "./shared";
import styles from "./games.module.css";

const SIZE = 4;
const GOAL = 2048;

type Tile = {
  id: number;
  value: number;
  r: number;
  c: number;
  /** Appeared after the last move (scales in) */
  fresh?: boolean;
  /** Made by a merge in the last move (pops in) */
  merged?: boolean;
  /** Slid into a merge and is removed once the slide has finished */
  gone?: boolean;
};

type Status = "playing" | "won" | "over";

function spawn(tiles: Tile[], id: number): Tile[] {
  const taken = new Set(tiles.filter((t) => !t.gone).map((t) => t.r * SIZE + t.c));
  const free = Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => !taken.has(i));
  if (free.length === 0) return tiles;
  const cell = free[Math.floor(Math.random() * free.length)];
  return [...tiles, { id, value: Math.random() < 0.9 ? 2 : 4, r: Math.floor(cell / SIZE), c: cell % SIZE, fresh: true }];
}

/** Slides every tile as far as it goes; equal neighbours merge once per move. */
function slide(tiles: Tile[], dir: Dir, nextId: () => number): { tiles: Tile[]; moved: boolean; gained: number } {
  const vertical = dir === "up" || dir === "down";
  const towardStart = dir === "left" || dir === "up";
  const live = tiles.filter((t) => !t.gone);
  const out: Tile[] = [];
  let moved = false;
  let gained = 0;
  for (let line = 0; line < SIZE; line++) {
    const inLine = live
      .filter((t) => (vertical ? t.c : t.r) === line)
      .sort((a, b) => {
        const pa = vertical ? a.r : a.c;
        const pb = vertical ? b.r : b.c;
        return towardStart ? pa - pb : pb - pa;
      });
    const placed: Tile[] = [];
    for (const t of inLine) {
      const last = placed[placed.length - 1];
      if (last && !last.merged && last.value === t.value) {
        // Both tiles slide into the same cell, then a new tile worth double replaces them
        const value = t.value * 2;
        out.push({ ...last, gone: true }, { ...t, r: last.r, c: last.c, fresh: false, gone: true });
        placed[placed.length - 1] = { id: nextId(), value, r: last.r, c: last.c, merged: true };
        gained += value;
        moved = true;
        continue;
      }
      const pos = towardStart ? placed.length : SIZE - 1 - placed.length;
      const next: Tile = { ...t, r: vertical ? pos : t.r, c: vertical ? t.c : pos, fresh: false, merged: false };
      if (next.r !== t.r || next.c !== t.c) moved = true;
      placed.push(next);
    }
    out.push(...placed);
  }
  return { tiles: out, moved, gained };
}

function canMove(tiles: Tile[]): boolean {
  const grid = new Array<number>(SIZE * SIZE).fill(0);
  for (const t of tiles) if (!t.gone) grid[t.r * SIZE + t.c] = t.value;
  return grid.some((v, i) => {
    const c = i % SIZE;
    return v === 0 || (c < SIZE - 1 && grid[i + 1] === v) || (i + SIZE < grid.length && grid[i + SIZE] === v);
  });
}

const TILE_COLORS: Record<number, string> = {
  2: "bg-white text-ink-800",
  4: "bg-brand-100 text-brand-900",
  8: "bg-brand-300 text-brand-950",
  16: "bg-brand-400 text-brand-950",
  32: "bg-lime-200 text-lime-950",
  64: "bg-lime-300 text-lime-950",
  128: "bg-teal-200 text-teal-950",
  256: "bg-teal-300 text-teal-950",
  512: "bg-cyan-200 text-cyan-950",
  1024: "bg-cyan-300 text-cyan-950",
  2048: "bg-yellow-300 text-yellow-950 ring-4 ring-yellow-200/80",
};

function tileClass(value: number): string {
  const size =
    value < 100 ? "text-3xl sm:text-4xl" : value < 1000 ? "text-2xl sm:text-3xl" : value < 10000 ? "text-xl sm:text-2xl" : "text-base sm:text-xl";
  return cn(TILE_COLORS[value] ?? "bg-ink-900 text-lime-300", size);
}

export function Game2048() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<Status>("playing");
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [gain, setGain] = useState<{ key: number; value: number } | null>(null);
  const [message, setMessage] = useState("");
  const [newBest, setNewBest] = useState(false);
  const [best, saveBest] = useBest(BEST_KEYS["2048"], isScore);
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const ids = useRef(0);
  const cleanup = useRef<number | undefined>(undefined);
  // The best score before this game, to tell whether it was beaten (read on the first move, once loaded)
  const bestBefore = useRef<number | null>(null);

  function nextId() {
    return ++ids.current;
  }

  function newGame(focusBoard: boolean) {
    window.clearTimeout(cleanup.current);
    setTiles(spawn(spawn([], nextId()), nextId()));
    setScore(0);
    setStatus("playing");
    setKeepPlaying(false);
    setGain(null);
    setNewBest(false);
    bestBefore.current = null;
    if (focusBoard) {
      setMessage("New game started.");
      boardRef.current?.focus({ preventScroll: true });
    }
  }

  // The first tiles are random, so they are placed after mount (the server renders an empty board)
  useEffect(() => {
    newGame(false);
    return () => window.clearTimeout(cleanup.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(dir: Dir): boolean {
    if (status !== "playing") return false;
    bestBefore.current ??= best ?? 0;
    const result = slide(tiles, dir, nextId);
    if (!result.moved) return true;
    const next = spawn(result.tiles, nextId());
    setTiles(next);
    window.clearTimeout(cleanup.current);
    cleanup.current = window.setTimeout(() => setTiles((ts) => ts.filter((t) => !t.gone)), 180);

    const total = score + result.gained;
    if (result.gained > 0) {
      setScore(total);
      setGain({ key: ids.current, value: result.gained });
      if (total > (best ?? 0)) saveBest(total);
    }
    const live = next.filter((t) => !t.gone);
    if (!keepPlaying && live.some((t) => t.value >= GOAL)) {
      setStatus("won");
      setMessage(`You made ${GOAL}! Score ${formatNumber(total)}. Keep playing or start a new game.`);
    } else if (!canMove(live)) {
      const beaten = total > bestBefore.current;
      setStatus("over");
      setNewBest(beaten);
      setMessage(`No more moves. Game over with ${formatNumber(total)} points.${beaten ? " New personal best!" : ""}`);
    } else if (result.gained > 0) {
      setMessage(`Score ${formatNumber(total)}`);
    }
    return true;
  }

  useGameKeys(
    rootRef,
    (e) => {
      const dir = keyDirection(e);
      return dir ? move(dir) : false;
    },
    status === "playing",
  );
  useSwipe(boardRef, (dir) => move(dir), { enabled: status === "playing" });

  const grid = Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => tiles.find((t) => !t.gone && t.r === r && t.c === c)?.value ?? 0),
  );

  return (
    <div ref={rootRef} className="card p-3 sm:p-5">
      <div className="flex gap-2">
        <Stats className="flex-1 grid-cols-2">
          <Stat
            label="Score"
            value={
              <>
                {formatNumber(score)}
                {gain && (
                  <span
                    key={gain.key}
                    aria-hidden="true"
                    className={cn("pointer-events-none absolute inset-x-0 -top-1 text-center text-sm font-extrabold text-brand-600 opacity-0", styles.gain)}
                  >
                    +{gain.value}
                  </span>
                )}
              </>
            }
          />
          <Stat label="Best" value={formatNumber(Math.max(best ?? 0, score))} />
        </Stats>
        <button type="button" onClick={() => newGame(true)} className="btn btn-primary h-auto shrink-0 flex-col gap-0.5 px-3 sm:flex-row sm:gap-2 sm:px-4">
          <RotateCcw size={16} aria-hidden="true" /> New game
        </button>
      </div>

      <div className="relative mt-3 sm:mt-4">
        <div
          ref={boardRef}
          tabIndex={-1}
          role="group"
          aria-label="2048 board"
          className={cn(
            styles.board,
            "select-none rounded-2xl bg-brand-700 shadow-inner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300",
            status === "playing" && "touch-none",
          )}
        >
          {/* Empty cells — also the board as screen readers read it */}
          <div role="table" aria-label="Tiles, row by row" className={styles.rows}>
            {grid.map((row, r) => (
              <div role="row" key={r} className={styles.row}>
                {row.map((value, c) => (
                  <div role="cell" key={c} className="aspect-square rounded-lg bg-brand-800/50 sm:rounded-xl">
                    <span className="sr-only">{value || "empty"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="absolute inset-0">
            {tiles.map((t) => (
              <div
                key={t.id}
                className={cn(styles.tile, t.gone ? "z-0" : t.merged ? "z-20" : "z-10")}
                style={{ "--r": t.r, "--c": t.c } as React.CSSProperties}
              >
                <div
                  className={cn(
                    "grid h-full w-full place-items-center rounded-lg font-extrabold tabular-nums shadow-sm sm:rounded-xl",
                    tileClass(t.value),
                    t.fresh && styles.appear,
                    t.merged && styles.pop,
                  )}
                >
                  {t.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {status === "won" && (
          <Overlay
            tone="brand"
            title={
              <span className="inline-flex items-center gap-2">
                <PartyPopper size={28} aria-hidden="true" /> {GOAL}!
              </span>
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setKeepPlaying(true);
                    setStatus("playing");
                    setMessage("Keep going! Use the arrow keys or swipe.");
                    boardRef.current?.focus({ preventScroll: true });
                  }}
                  className="btn btn-lg bg-white text-brand-800 shadow-sm hover:bg-brand-50"
                >
                  Keep playing
                </button>
                <button type="button" onClick={() => newGame(true)} className="btn btn-lg border border-white/40 text-white hover:bg-white/10">
                  New game
                </button>
              </>
            }
          >
            <p>You made the {GOAL} tile with {formatNumber(score)} points. How far can you go?</p>
          </Overlay>
        )}
        {status === "over" && (
          <Overlay
            title="No more moves"
            actions={
              <button type="button" onClick={() => newGame(true)} className="btn btn-primary btn-lg">
                <RotateCcw size={18} aria-hidden="true" /> Try again
              </button>
            }
          >
            <p>
              You scored <strong className="text-ink-900">{formatNumber(score)}</strong> points.
            </p>
            {newBest && <NewBestBadge />}
          </Overlay>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-500 sm:text-sm">
        <span className={styles.keyboardOnly}>
          Use the <span className="font-semibold text-ink-700">arrow keys</span> or <span className="font-semibold text-ink-700">WASD</span>. Merge equal
          tiles to reach {GOAL}.
        </span>
        <span className={styles.touchOnly}>Swipe on the board to slide the tiles. Merge equal tiles to reach {GOAL}.</span>
      </p>

      <LiveRegion message={message} />
    </div>
  );
}
