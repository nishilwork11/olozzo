"use client";

import { useEffect, useRef, useState } from "react";
import { Apple, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveRegion, NewBestBadge, Overlay, Stat, Stats } from "./GameUI";
import { activatesFocusedControl, useBest, useGameKeys, useSwipe } from "./hooks";
import { BEST_KEYS, formatNumber, isScore, keyDirection, OPPOSITE, type Dir } from "./shared";
import styles from "./games.module.css";

const CELLS = 15;
const CELL = 100 / CELLS; // % of the board
// Milliseconds per step: a little quicker with every apple, down to a floor
const START_MS = 165;
const SPEED_UP_MS = 3;
const FASTEST_MS = 75;

type Point = { x: number; y: number };
type Status = "idle" | "running" | "paused" | "over";
type GameState = { snake: Point[]; dir: Dir; food: Point; score: number };

const STEP: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// A fixed start (including the first apple), so the server and the first client render match
const START: GameState = {
  snake: [
    { x: 6, y: 7 },
    { x: 5, y: 7 },
    { x: 4, y: 7 },
  ],
  dir: "right",
  food: { x: 10, y: 7 },
  score: 0,
};

const stepDelay = (score: number) => Math.max(FASTEST_MS, START_MS - score * SPEED_UP_MS);

function freeCell(snake: Point[]): Point | null {
  const taken = new Set(snake.map((p) => p.y * CELLS + p.x));
  const free = Array.from({ length: CELLS * CELLS }, (_, i) => i).filter((i) => !taken.has(i));
  if (free.length === 0) return null;
  const i = free[Math.floor(Math.random() * free.length)];
  return { x: i % CELLS, y: Math.floor(i / CELLS) };
}

const cellStyle = (p: Point): React.CSSProperties => ({ left: `${p.x * CELL}%`, top: `${p.y * CELL}%`, width: `${CELL}%`, height: `${CELL}%` });

const EYES: Record<Dir, [string, string]> = {
  right: ["right-[14%] top-[16%]", "right-[14%] bottom-[16%]"],
  left: ["left-[14%] top-[16%]", "left-[14%] bottom-[16%]"],
  up: ["top-[14%] left-[16%]", "top-[14%] right-[16%]"],
  down: ["bottom-[14%] left-[16%]", "bottom-[14%] right-[16%]"],
};

const PAD: { dir: Dir; label: string; icon: LucideIcon; area: string }[] = [
  { dir: "up", label: "Steer up", icon: ArrowUp, area: "col-start-2 row-start-1" },
  { dir: "left", label: "Steer left", icon: ArrowLeft, area: "col-start-1 row-start-2" },
  { dir: "right", label: "Steer right", icon: ArrowRight, area: "col-start-3 row-start-2" },
  { dir: "down", label: "Steer down", icon: ArrowDown, area: "col-start-2 row-start-3" },
];

