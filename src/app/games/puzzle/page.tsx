import { GameFrame } from "@/components/games/GameFrame";
import { gameMetadata } from "@/components/games/games";
import { SlidingPuzzle } from "@/components/games/SlidingPuzzle";

export const metadata = gameMetadata("puzzle");

export default function PuzzlePage() {
  return (
    <GameFrame slug="puzzle">
      <SlidingPuzzle />
    </GameFrame>
  );
}
