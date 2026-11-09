import { chooseComputerMove, type Difficulty } from "../lib/game/ai";
import type { Board, Player, Scores } from "../lib/game/engine";

type AiRequest = { id: number; board: Board; scores: Scores; player: Player; difficulty: Difficulty };

// One long-lived worker serves both computer moves and hints. Each reply carries its request id.
self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, board, scores, player, difficulty } = event.data;
  self.postMessage({ id, choice: chooseComputerMove(board, scores, player, difficulty) });
};