export function SnakeGame() {
  const [game, setGame] = useState<GameState>(START);
  const [status, setStatus] = useState<Status>("idle");
  const [newBest, setNewBest] = useState(false);
  const [message, setMessage] = useState("");
  const [best, saveBest] = useBest(BEST_KEYS.snake, isScore);
  const turns = useRef<Dir[]>([]); // queued turns, so quick double taps aren't lost between steps
  const bestBefore = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  function finish(score: number, filledBoard = false) {
    setStatus("over");
    turns.current = [];
    const beaten = score > bestBefore.current;
    setNewBest(beaten);
    setMessage(
      filledBoard
        ? `Incredible — the snake filled the whole board! Final score ${score}.`
        : `Game over! You scored ${score} ${score === 1 ? "point" : "points"}.${beaten ? " New personal best!" : ""}`,
    );
  }

  function step() {
    const dir = turns.current.shift() ?? game.dir;
    const head = game.snake[0];
    const next = { x: head.x + STEP[dir].x, y: head.y + STEP[dir].y };
    const eats = next.x === game.food.x && next.y === game.food.y;
    // The tail moves out of the way this step unless the snake grows
    const body = eats ? game.snake : game.snake.slice(0, -1);
    const crashed =
      next.x < 0 || next.y < 0 || next.x >= CELLS || next.y >= CELLS || body.some((p) => p.x === next.x && p.y === next.y);
    if (crashed) return finish(game.score);
    const snake = [next, ...body];
    if (!eats) return setGame({ ...game, snake, dir });
    const score = game.score + 1;
    if (score > (best ?? 0)) saveBest(score);
    const food = freeCell(snake);
    setGame({ snake, dir, food: food ?? game.food, score });
    if (!food) return finish(score, true);
    setMessage(`Yum! Score ${score}.`);
  }

  // Game loop: one step per tick while running, re-armed after every step (so the speed can change)
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setTimeout(step, stepDelay(game.score));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, game]);

  // Pause when the page is hidden (another tab, phone locked)
  useEffect(() => {
    if (status !== "running") return;
    const onVisibility = () => {
      if (!document.hidden) return;
      setStatus("paused");
      setMessage("Paused while you were away.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status]);

  function begin(fresh: boolean, focusPause = false) {
    turns.current = [];
    bestBefore.current = best ?? 0;
    if (fresh) setGame({ ...START, food: freeCell(START.snake) ?? START.food });
    setNewBest(false);
    setStatus("running");
    setMessage("Go! The snake is moving.");
    if (focusPause) requestAnimationFrame(() => pauseRef.current?.focus({ preventScroll: true }));
    // On touch screens, bring the arrow buttons into view along with the board
    const pad = padRef.current;
    if (pad && pad.offsetParent !== null) pad.scrollIntoView({ block: "nearest" });
  }

  function steer(dir: Dir) {
    if (status === "over") return;
    if (status === "idle") begin(false);
    else if (status === "paused") resume();
    const queued = turns.current;
    const last = queued.length ? queued[queued.length - 1] : game.dir;
    if (dir !== last && dir !== OPPOSITE[last] && queued.length < 3) queued.push(dir);
  }

  function pause() {
    if (status !== "running") return;
    setStatus("paused");
    setMessage("Paused.");
  }

  function resume() {
    if (status !== "paused") return;
    setStatus("running");
    setMessage("Resumed.");
  }

  function reset() {
    turns.current = [];
    setGame(START);
    setStatus("idle");
    setNewBest(false);
    setMessage("New game. Press an arrow key or Start when you're ready.");
  }

  useGameKeys(
    rootRef,
    (e) => {
      const dir = keyDirection(e);
      if (dir) {
        steer(dir);
        return true;
      }
      const toggle = e.key === " " || e.code === "KeyP";
      if ((toggle || e.key === "Escape") && !activatesFocusedControl(e)) {
        if (status === "running") {
          pause();
          return true;
        }
        if (status === "paused" && toggle) {
          resume();
          return true;
        }
      }
      return false;
    },
    status !== "over",
  );
  useSwipe(boardRef, steer, { enabled: status === "running", continuous: true });

  return (
    <div ref={rootRef} className="card p-3 sm:p-5">
      <div className="flex gap-2">
        <Stats className="flex-1 grid-cols-2">
          <Stat label="Score" value={formatNumber(game.score)} />
          <Stat label="Best" value={formatNumber(Math.max(best ?? 0, game.score))} />
        </Stats>
        <button
          ref={pauseRef}
          type="button"
          onClick={status === "paused" ? resume : pause}
          disabled={status === "idle" || status === "over"}
          className="btn btn-secondary h-auto w-[5.5rem] shrink-0 flex-col gap-0.5 px-3 sm:w-auto sm:flex-row sm:gap-2 sm:px-4"
        >
          {status === "paused" ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          {status === "paused" ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="relative mt-3 sm:mt-4">
        <div
          ref={boardRef}
          role="img"
          aria-label={`Snake board, ${CELLS} by ${CELLS} squares. The snake is ${game.snake.length} squares long.`}
          className={cn(
            styles.snakeBoard,
            "relative aspect-square w-full select-none overflow-hidden rounded-2xl ring-1 ring-inset ring-brand-200",
            status === "running" && "touch-none",
          )}
        >
          <div className="absolute grid place-items-center" style={cellStyle(game.food)}>
            <Apple className={cn("h-[82%] w-[82%] fill-lime-300 text-lime-700", styles.foodBob)} strokeWidth={2.25} />
          </div>
          {game.snake.map((p, i) => (
            <div key={i} className="absolute p-px sm:p-[1.5px]" style={cellStyle(p)}>
              <div
                className={cn(
                  "relative h-full w-full",
                  i === 0 ? "z-10 rounded-[38%] bg-brand-700 shadow-sm" : cn("rounded-[30%]", i % 2 ? "bg-brand-500" : "bg-brand-600"),
                )}
              >
                {i === 0 &&
                  EYES[game.dir].map((pos) => (
                    <span key={pos} className={cn("absolute h-[30%] w-[30%] rounded-full bg-white", pos)}>
                      <span className="absolute inset-[28%] rounded-full bg-ink-900" />
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {status === "idle" && (
          <Overlay
            autoFocus={false}
            title="Ready?"
            actions={
              <button type="button" onClick={() => begin(false, true)} className="btn btn-primary btn-lg">
                <Play size={18} aria-hidden="true" /> Start
              </button>
            }
          >
            <p className={styles.keyboardOnly}>Press an arrow key or WASD to start steering.</p>
            <p className={styles.touchOnly}>Tap Start, then swipe on the board or use the arrow buttons below.</p>
          </Overlay>
        )}
        {status === "paused" && (
          <Overlay
            title="Paused"
            actions={
              <>
                <button type="button" onClick={resume} className="btn btn-primary btn-lg">
                  <Play size={18} aria-hidden="true" /> Resume
                </button>
                <button type="button" onClick={reset} className="btn btn-secondary btn-lg">
                  <RotateCcw size={18} aria-hidden="true" /> Restart
                </button>
              </>
            }
          >
            <p>Score {formatNumber(game.score)} — take your time.</p>
          </Overlay>
        )}
        {status === "over" && (
          <Overlay
            title="Game over"
            actions={
              <button type="button" onClick={() => begin(true, true)} className="btn btn-primary btn-lg">
                <RotateCcw size={18} aria-hidden="true" /> Play again
              </button>
            }
          >
            <p>
              You scored <strong className="text-ink-900">{formatNumber(game.score)}</strong> {game.score === 1 ? "point" : "points"}.
            </p>
            {newBest && <NewBestBadge />}
          </Overlay>
        )}
      </div>

      {/* On-screen arrows for touch screens */}
      <div ref={padRef} className={cn(styles.touchOnly, "mt-3")}>
        <div role="group" aria-label="Steering" className="mx-auto grid w-44 grid-cols-3 grid-rows-3 gap-2">
          {PAD.map(({ dir, label, icon: Icon, area }) => (
            <button
              key={dir}
              type="button"
              aria-label={label}
              disabled={status === "over"}
              onPointerDown={(e) => {
                e.preventDefault();
                steer(dir);
              }}
              onClick={(e) => {
                if (e.detail === 0) steer(dir); // keyboard activation; taps are handled on pointer down
              }}
              className={cn(
                "grid aspect-square touch-manipulation place-items-center rounded-2xl bg-brand-600 text-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.15)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 active:bg-brand-700 disabled:opacity-50",
                area,
              )}
            >
              <Icon size={24} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            aria-label={status === "paused" ? "Resume" : "Pause"}
            onClick={status === "paused" ? resume : pause}
            disabled={status === "idle" || status === "over"}
            className="col-start-2 row-start-2 grid aspect-square touch-manipulation place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 disabled:opacity-50"
          >
            {status === "paused" ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
        <p className="text-xs text-ink-500 sm:text-sm">
          <span className={styles.keyboardOnly}>Arrow keys or WASD to steer · Space or P to pause.</span>
          <span className={styles.touchOnly}>Swipe on the board or use the arrows to steer.</span>
        </p>
        <button type="button" onClick={reset} className="btn btn-secondary btn-sm shrink-0">
          <RotateCcw size={14} aria-hidden="true" /> New game
        </button>
      </div>

      <LiveRegion message={message} />
    </div>
  );
}
