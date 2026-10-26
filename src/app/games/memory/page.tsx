import { GameFrame } from "@/components/games/GameFrame";
import { gameMetadata } from "@/components/games/games";
import { MemoryGame } from "@/components/games/MemoryGame";

export const metadata = gameMetadata("memory");

export default function MemoryPage() {
  return (
    <GameFrame slug="memory">
      <MemoryGame />
    </GameFrame>
  );
}
