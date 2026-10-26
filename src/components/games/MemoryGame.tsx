"use client";

import { useEffect, useRef, useState } from "react";
import { Car, Gamepad2, Gift, Headphones, PartyPopper, PawPrint, RotateCcw, Shirt, Sofa, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveRegion, NewBestBadge, Overlay, Stat, Stats } from "./GameUI";
import { useBest, useStopwatch } from "./hooks";
import { arrowDirection, BEST_KEYS, formatTime, isBetterTimed, isTimedResult, shuffle, type TimedResult } from "./shared";
import styles from "./games.module.css";

const ITEMS: { name: string; Icon: LucideIcon }[] = [
  { name: "T-shirt", Icon: Shirt },
  { name: "Watch", Icon: Watch },
  { name: "Headphones", Icon: Headphones },
  { name: "Game controller", Icon: Gamepad2 },
  { name: "Gift", Icon: Gift },
  { name: "Sofa", Icon: Sofa },
  { name: "Car", Icon: Car },
  { name: "Paw print", Icon: PawPrint },
];

const PAIRS = ITEMS.length;
const COLS = 4;
const ROWS = (PAIRS * 2) / COLS;
const MISMATCH_MS = 900;

type Card = { id: number; item: number };

// The server can't know the shuffle, so it renders face-down placeholders; the deck is dealt after mount.
const PLACEHOLDERS: Card[] = Array.from({ length: PAIRS * 2 }, (_, id) => ({ id, item: -1 }));

function deal(): Card[] {
  return shuffle(ITEMS.flatMap((_, item) => [item, item])).map((item, id) => ({ id, item }));
}

