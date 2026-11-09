# Sumito research environment

This package mirrors the production TypeScript rules in a small Python core and
provides an optional PettingZoo turn-based adapter with Gymnasium spaces. It is
for experiments and conformance testing; it is not loaded by the web game.

## Quick check

The core tests use only Python's standard library:

```bash
PYTHONPATH=research python3 -m unittest discover -s research/tests
```

To use the multi-agent environment, create a virtual environment and install
the research package:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e "research[dev]"
```

```python
from sumito_env.environment import SumitoEnv

env = SumitoEnv(setup="standard", max_plies=300)
env.reset(seed=7)
observation = env.observe(env.agent_selection)
legal_actions = observation["action_mask"].nonzero()[0]
env.step(int(legal_actions[0]))
```

Observations are player-relative vectors over the same 61-cell ordering as the
web engine: `1` is the observing player's marble, `-1` is the opponent, and `0`
is empty. Rewards are terminal-only by default. Experimental shaping belongs in
training wrappers so the canonical game remains stable.

`fixtures/conformance.json` is read by both TypeScript and Python tests. Add a
position there whenever a production rule bug is fixed.

## Reproducible baseline

The research package includes random and capture/center-greedy policies. They
are deliberately small: their purpose is to detect environment regressions and
provide the first benchmark a learned policy must beat.

```bash
PYTHONPATH=research python3 -m baselines.tournament --games 20 --seed 7
```

The runner reports wins and bounded-episode draws. A trained policy should be
evaluated from both colors across fixed seeds before it is considered for web
delivery.
