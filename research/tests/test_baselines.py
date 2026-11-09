import unittest
from random import Random

from baselines.policies import greedy_policy, random_policy
from baselines.tournament import evaluate
from sumito_env.core import create_initial_position, legal_moves


class BaselineTest(unittest.TestCase):
    def test_policies_return_legal_actions(self):
        position = create_initial_position()
        legal = legal_moves(position)
        self.assertIn(random_policy(position, Random(4)), legal)
        self.assertIn(greedy_policy(position, Random(4)), legal)

    def test_tournament_is_bounded_and_reproducible(self):
        first = evaluate(greedy_policy, random_policy, games=2, seed=11, max_plies=20)
        second = evaluate(greedy_policy, random_policy, games=2, seed=11, max_plies=20)
        self.assertEqual(first, second)
        self.assertEqual(first.games, 2)


if __name__ == "__main__":
    unittest.main()