export function MemoryGame() {
  const [deck, setDeck] = useState<Card[] | null>(null);
  const [round, setRound] = useState(0);
  const [open, setOpen] = useState<number[]>([]); // face-up cards of the current turn (card indexes)
  const [found, setFound] = useState<number[]>([]); // matched items
  const [moves, setMoves] = useState(0);
  const [result, setResult] = useState<(TimedResult & { newBest: boolean }) | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [message, setMessage] = useState("");
  const [best, saveBest] = useBest(BEST_KEYS.memory, isTimedResult);
  const timer = useStopwatch();
  const pending = useRef<number | undefined>(undefined);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusFirstCard = useRef(false);

  useEffect(() => {
    setDeck(deal());
    return () => window.clearTimeout(pending.current);
  }, []);

  // A new round remounts the cards face down (no flip animation that could give the new layout away)
  useEffect(() => {
    if (!focusFirstCard.current) return;
    focusFirstCard.current = false;
    cardRefs.current[0]?.focus();
  }, [round]);

  function flip(index: number) {
    if (!deck || result) return;
    const card = deck[index];
    if (found.includes(card.item) || open.includes(index)) return;
    timer.start();
    window.clearTimeout(pending.current);
    // Picking a third card turns a non-matching pair back over straight away
    const turn = open.length === 2 ? [index] : [...open, index];
    setOpen(turn);
    const label = `Card ${index + 1}: ${ITEMS[card.item].name}.`;
    if (turn.length < 2) {
      setMessage(label);
      return;
    }
    const count = moves + 1;
    setMoves(count);
    if (deck[turn[0]].item !== card.item) {
      setMessage(`${label} No match, the cards turn back over.`);
      pending.current = window.setTimeout(() => setOpen([]), MISMATCH_MS);
      return;
    }
    const nowFound = [...found, card.item];
    setFound(nowFound);
    setOpen([]);
    if (nowFound.length < PAIRS) {
      setMessage(`${label} It's a match! ${nowFound.length} of ${PAIRS} pairs found.`);
      return;
    }
    const seconds = Math.floor(timer.stop() / 1000);
    const finished = { moves: count, seconds };
    const newBest = isBetterTimed(finished, best);
    if (newBest) saveBest(finished);
    setResult({ ...finished, newBest });
    setMessage(`${label} All ${PAIRS} pairs found in ${count} moves and ${formatTime(seconds)}.${newBest ? " New personal best!" : ""}`);
    // Let the last card finish turning before the result covers the board
    pending.current = window.setTimeout(() => setShowResult(true), 700);
  }

  function newGame(focusCards: boolean) {
    window.clearTimeout(pending.current);
    focusFirstCard.current = focusCards;
    setDeck(deal());
    setRound((r) => r + 1);
    setOpen([]);
    setFound([]);
    setMoves(0);
    setResult(null);
    setShowResult(false);
    timer.reset();
    setMessage(`New game: all ${PAIRS * 2} cards are face down.`);
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const dir = arrowDirection(e);
    if (!dir) return;
    const i = cardRefs.current.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const next =
      dir === "left" ? (col > 0 ? i - 1 : i)
      : dir === "right" ? (col < COLS - 1 ? i + 1 : i)
      : dir === "up" ? (row > 0 ? i - COLS : i)
      : row < ROWS - 1 ? i + COLS : i;
    cardRefs.current[next]?.focus();
  }

  return (
    <div className="card p-3 sm:p-5">
      <Stats className="grid-cols-3">
        <Stat label="Moves" value={moves} hint={`${found.length}/${PAIRS} pairs`} />
        <Stat label="Time" value={formatTime(timer.seconds)} />
        <Stat label="Best" value={best ? best.moves : "—"} hint={best ? `moves · ${formatTime(best.seconds)}` : "not set yet"} />
      </Stats>

      <div className="relative mt-3 sm:mt-4">
        <div
          key={round}
          role="group"
          aria-label="Memory cards, 4 by 4"
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-4 gap-2 sm:gap-3"
        >
          {(deck ?? PLACEHOLDERS).map((card, i) => {
            const item = deck ? ITEMS[card.item] : null;
            const matched = !!item && found.includes(card.item);
            const faceUp = !!item && (matched || open.includes(i));
            return (
              <button
                key={card.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                type="button"
                onClick={() => flip(i)}
                aria-label={item && faceUp ? `Card ${i + 1}: ${item.name}${matched ? ", matched" : ""}` : `Card ${i + 1}, face down`}
                aria-disabled={!item || matched || !!result || undefined}
                className={cn(
                  "aspect-square rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                  styles.flipScene,
                  matched && styles.matched,
                )}
              >
                <span className={cn(styles.flipCard, faceUp && styles.flipped)}>
                  {/* Back: the olozzo mark */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      styles.face,
                      "grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm ring-1 ring-inset ring-black/5",
                    )}
                  >
                    <span className="relative h-[34%] w-[34%] rounded-full border-[3px] border-white/90 sm:border-4">
                      <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-lime-300 sm:h-2.5 sm:w-2.5" />
                    </span>
                  </span>
                  {/* Front */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      styles.face,
                      styles.faceFront,
                      "grid place-items-center rounded-xl border-2 shadow-sm",
                      matched ? "border-brand-400 bg-brand-50 text-brand-600" : "border-brand-200 bg-white text-brand-700",
                    )}
                  >
                    {item && <item.Icon className="h-1/2 w-1/2" strokeWidth={1.75} />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {result && showResult && (
          <Overlay
            title={
              <span className="inline-flex items-center gap-2">
                <PartyPopper className="text-brand-600" size={28} aria-hidden="true" /> You did it!
              </span>
            }
            actions={
              <button type="button" onClick={() => newGame(true)} className="btn btn-primary btn-lg">
                <RotateCcw size={18} aria-hidden="true" /> Play again
              </button>
            }
          >
            <p>
              All {PAIRS} pairs in <strong className="text-ink-900">{result.moves} moves</strong> and{" "}
              <strong className="text-ink-900">{formatTime(result.seconds)}</strong>.
            </p>
            {result.newBest && <NewBestBadge />}
          </Overlay>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
        <p className="text-xs text-ink-500 sm:text-sm">
          {result
            ? "Well played! Start a new game whenever you like."
            : timer.running || moves > 0
              ? "Find every pair in as few moves as you can."
              : "Flip any card to start the clock."}
        </p>
        <button type="button" onClick={() => newGame(false)} className="btn btn-secondary btn-sm shrink-0">
          <RotateCcw size={14} aria-hidden="true" /> New game
        </button>
      </div>

      <LiveRegion message={message} />
    </div>
  );
}
