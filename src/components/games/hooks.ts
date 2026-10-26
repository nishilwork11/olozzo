import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { readStored, writeStored, type Dir } from "./shared";

// Hooks for the client-side mini games.

/**
 * A best score/result kept in localStorage. It is read after mount, so the server render and the first
 * client render match; `isValid` must be a stable (module-level) function.
 */
export function useBest<T>(key: string, isValid: (v: unknown) => v is T) {
  const [best, setBest] = useState<T | null>(null);
  useEffect(() => {
    const stored = readStored(key);
    if (isValid(stored)) setBest(stored);
  }, [key, isValid]);
  const save = useCallback(
    (value: T) => {
      setBest(value);
      writeStored(key, value);
    },
    [key],
  );
  return [best, save] as const;
}

/** A start/stop timer. `stop()` returns the elapsed time in milliseconds. */
export function useStopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(banked.current + performance.now() - startedAt.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    setRunning(true);
  }, []);

  const stop = useCallback((): number => {
    if (startedAt.current !== null) {
      banked.current += performance.now() - startedAt.current;
      startedAt.current = null;
    }
    setRunning(false);
    setElapsed(banked.current);
    return banked.current;
  }, []);

  const reset = useCallback(() => {
    startedAt.current = null;
    banked.current = 0;
    setRunning(false);
    setElapsed(0);
  }, []);

  return { seconds: Math.floor(elapsed / 1000), running, start, stop, reset };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Keyboard controls for a game, listened to on the window so they work right after the page loads.
 * A key is only handled while `enabled`, when focus is on the page itself or inside the game (never in the
 * site header, a search box or a menu), and its default action — scrolling the page — is only prevented
 * when `onKey` returns true because the game used it.
 */
export function useGameKeys(rootRef: RefObject<HTMLElement | null>, onKey: (e: KeyboardEvent) => boolean, enabled = true) {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const target = e.target instanceof Node ? e.target : null;
      const onPage = !target || target === document.body || target === document.documentElement;
      if (!onPage && !rootRef.current?.contains(target)) return;
      if (isTypingTarget(e.target)) return;
      if (handler.current(e)) e.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled, rootRef]);
}

/** True when the key would activate the focused button or link itself (so the game shouldn't use it too). */
export function activatesFocusedControl(e: KeyboardEvent): boolean {
  if (e.key !== " " && e.key !== "Enter") return false;
  return e.target instanceof HTMLElement && !!e.target.closest("button, a, [role='button']");
}

/**
 * Swipe gestures (touch, pen or mouse drag) on an element. The element should get the `touch-none` class
 * while `enabled`, so the swipe moves the game instead of scrolling the page. With `continuous`, one
 * gesture can steer several times (Snake); otherwise one gesture is one move (2048).
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  onSwipe: (dir: Dir) => void,
  { enabled, continuous = false, threshold = 24 }: { enabled: boolean; continuous?: boolean; threshold?: number },
) {
  const handler = useRef(onSwipe);
  useEffect(() => {
    handler.current = onSwipe;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; id: number } | null = null;

    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      handler.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
      start = continuous ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const end = (e: PointerEvent) => {
      if (start && e.pointerId === start.id) start = null;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
  }, [ref, enabled, continuous, threshold]);
}
