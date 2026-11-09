# AI and reinforcement learning

## Recommended order

Build a conventional search opponent before reinforcement learning. The game is deterministic, fully observable, and has a moderate branching factor. Search gives us legal, reproducible play quickly and creates a benchmark that an RL agent must beat.

## AI v1

Status: implemented in `lib/game/ai.ts` and `app/ai.worker.ts`.

The first opponent should use iterative deepening with alpha-beta search or a carefully bounded Monte Carlo tree search. It runs in a Web Worker and receives a serialized position plus a thinking-time budget.

An initial evaluation function can combine:

- Captured-marble difference, weighted most strongly.
- Distance from the edge and danger of immediate ejection.
- Center control.
- Group cohesion and isolated-marble penalties.
- Number of legal moves.
- Immediate pushing threats and vulnerable lines.

Difficulty should change time/depth and introduce controlled variety, not make illegal moves:

- Easy: short search, broader move sampling, simple explanations.
- Medium: deeper tactical search with stable heuristics.
- Hard: longest mobile-safe budget, transposition table, and stronger move ordering.

## Explainability

The engine should return reason codes alongside evaluated moves, such as `captures`, `escapes_edge`, `improves_center`, `joins_group`, and `allows_counterpush`. The UI translates these into short player-facing explanations. Explanations must be derived from measurable features rather than generated claims.

## RL environment

[Gymnasium](https://github.com/Farama-Foundation/Gymnasium) supplies a modern single-agent environment API. Because Sumito is a turn-based competitive game, a [PettingZoo](https://pettingzoo.farama.org/) multi-agent interface or a self-play wrapper is the more natural primary representation.

The older [gym-abalone](https://github.com/towzeur/gym-abalone) project is useful prior art for board observations, action masking, setups, and rule cases. It should not be used as a production dependency without porting and verification: it targets the older Gym API and its large fixed action space and shaped rewards are design choices, not requirements.

Status: the project now includes a dependency-free Python rules core, fixed action catalog, player-relative observations, legal-action masks, bounded PettingZoo AEC environment, shared TypeScript/Python fixtures, and reproducible random-versus-greedy tournaments under `research/`.

## Proposed research package

```text
research/
  pyproject.toml
  sumito_env/
    environment.py
    encoding.py
    action_mask.py
  tests/
  baselines/
  fixtures/        shared positions and expected legal moves
```

The environment exposes deterministic seeding, legal-action masks, canonical player-relative observations, bounded episodes, and terminal-only rewards. Experimental reward shaping belongs in wrappers rather than the canonical environment.

## Model delivery

Training happens offline. A policy reaches the web product only when it:

1. Beats the hard search baseline over a reproducible match set.
2. Never produces an unmasked action.
3. Fits the download-size budget.
4. Responds within the mobile time budget.
5. Provides a safe fallback to search if loading or inference fails.
