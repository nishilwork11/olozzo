import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Ban, Gamepad2, Play, ShieldCheck, Smartphone, UserRoundX } from "lucide-react";
import { BestScore } from "@/components/games/BestScore";
import { GAMES } from "@/components/games/games";
import { GamePreview } from "@/components/games/GamePreview";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Games — take a break",
  description:
    "Free mini games to play in your browser: Memory Match, 2048, Sliding Puzzle and Snake. Just for fun — no prizes, no coupons, no sign-up.",
};

const PROMISES = [
  { icon: Ban, label: "No prizes or coupons" },
  { icon: UserRoundX, label: "No sign-up" },
  { icon: Smartphone, label: "Phone, tablet or computer" },
];

export default function GamesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sun-100 via-cream to-coral-100 text-ink-950">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sun-300/40 blur-2xl" />
          <span className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-coral-200/50 blur-2xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-800 ring-1 ring-inset ring-ink-200">
              <Gamepad2 size={14} className="text-coral-600" aria-hidden="true" /> olozzo games
            </span>
            <h1 className="mt-4 max-w-2xl text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:mt-5 sm:text-5xl lg:text-6xl">
              Take a break — free games, <span className="text-coral-600">just for fun</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15px] font-medium text-ink-700 sm:mt-5 sm:text-lg">
              Four quick mini games you can play right here. Beat your own best score, then get back to shopping whenever you like.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2 sm:mt-6" aria-label="Good to know">
              {PROMISES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-800 shadow-sm ring-1 ring-ink-200 sm:px-3 sm:py-1.5 sm:text-sm">
                  <Icon size={15} aria-hidden="true" /> {label}
                </li>
              ))}
            </ul>
            <a
              href="#games"
              className="btn btn-primary btn-lg mt-8 hidden sm:inline-flex"
            >
              Pick a game <ArrowDown size={18} aria-hidden="true" />
            </a>
          </div>

          {/* The four games as playful tiles */}
          <div aria-hidden="true" className="hidden grid-cols-2 gap-4 lg:grid">
            {GAMES.map((g, i) => {
              const Icon = g.icon;
              return (
                <span
                  key={g.slug}
                  className={cn(
                    "grid h-32 w-32 place-items-center rounded-3xl bg-white text-plum-700 shadow-xl shadow-ink-900/10",
                    ["-rotate-6", "rotate-3 translate-y-4", "rotate-6 -translate-y-2", "-rotate-3 translate-y-2"][i],
                  )}
                >
                  <span className="flex flex-col items-center gap-2">
                    <span className={cn("grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-white", g.gradient)}>
                      <Icon size={30} />
                    </span>
                    <span className="text-sm font-extrabold text-ink-900">{g.name}</span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" aria-labelledby="games-heading" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-8 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="games-heading" className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">
              Pick a game
            </h2>
            <p className="mt-1 text-ink-500">Free to play, no download — your best scores stay on this device.</p>
          </div>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-4">
          {GAMES.map((g) => {
            const Icon = g.icon;
            return (
              <li
                key={g.slug}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:rounded-3xl"
              >
                <div className={cn("relative h-28 overflow-hidden bg-gradient-to-br sm:h-40", g.gradient)}>
                  <span aria-hidden="true" className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
                  <span aria-hidden="true" className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10" />
                  <div className="relative h-full transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                    <GamePreview slug={g.slug} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-3 sm:p-5">
                  <h3 className="flex items-center gap-2 text-base font-extrabold leading-tight text-ink-900 sm:text-lg">
                    <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-plum-50 text-plum-700 sm:grid">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    {g.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-600 sm:mt-2 sm:text-sm">{g.tagline}</p>
                  <BestScore slug={g.slug} />
                  <div className="mt-auto pt-3 sm:pt-4">
                    {/* The whole card is clickable through this link's ::after */}
                    <Link href={`/games/${g.slug}`} className="btn btn-primary w-full rounded-xl py-2.5 after:absolute after:inset-0 after:content-['']">
                      <Play size={16} className="fill-current" aria-hidden="true" /> Play<span className="sr-only"> {g.name}</span>
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* No prizes, clearly */}
        <div className="mt-12 grid gap-4 rounded-3xl border border-plum-200 bg-plum-50 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-plum-700 shadow-sm">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-plum-950">Just for fun — really</h2>
            <p className="mt-1 text-sm leading-relaxed text-plum-900">
              These games have no prizes, coupons, discounts or rewards, and playing never changes prices or orders. There is nothing to
              sign up for: your best scores are saved only in this browser, and clearing your browser data removes them.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="btn btn-secondary">
            Back to the shop <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
