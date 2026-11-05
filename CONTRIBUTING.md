# Contributing

Thanks for helping. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Bug reports, clearer docs and tests on macOS/Linux are especially welcome (see "What was tested" in the README).

## Setup

Node.js >= 18. There are no dependencies to install.

```bash
git clone https://github.com/facunicedev/consult
cd consult
npm test        # node --test; everything is mocked, no network, no keys needed
```

## Ground rules

- No runtime dependencies; the program must run with just Node.
- Tests must never call the real Groq API or Codex CLI. Use the injectable `fetchFn`, `codex`, `groq`, `rng` and `run` parameters.
- Never print or store `GROQ_API_KEY`.
- Errors must say the exact command that fixes them.
- Changing a prompt (`src/prompts.mjs`) changes behaviour: explain why in the PR and, if you can, say which mode you ran.

## Pull requests

Small and focused, with a test when logic changes, and an entry under "Unreleased" in CHANGELOG.md. CI runs `npm test` on Node 18, 20 and 22 on Linux, macOS and Windows.
