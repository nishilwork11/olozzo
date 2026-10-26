"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Time left until the daily deals selection changes (`until` = nextDealsRefresh()). It counts down to the
 * next selection only — prices don't change when it reaches zero. The time is rendered after mount
 * (the server can't know the visitor's clock), and the page refreshes once to show the new selection.
 */
export function DealsCountdown({ until, className }: { until: string; className?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(until).getTime();
    let refreshed = false;
    const tick = () => {
      const ms = end - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until, router]);

  return (
    <p
      className={cn("inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-2.5 py-1 text-xs font-semibold text-white", className)}
      title="A new selection of discounted products every day at 00:00 UTC"
    >
      <Clock size={13} aria-hidden="true" />
      <span>
        New deals in <span className="inline-block min-w-[7.5ch] tabular-nums">{left === null ? "--:--:--" : format(left)}</span>
      </span>
    </p>
  );
}
