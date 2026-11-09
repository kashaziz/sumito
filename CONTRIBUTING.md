# Contributing to Sumito

Thank you for helping. Sumito is a small project, so clear, focused changes are the easiest to review.

## Ways to help

- **Report a bug**: open an issue with the steps, your device and browser, and a screenshot if you can.
- **Suggest an idea**: open an issue first, so we can agree on the approach before you write code.
- **Fix something**: issues labelled `good first issue` are a good start.
- **Improve the AI or research tools**: see [docs/ai-opponent.md](docs/ai-opponent.md) and [research/README.md](research/README.md).

## Set up

```bash
git clone https://github.com/kashaziz/sumito.git
cd sumito
npm install
npm run dev
```

You need Node.js 22.13 or newer. Python 3.11+ runs the research tests (`npm run test:research`).

## Make a change

1. Create a branch from `main`, for example `fix/landscape-sheet`.
2. Keep each pull request to one change. Split unrelated work.
3. Follow [STYLE.md](STYLE.md): mobile first, board first, design tokens only, and animate `transform` and `opacity` only.
4. Keep the rules engine (`lib/game/engine.ts`) pure: no React, no DOM, no network.
5. If you fix a rules bug, add the position to `research/fixtures/conformance.json`, so the TypeScript and Python rules stay in step.
6. Add or update tests for the behaviour you change.

## Checks before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
```

For UI changes, also run the browser QA (`npm run qa:mobile`, setup in the README) and add a screenshot to the pull request. CI runs all of these on every pull request.

## Commit messages

Use the present tense and explain why, for example: `Keep the score marker still while the phone rotates`.

## Code of Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing, you agree that your contribution is released under the [MIT licence](LICENSE).
