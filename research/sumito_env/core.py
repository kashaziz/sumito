"""Dependency-free rules kept in conformance with ``lib/game/engine.ts``."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal

Player = Literal["black", "white"]
Coord = tuple[int, int]
Direction = tuple[int, int]
Board = dict[Coord, Player]

RADIUS = 4
WINNING_SCORE = 6
DIRECTIONS: tuple[Direction, ...] = (
    (1, 0),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (0, -1),
    (1, -1),
)

CELLS: tuple[Coord, ...] = tuple(
    (q, r)
    for r in range(-RADIUS, RADIUS + 1)
    for q in range(max(-RADIUS, -r - RADIUS), min(RADIUS, -r + RADIUS) + 1)
)

SETUPS: dict[str, dict[Player, tuple[int, ...]]] = {
    "standard": {
        "black": (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15),
        "white": (45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60),
    },
    "belgian-daisy": {
        "black": (0, 1, 5, 6, 7, 12, 13, 47, 48, 53, 54, 55, 59, 60),
        "white": (3, 4, 8, 9, 10, 15, 16, 44, 45, 50, 51, 52, 56, 57),
    },
    "german-daisy": {
        "black": (5, 6, 11, 12, 13, 19, 20, 40, 41, 47, 48, 49, 54, 55),
        "white": (9, 10, 15, 16, 17, 23, 24, 36, 37, 43, 44, 45, 50, 51),
    },
}


@dataclass(frozen=True)
class Move:
    selected: tuple[Coord, ...]
    direction: int
    opponents: tuple[Coord, ...] = ()


@dataclass
class Position:
    board: Board
    scores: dict[Player, int]
    current_player: Player = "black"
    ply: int = 0


def add(first: Coord, second: Direction) -> Coord:
    return first[0] + second[0], first[1] + second[1]


def negate(direction: Direction) -> Direction:
    return -direction[0], -direction[1]


def is_inside(coord: Coord) -> bool:
    q, r = coord
    return max(abs(q), abs(r), abs(-q - r)) <= RADIUS


def other_player(player: Player) -> Player:
    return "white" if player == "black" else "black"


def create_initial_position(setup: str = "standard") -> Position:
    if setup not in SETUPS:
        raise ValueError(f"Unknown setup: {setup}")
    definition = SETUPS[setup]
    board: Board = {}
    for player in ("black", "white"):
        for index in definition[player]:
            board[CELLS[index]] = player
    return Position(board=board, scores={"black": 0, "white": 0})


def line_direction(group: tuple[Coord, ...]) -> Direction | None:
    if len(group) < 2:
        return None
    first = group[0]
    for axis in DIRECTIONS[:3]:
        on_axis = all(
            (coord[0] - first[0] == 0 if axis[0] == 0 else
             coord[1] - first[1] == 0 if axis[1] == 0 else
             coord[0] - first[0] == -(coord[1] - first[1]))
            for coord in group
        )
        if not on_axis:
            continue
        if len(group) == 2 and group[1] in (add(first, step) for step in DIRECTIONS):
            return axis
        if len(group) == 3:
            keys = set(group)
            if any(add(middle, axis) in keys and add(middle, negate(axis)) in keys for middle in group):
                return axis
    return None


def legal_moves_for_group(board: Board, selected: Iterable[Coord], player: Player) -> list[Move]:
    group = tuple(selected)
    if not group or len(group) > 3 or any(board.get(coord) != player for coord in group):
        return []
    axis = line_direction(group)
    if len(group) > 1 and axis is None:
        return []
    selected_set = set(group)
    moves: list[Move] = []

    for direction_index, direction in enumerate(DIRECTIONS):
        inline = len(group) == 1 or direction in (axis, negate(axis))
        if not inline:
            destinations = tuple(add(coord, direction) for coord in group)
            if all(is_inside(coord) and coord not in board for coord in destinations):
                moves.append(Move(group, direction_index))
            continue

        front = next((coord for coord in group if add(coord, direction) not in selected_set), None)
        if front is None:
            continue
        destination = add(front, direction)
        if not is_inside(destination):
            continue
        occupant = board.get(destination)
        if occupant is None:
            moves.append(Move(group, direction_index))
            continue
        if occupant == player:
            continue

        opponents: list[Coord] = []
        cursor = destination
        while is_inside(cursor) and cursor in board and board[cursor] != player:
            opponents.append(cursor)
            cursor = add(cursor, direction)
        if len(opponents) >= len(group) or (is_inside(cursor) and cursor in board):
            continue
        moves.append(Move(group, direction_index, tuple(opponents)))
    return moves


def player_groups(board: Board, player: Player) -> list[tuple[Coord, ...]]:
    pieces = [coord for coord in CELLS if board.get(coord) == player]
    groups: list[tuple[Coord, ...]] = [(coord,) for coord in pieces]
    for start in pieces:
        for axis in DIRECTIONS[:3]:
            second = add(start, axis)
            if board.get(second) != player:
                continue
            groups.append((start, second))
            third = add(second, axis)
            if board.get(third) == player:
                groups.append((start, second, third))
    return groups


def legal_moves(position: Position, player: Player | None = None) -> list[Move]:
    active = player or position.current_player
    return [
        move
        for group in player_groups(position.board, active)
        for move in legal_moves_for_group(position.board, group, active)
    ]


def apply_move(position: Position, move: Move) -> int:
    player = position.current_player
    matching = next(
        (
            candidate
            for candidate in legal_moves_for_group(position.board, move.selected, player)
            if candidate.direction == move.direction
        ),
        None,
    )
    if matching is None:
        raise ValueError("Cannot apply an illegal move")

    direction = DIRECTIONS[matching.direction]
    board = dict(position.board)
    for coord in matching.selected:
        board.pop(coord, None)
    for coord in matching.opponents:
        board.pop(coord, None)
    for coord in matching.selected:
        board[add(coord, direction)] = player

    captured = 0
    for coord in reversed(matching.opponents):
        destination = add(coord, direction)
        if is_inside(destination):
            board[destination] = other_player(player)
        else:
            captured += 1

    position.board = board
    position.scores[player] += captured
    position.current_player = other_player(player)
    position.ply += 1
    return captured


def _geometry_groups() -> tuple[tuple[Coord, ...], ...]:
    board = {coord: "black" for coord in CELLS}
    return tuple(player_groups(board, "black"))


ACTION_CATALOG: tuple[tuple[tuple[Coord, ...], int], ...] = tuple(
    (group, direction)
    for group in _geometry_groups()
    for direction in range(len(DIRECTIONS))
)


def action_key(selected: Iterable[Coord], direction: int) -> tuple[tuple[Coord, ...], int]:
    return tuple(sorted(selected)), direction


ACTION_INDEX = {
    action_key(group, direction): index
    for index, (group, direction) in enumerate(ACTION_CATALOG)
}

