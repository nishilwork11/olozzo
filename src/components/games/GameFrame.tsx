import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GAMES, getGame, type GameSlug } from "./games";

/** The page around a game: back link, title, the game itself, how to play and links to the other games. */
export function GameFrame({ slug, children }: { slug: GameSlug; children: React.ReactNode }) {
  const game = getGame(slug);
  const Icon = game.icon;
  const others = GAMES.filter((g) => g.slug !== slug);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-semibold text-plum-700 hover:text-plum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-500"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to games
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm", game.gradient)}>
          <Icon size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">{game.name}</h1>
          <p className="text-sm text-ink-500">{game.tagline}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-6 lg:mt-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-10">
        <div className="mx-auto w-full max-w-[30rem]">{children}</div>

        <aside className="space-y-4" aria-label={`About ${game.name}`}>
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-bold text-ink-900">
              <Info size={18} className="text-plum-600" aria-hidden="true" /> How to play
            </h2>
            <ol className="mt-3 space-y-2.5 text-sm text-ink-600">
              {game.howTo.map((text, i) => (
                <li key={text} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-plum-100 text-[11px] font-bold text-plum-800" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-500">Controls</h3>
            <dl className="mt-1 divide-y divide-ink-100 text-sm">
              {game.controls.map((c) => (
                <div key={c.input} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="font-semibold text-ink-800">{c.input}</dt>
                  <dd className="text-right text-ink-500">{c.action}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="flex gap-3 rounded-2xl border border-plum-200 bg-plum-50 p-4 text-sm text-plum-900">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-plum-600" aria-hidden="true" />
            <span>
              <strong>Just for fun.</strong> There are no prizes, coupons or sign-up. Your best score is saved only in this browser.
            </span>
          </p>

          <section aria-labelledby="more-games">
            <h2 id="more-games" className="text-sm font-bold text-ink-900">
              More games
            </h2>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {others.map((g) => {
                const OtherIcon = g.icon;
                return (
                  <li key={g.slug}>
                    <Link
                      href={`/games/${g.slug}`}
                      className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 transition hover:border-plum-300 hover:bg-plum-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-500"
                    >
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white", g.gradient)}>
                        <OtherIcon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink-900">{g.name}</span>
                        <span className="block truncate text-xs text-ink-500">{g.tagline}</span>
                      </span>
                      <ArrowRight size={16} className="shrink-0 text-ink-400 transition group-hover:text-plum-600" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
