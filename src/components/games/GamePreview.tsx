import { Apple, Watch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameSlug } from "./games";

// Small decorative previews of each game for the hub cards (CSS and icons only, hidden from screen readers).

function MemoryArt() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-[4.5rem] w-14 -rotate-6 place-items-center rounded-xl border-2 border-brand-200 bg-white text-brand-600 shadow-lg">
        <Watch size={26} strokeWidth={1.75} />
      </span>
      <span className="grid h-[4.5rem] w-14 -translate-y-1 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-lg ring-2 ring-white/40">
        <span className="relative h-5 w-5 rounded-full border-[3px] border-white">
          <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-lime-300" />
        </span>
      </span>
      <span className="grid h-[4.5rem] w-14 rotate-6 place-items-center rounded-xl border-2 border-brand-200 bg-white text-brand-600 shadow-lg">
        <Watch size={26} strokeWidth={1.75} />
      </span>
    </div>
  );
}

function Art2048() {
  const tiles: [string, string][] = [
    ["2", "bg-white text-ink-800"],
    ["8", "bg-brand-300 text-brand-950"],
    ["64", "bg-lime-300 text-lime-950"],
    ["2048", "bg-yellow-300 text-yellow-950 text-sm"],
  ];
  return (
    <div className="grid rotate-3 grid-cols-2 gap-1.5 rounded-2xl bg-brand-900/40 p-1.5 shadow-lg">
      {tiles.map(([n, color]) => (
        <span key={n} className={cn("grid h-12 w-12 place-items-center rounded-lg text-lg font-extrabold", color)}>
          {n}
        </span>
      ))}
    </div>
  );
}

function PuzzleArt() {
  const tiles = [1, 2, 3, 4, 5, 6, 7, 0, 8];
  return (
    <div className="grid -rotate-3 grid-cols-3 gap-1 rounded-2xl bg-brand-900/40 p-1.5 shadow-lg">
      {tiles.map((n) =>
        n === 0 ? (
          <span key={n} className="h-9 w-9" />
        ) : (
          <span
            key={n}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-md text-sm font-extrabold shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]",
              n < 7 ? "bg-lime-200 text-brand-900" : "bg-white text-brand-800",
            )}
          >
            {n}
          </span>
        ),
      )}
    </div>
  );
}

function SnakeArt() {
  // A little snake on a 7 × 4 grid, head first
  const body = [
    [5, 1],
    [4, 1],
    [3, 1],
    [2, 1],
    [2, 2],
    [2, 3],
    [1, 3],
  ];
  return (
    <div className="relative h-[5.5rem] w-[9.5rem] rounded-2xl bg-white/15 shadow-lg ring-1 ring-inset ring-white/25">
      {body.map(([x, y], i) => (
        <span
          key={`${x}-${y}`}
          className={cn("absolute h-5 w-5 rounded-md", i === 0 ? "bg-brand-900" : i % 2 ? "bg-white" : "bg-brand-100")}
          style={{ left: `${x * 1.25 + 0.25}rem`, top: `${y * 1.25 + 0.25}rem` }}
        >
          {i === 0 && (
            <>
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-white" />
              <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-white" />
            </>
          )}
        </span>
      ))}
      <Apple className="absolute h-5 w-5 fill-lime-300 text-lime-800" style={{ left: "7.75rem", top: "1.5rem" }} strokeWidth={2.25} />
    </div>
  );
}

export function GamePreview({ slug }: { slug: GameSlug }) {
  return (
    <div aria-hidden="true" className="flex h-full scale-[0.72] items-center justify-center sm:scale-100">
      {slug === "memory" ? <MemoryArt /> : slug === "2048" ? <Art2048 /> : slug === "puzzle" ? <PuzzleArt /> : <SnakeArt />}
    </div>
  );
}
