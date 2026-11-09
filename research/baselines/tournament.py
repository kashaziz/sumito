from __future__ import annotations

import argparse
from dataclasses import dataclass
from random import Random

from sumito_env.core import WINNING_SCORE, Player, apply_move, create_initial_position

from .policies import Policy, greedy_policy, random_policy


@dataclass(frozen=True)
class TournamentResult:
    black_wins: int
    white_wins: int
    draws: int

    @property
    def games(self) -> int:
        return self.black_wins + self.white_wins + self.draws


def play_game(black: Policy, white: Policy, seed: int, max_plies: int = 300) -> Player | None:
    position = create_initial_position()
    random = Random(seed)
    policies = {"black": black, "white": white}
    while position.ply < max_plies:
        active = position.current_player
        move = policies[active](position, random)
        apply_move(position, move)
        if position.scores[active] >= WINNING_SCORE:
            return active
    return None


def evaluate(black: Policy, white: Policy, games: int = 20, seed: int = 1, max_plies: int = 300) -> TournamentResult:
    wins = {"black": 0, "white": 0}
    draws = 0
    for index in range(games):
        winner = play_game(black, white, seed + index, max_plies)
        if winner is None:
            draws += 1
        else:
            wins[winner] += 1
    return TournamentResult(wins["black"], wins["white"], draws)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a reproducible Sumito baseline tournament")
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--max-plies", type=int, default=300)
    args = parser.parse_args()
    result = evaluate(greedy_policy, random_policy, args.games, args.seed, args.max_plies)
    print(f"games={result.games} black_greedy_wins={result.black_wins} white_random_wins={result.white_wins} draws={result.draws}")


if __name__ == "__main__":
    main()

