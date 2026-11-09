import json
import unittest
from pathlib import Path

from sumito_env.core import (
    CELLS,
    DIRECTIONS,
    Move,
    Position,
    apply_move,
    create_initial_position,
    legal_moves_for_group,
)


FIXTURES = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "conformance.json").read_text()
)


def coord(value: str) -> tuple[int, int]:
    q, r = value.split(",")
    return int(q), int(r)


class CoreConformanceTest(unittest.TestCase):
    def test_board_and_setups_match_production(self):
        self.assertEqual(len(CELLS), 61)
        for setup, expected in FIXTURES["setups"].items():
            position = create_initial_position(setup)
            self.assertEqual(sum(piece == "black" for piece in position.board.values()), expected["black"])
            self.assertEqual(sum(piece == "white" for piece in position.board.values()), expected["white"])

    def test_shared_rule_positions(self):
        for fixture in FIXTURES["positions"]:
            board = {coord(key): player for key, player in fixture["board"].items()}
            selected = tuple(coord(value) for value in fixture["selected"])
            moves = legal_moves_for_group(board, selected, fixture["player"])
            directions = {move.direction for move in moves}
            for direction in fixture.get("legalDirections", []):
                self.assertIn(direction, directions, fixture["id"])
            for direction in fixture.get("illegalDirections", []):
                self.assertNotIn(direction, directions, fixture["id"])
            if "applyDirection" in fixture:
                position = Position(board, {"black": 0, "white": 0}, fixture["player"])
                move = next(move for move in moves if move.direction == fixture["applyDirection"])
                self.assertEqual(apply_move(position, move), fixture["captured"])

    def test_directions_are_stable(self):
        self.assertEqual(DIRECTIONS[0], (1, 0))


if __name__ == "__main__":
    unittest.main()

