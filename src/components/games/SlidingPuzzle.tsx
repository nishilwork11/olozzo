"use client";

import { useEffect, useRef, useState } from "react";
import { PartyPopper, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveRegion, NewBestBadge, Overlay, Stat, Stats } from "./GameUI";
import { useBest, useGameKeys, useStopwatch } from "./hooks";
import { BEST_KEYS, formatTime, isBetterTimed, isTimedResult, keyDirection, shuffle, type Dir, type TimedResult } from "./shared";
import styles from "./games.module.css";

const SIZE = 4;
const TILES = Array.from({ length: SIZE * SIZE - 1 }, (_, i) => i + 1);
/** Board as tile numbers by position, row by row; 0 is the gap */
const SOLVED = [...TILES, 0];

const isSolved = (board: number[]) => board.every((v, i) => v === SOLVED[i]);

function inversions(tiles: number[]): number {
  let n = 0;
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) n++;
  return n;
}

/**
 * A random board that can always be solved. With the gap in the bottom-right corner, a 4×4 board is
 * solvable exactly when its number of inversions is even, and swapping two tiles flips that parity.
 */
function shuffledBoard(): number[] {
  for (;;) {
    const tiles = shuffle(TILES);
    if (inversions(tiles) % 2 === 1) [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
    const board = [...tiles, 0];
    if (!isSolved(board)) return board;
  }
}

const rowOf = (pos: number) => Math.floor(pos / SIZE);
const colOf = (pos: number) => pos % SIZE;

/** Which way the tile at `pos` would slide, or null when it isn't in line with the gap. */
function slideDirection(board: number[], pos: number): Dir | null {
  const gap = board.indexOf(0);
  if (pos === gap) return null;
  if (rowOf(pos) === rowOf(gap)) return colOf(pos) < colOf(gap) ? "right" : "left";
  if (colOf(pos) === colOf(gap)) return rowOf(pos) < rowOf(gap) ? "down" : "up";
  return null;
}

/** Slides the tile at `pos` — and any tiles between it and the gap — one step towards the gap. */
function slideFrom(board: number[], pos: number): { board: number[]; dir: Dir; count: number } | null {
  const dir = slideDirection(board, pos);
  if (!dir) return null;
  const gap = board.indexOf(0);
  const step = dir === "right" ? -1 : dir === "left" ? 1 : dir === "down" ? -SIZE : SIZE;
  const next = [...board];
  for (let i = gap; i !== pos; i += step) next[i] = next[i + step];
  next[pos] = 0;
  return { board: next, dir, count: Math.abs(pos - gap) / Math.abs(step) };
}

/** The tile an arrow key moves: the one on the far side of the gap (↑ moves the tile below the gap up). */
function tileForKey(board: number[], dir: Dir): number | null {
  const gap = board.indexOf(0);
  const r = rowOf(gap);
  const c = colOf(gap);
  if (dir === "up") return r < SIZE - 1 ? gap + SIZE : null;
  if (dir === "down") return r > 0 ? gap - SIZE : null;
  if (dir === "left") return c < SIZE - 1 ? gap + 1 : null;
  return c > 0 ? gap - 1 : null;
}

export function SlidingPuzzle() {
  // The server renders the solved board; it is shuffled after mount, so the tiles visibly mix up
  const [board, setBoard] = useState<number[]>(SOLVED);
  const [moves, setMoves] = useState(0);
  const [shuffling, setShuffling] = useState(false);
  const [result, setResult] = useState<(TimedResult & { newBest: boolean }) | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [message, setMessage] = useState("");
  const [best, saveBest] = useBest(BEST_KEYS.puzzle, isTimedResult);
  const timer = useStopwatch();
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pending = useRef<number | undefined>(undefined);

  function newGame(focusBoard: boolean) {
    window.clearTimeout(pending.current);
    setBoard(shuffledBoard());
    setMoves(0);
    setResult(null);
    setShowResult(false);
    timer.reset();
    setShuffling(true);
    pending.current = window.setTimeout(() => setShuffling(false), 500);
    if (focusBoard) {
      setMessage("Tiles shuffled. The clock starts with your first move.");
      boardRef.current?.focus({ preventScroll: true });
    }
  }

  useEffect(() => {
    newGame(false);
    return () => window.clearTimeout(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveTile(pos: number) {
    if (result || shuffling) return;
    const slid = slideFrom(board, pos);
    if (!slid) return;
    timer.start();
    const count = moves + slid.count;
    setBoard(slid.board);
    setMoves(count);
    if (!isSolved(slid.board)) {
      setMessage(`${slid.count === 1 ? `Tile ${board[pos]}` : `${slid.count} tiles`} moved ${slid.dir}. ${count} moves.`);
      return;
    }
    const seconds = Math.floor(timer.stop() / 1000);
    const finished = { moves: count, seconds };
    const newBest = isBetterTimed(finished, best);
    if (newBest) saveBest(finished);
    setResult({ ...finished, newBest });
    setMessage(`Solved in ${count} moves and ${formatTime(seconds)}!${newBest ? " New personal best!" : ""}`);
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => setShowResult(true), 450);
  }

  useGameKeys(
    rootRef,
    (e) => {
      const dir = keyDirection(e);
      if (!dir) return false;
      const pos = tileForKey(board, dir);
      if (pos !== null) moveTile(pos);
      return true;
    },
    !result,
  );

  return (
    <div ref={rootRef} className="card p-3 sm:p-5">
      <Stats className="grid-cols-3">
        <Stat label="Moves" value={moves} />
        <Stat label="Time" value={formatTime(timer.seconds)} />
        <Stat label="Best" value={best ? best.moves : "—"} hint={best ? `moves · ${formatTime(best.seconds)}` : "not set yet"} />
      </Stats>

      <div className="relative mt-3 sm:mt-4">
        <div
          ref={boardRef}
          tabIndex={-1}
          role="group"
          aria-label="Sliding puzzle board"
          className={cn(
            styles.board,
            "select-none rounded-2xl bg-plum-700 shadow-inner focus:outline-none focus-visible:ring-4 focus-visible:ring-plum-300",
          )}
        >
          <div aria-hidden="true" className={styles.rows}>
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className={styles.row}>
                {[0, 1, 2, 3].map((c) => (
                  <div key={c} className="aspect-square rounded-lg bg-plum-800/50 sm:rounded-xl" />
                ))}
              </div>
            ))}
          </div>
          <div className="absolute inset-0">
            {TILES.map((n) => {
              const pos = board.indexOf(n);
              const dir = result ? null : slideDirection(board, pos);
              const inPlace = pos === n - 1;
              return (
                <button
                  key={n}
                  type="button"
                  tabIndex={dir ? 0 : -1}
                  aria-disabled={!dir || undefined}
                  aria-label={`Tile ${n}, row ${rowOf(pos) + 1}, column ${colOf(pos) + 1}${dir ? `, moves ${dir}` : ""}`}
                  onClick={() => moveTile(pos)}
                  style={{ "--r": rowOf(pos), "--c": colOf(pos), transitionDuration: shuffling ? "450ms" : undefined } as React.CSSProperties}
                  className={cn(
                    styles.tile,
                    styles.puzzleTile,
                    "grid place-items-center rounded-lg text-2xl font-extrabold tabular-nums shadow-[inset_0_-4px_0_rgba(0,0,0,0.12)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sun-400 sm:rounded-xl sm:text-3xl",
                    inPlace ? "bg-sun-200 text-plum-900" : "bg-white text-plum-800",
                    // Hover only where it exists, so a tapped tile doesn't stay highlighted on touch screens
                    dir ? cn("cursor-pointer", inPlace ? "[@media(hover:hover)]:hover:bg-sun-100" : "[@media(hover:hover)]:hover:bg-plum-50") : "cursor-default",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {result && showResult && (
          <Overlay
            title={
              <span className="inline-flex items-center gap-2">
                <PartyPopper className="text-plum-600" size={28} aria-hidden="true" /> Solved!
              </span>
            }
            actions={
              <button type="button" onClick={() => newGame(true)} className="btn btn-primary btn-lg">
                <Shuffle size={18} aria-hidden="true" /> Play again
              </button>
            }
          >
            <p>
              <strong className="text-ink-900">{result.moves} moves</strong> in <strong className="text-ink-900">{formatTime(result.seconds)}</strong>.
            </p>
            {result.newBest && <NewBestBadge />}
          </Overlay>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
        <p className="text-xs text-ink-500 sm:text-sm">
          <span className={styles.keyboardOnly}>Click a tile or use the arrow keys. Green tiles are in place.</span>
          <span className={styles.touchOnly}>Tap a tile in line with the gap. Green tiles are in place.</span>
        </p>
        <button type="button" onClick={() => newGame(false)} className="btn btn-secondary btn-sm shrink-0">
          <Shuffle size={14} aria-hidden="true" /> Shuffle
        </button>
      </div>

      <LiveRegion message={message} />
    </div>
  );
}
