import { GameFrame } from "@/components/games/GameFrame";
import { gameMetadata } from "@/components/games/games";
import { SnakeGame } from "@/components/games/SnakeGame";

export const metadata = gameMetadata("snake");

export default function SnakePage() {
  return (
    <GameFrame slug="snake">
      <SnakeGame />
    </GameFrame>
  );
}
