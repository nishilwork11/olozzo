import { Game2048 } from "@/components/games/Game2048";
import { GameFrame } from "@/components/games/GameFrame";
import { gameMetadata } from "@/components/games/games";

export const metadata = gameMetadata("2048");

export default function Page2048() {
  return (
    <GameFrame slug="2048">
      <Game2048 />
    </GameFrame>
  );
}
