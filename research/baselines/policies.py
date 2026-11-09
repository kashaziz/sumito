from __future__ import annotations

from random import Random
from typing import Callable

from sumito_env.core import Move, Position, apply_move, legal_moves

Policy = Callable[[Position, Random], Move]


def random_policy(position: Position, random: Random) -> Move:
    moves = legal_moves(position)
    if not moves:
        raise RuntimeError("The active player has no legal action")
    return random.choice(moves)


def greedy_policy(position: Position, random: Random) -> Move:
    """Prefer captures, then compact centerward movement, with seeded tie breaks."""
    moves = legal_moves(position)
    if not moves:
        raise RuntimeError("The active player has no legal action")

    scored: list[tuple[float, Move]] = []
    for move in moves:
        trial = Position(dict(position.board), dict(position.scores), position.current_player, position.ply)
        captured = apply_move(trial, move)
        player = position.current_player
        center_distance = sum(max(abs(q), abs(r), abs(-q - r)) for (q, r), piece in trial.board.items() if piece == player)
        scored.append((captured * 10_000 - center_distance, move))
    best = max(score for score, _ in scored)
    return random.choice([move for score, move in scored if score == best])

