"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { GameSlug } from "./games";
import { describeBest } from "./shared";

/** "Your best: …" on a hub card, read from this browser after mount (nothing is stored anywhere else). */
export function BestScore({ slug }: { slug: GameSlug }) {
  const [best, setBest] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setBest(describeBest(slug));
  }, [slug]);

  return (
    <p className="mt-2 flex min-h-[1.25rem] items-center gap-1.5 text-[11px] font-medium leading-tight text-ink-500 sm:mt-3 sm:text-xs">
      {best === undefined ? null : best ? (
        <>
          <Star size={14} className="shrink-0 fill-lime-300 text-brand-700" aria-hidden="true" />
          <span>
            Your best: <span className="font-bold text-ink-800">{best}</span>
          </span>
        </>
      ) : (
        "Not played on this device yet"
      )}
    </p>
  );
}
