import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Brain, Grid2x2, Puzzle, Worm } from "lucide-react";

// The just-for-fun mini games on /games. There are no prizes, coupons or accounts: best scores only live
// in the visitor's browser (see shared.ts).

export type GameSlug = "memory" | "2048" | "puzzle" | "snake";

export type GameInfo = {
  slug: GameSlug;
  name: string;
  /** One line for the hub card and the game page */
  tagline: string;
  icon: LucideIcon;
  /** Tailwind gradient stops for the card artwork and icon tile (Sunset colours only) */
  gradient: string;
  howTo: string[];
  controls: { input: string; action: string }[];
};

export const GAMES: GameInfo[] = [
  {
    slug: "memory",
    name: "Memory Match",
    tagline: "Flip the cards and find all 8 pairs.",
    icon: Brain,
    gradient: "from-plum-500 to-plum-700",
    howTo: [
      "Flip two cards per turn. If they show the same item, they stay face up.",
      "If they don't match, they turn back over — try to remember where they were.",
      "Find all 8 pairs in as few moves as you can.",
    ],
    controls: [
      { input: "Click or tap", action: "Flip a card" },
      { input: "Arrow keys", action: "Move between cards" },
      { input: "Enter or Space", action: "Flip the selected card" },
    ],
  },
  {
    slug: "2048",
    name: "2048",
    tagline: "Slide and merge the tiles to reach 2048.",
    icon: Grid2x2,
    gradient: "from-coral-500 to-plum-700",
    howTo: [
      "Every move slides all tiles as far as they go in one direction.",
      "Two tiles with the same number merge into one — and their sum is added to your score.",
      "A new tile appears after each move. Reach 2048, then keep going if you like.",
    ],
    controls: [
      { input: "Arrow keys or WASD", action: "Slide the tiles" },
      { input: "Swipe on the board", action: "Slide on a phone or tablet" },
    ],
  },
  {
    slug: "puzzle",
    name: "Sliding Puzzle",
    tagline: "Put the tiles back in order from 1 to 15.",
    icon: Puzzle,
    gradient: "from-sun-500 to-coral-700",
    howTo: [
      "Slide tiles into the empty space until they read 1 to 15, left to right, top to bottom.",
      "You can move a whole row or column at once by picking a tile in line with the gap.",
      "Every shuffle can be solved. Aim for fewer moves and a faster time.",
    ],
    controls: [
      { input: "Click or tap a tile", action: "Slide it into the gap" },
      { input: "Arrow keys or WASD", action: "Slide the tile next to the gap" },
    ],
  },
  {
    slug: "snake",
    name: "Snake",
    tagline: "Eat the apples and grow — don't bite your tail.",
    icon: Worm,
    gradient: "from-plum-600 to-coral-600",
    howTo: [
      "Steer the snake to the apple. Every apple makes it one longer and adds a point.",
      "The snake speeds up a little with every apple.",
      "The game ends when the snake hits a wall or its own tail.",
    ],
    controls: [
      { input: "Arrow keys or WASD", action: "Steer" },
      { input: "Space or P", action: "Pause and resume" },
      { input: "Swipe or the arrow buttons", action: "Steer on a phone or tablet" },
    ],
  },
];

export function getGame(slug: GameSlug): GameInfo {
  return GAMES.find((g) => g.slug === slug)!;
}

export function gameMetadata(slug: GameSlug): Metadata {
  const game = getGame(slug);
  return {
    title: `${game.name} — free game`,
    description: `${game.tagline} A free mini game at olozzo, just for fun: no prizes, no sign-up.`,
  };
}
