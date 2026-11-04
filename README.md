# consult

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill that gets a second and third opinion before you decide. Claude, Codex CLI and a Groq-hosted model debate your question in **three blind, anonymous rounds**, and Claude closes with a reasoned recommendation. You decide.

## What it is and why

One model reviewing its own idea tends to agree with itself. `consult` puts three voices in a room where nobody knows who wrote what:

```
 Round 1  independent        Codex      Groq      Claude   (each answers alone)
                                \         |         /
 Round 2  critique           each voice reads the OTHER TWO answers,
                             shown as "Response A" / "Response B"
                             (random order, no names) and takes a position
                                \         |         /
 Round 3  final position     each voice reads the two critiques of its
                             own round-2 text ("Critique A" / "B"),
                             answers them, lists AGREEMENTS / DISAGREEMENTS
                                \         |         /
 Summary                     Claude: plain-language summary of each voice,
                             what was verified, and ITS OWN recommendation
```

Claude writes its own round 1 *before* reading the others, and never opens the letter-to-voice map until the end. The goal is real disagreement, not consensus.

## Who this is for

People who pay **only for a Claude Code subscription** and want to add two more AIs without paying for anything else: Codex CLI on a free ChatGPT account, and Groq's free API tier. It is a budget-friendly setup, and the limits below are what you work within.

## Quick start

```bash
git clone https://github.com/facunicedev/consult ~/.claude/skills/consult
node ~/.claude/skills/consult/consult.mjs doctor --online
```

Then in Claude Code: `/consult attack "Should we migrate our API from REST to GraphQL?"`

## Install

Requires Node.js >= 18 (no npm install, no dependencies).

- **Clone** into the skills folder (above), or
- **Copy**: clone anywhere and run `node consult.mjs install`, which copies the skill to `~/.claude/skills/consult` (Windows: `%USERPROFILE%\.claude\skills\consult`) and never overwrites your `consult.config.json`.

Works on Windows, macOS and Linux (no PowerShell or bash needed).

### Troubleshooting: `doctor`

`node consult.mjs doctor` checks, and prints `OK` / `MISSING` / `WARN` with the exact fix for each:

1. Node version >= 18
2. Codex CLI installed (`codex --version`) and a login session (`codex login status`; if your Codex version lacks that command you get a warning to run `codex login`)
3. `GROQ_API_KEY` present and plausible (starts with `gsk_`). It prints at most "set, N characters", never the key
4. With `--online`: one `GET /openai/v1/models` call to Groq to confirm the key works (spends no tokens) and shows any `x-ratelimit-*` headers
5. The output folder is writable and the skill is installed

It exits with code 1 if anything is `MISSING`.

## Requirements and setup

### Codex CLI

```bash
npm install -g @openai/codex
codex login          # sign in with your ChatGPT account
```

It uses your ChatGPT account, so usage limits depend on your ChatGPT plan (free accounts have tight ones). `consult` runs it read-only and ephemeral: `codex exec --skip-git-repo-check --sandbox read-only --ephemeral -o <file> -`.

### Groq API

1. Create a free key at <https://console.groq.com/keys>.
2. Store it as an environment variable (never paste it into a chat, never put it in a file):
   - **Windows** (terminal): `setx GROQ_API_KEY "your-key"`, then open a new terminal
   - **macOS / Linux**: add `export GROQ_API_KEY="your-key"` to `~/.zshrc` or `~/.bashrc`, then `source` it
3. Check: `node consult.mjs doctor --online`

## Usage limits (read this)

Measured on one real Groq free-tier account in **November 2026** for `openai/gpt-oss-120b`:

| Limit | Value |
|---|---|
| Requests per minute | 30 |
| Requests per day | 1,000 |
| Tokens per minute | 8,000 |
| Tokens per day | 200,000 (per organization, input + output) |

These are observed figures, not a promise; they can change, so check <https://console.groq.com/settings/limits>.

A single mode (3 rounds) makes 3 Groq calls. A full `all` pass makes ~20 Groq calls of ~3,000-5,000 tokens each, i.e. **60,000-100,000 tokens: do not run more than one full pass per day** on the free tier.

How the program stays inside the limits:

- **Pacing**: before each call it waits until the previous call's estimated tokens leave the per-minute window.
- **Output cap**: `groq.maxOutputTokens` (default 2,500).
- **Daily guard**: it keeps a running estimate (in your temp folder) and refuses a call that would pass `groq.tokensPerDay`.
- **429 / 503**: retries up to `groq.retries` times (honours `Retry-After`), then stops with a clear message. It never silently continues with one AI.

`--dry-run` builds all files and prompts of a round, calls nobody, and prints the estimated tokens.

## Modes and usage

| Mode | Use when | Example |
|---|---|---|
| `attack` | You have a plan and want it broken | `/consult attack "We will store sessions in JWTs"` |
| `check` | Something exists; verify it against what was asked | `/consult check "Does this migration meet the spec?"` |
| `plan` | Steps need ordering | `/consult plan "Roll out feature flags to 3 services"` |
| `deep` | No new ideas; go deeper into the options on the table | `/consult deep "Monolith vs. modular monolith"` |
| `ideas` | You want options nobody proposed | `/consult ideas "Reduce onboarding drop-off"` |
| `all` | The full pipeline: ideas, deep, attack, plan, check, agree (up to 5 agreement rounds + a vote), run by a background subagent | `/consult all "Name for the project"` |

You can also drive the program by hand:

```bash
node consult.mjs new attack "REST vs GraphQL"            # makes a work folder, prints its path
# write ctx.txt there (data first, a CONCRETE TASK block last)
node consult.mjs round 1 <dir> --mode attack --dry-run    # inspect, spend nothing
node consult.mjs round 1 <dir> --mode attack
node consult.mjs round 2 <dir>                            # needs claude_r1.txt
node consult.mjs round 3 <dir>                            # needs claude_r2.txt
node consult.mjs transcript <dir> out.txt
```

Settings live in `consult.config.json` (Groq model, output cap, TPM/TPD limits, output folder, which AIs). The Groq key is read only from `GROQ_API_KEY`.

## How it works inside

- **Anonymity**: texts contain no AI names. For every reader the program removes its own answer, shuffles the other two and labels them A/B (`src/labels.mjs`). The letter-to-voice map goes to `map_rN.txt`; Claude does not open it until the final summary.
- **Claude's voice**: written *before* Claude reads the other voices, in each round, from an anonymised copy (`claude_in_rN.txt`).
- **Actas between stages** (`all` mode): `acta` extracts each voice's final position (from "AGREEMENTS" on, max 2,500 chars), drawn in random order, and feeds it to the next stage unedited.
- **No memory between calls**: each round prompt is self-contained (context + the previous material).

## What was tested

Honest status of v0.1.0:

| What | Result |
|---|---|
| Each of the 5 modes, run once each on a real software-design decision | Worked (original shell/PowerShell version) |
| `all`, once end to end (6 stages, ~21 Groq calls, ~14 minutes) to choose a name | Worked, no 429 |
| Unit and end-to-end `--dry-run` tests of this Node rewrite (`npm test`, all mocked) | Pass |
| Windows 11 | Tested |
| macOS, Linux | **Not tested** |
| Groq models other than `openai/gpt-oss-120b` | **Not tested** |
| Paid Groq limits | **Not tested** |
| Long network failures mid-run | **Not tested** |
| The Node rewrite against the real Codex CLI and real Groq API | **Not yet run** (the live runs above used the earlier scripts, same prompts and procedure) |

What we learned:

- AIs invent concrete details (numbers, causes, examples). Verify before acting; that is why Claude's last step is checking claims.
- Anonymity by style is imperfect: a voice can sometimes guess who wrote what.
- Gemini (web and free API) was tried and dropped: the web chat swapped long answers for a generic refusal and the free API often answered 503/429, so it did not work reliably for this use. That is why `consult` uses Codex CLI + Groq.

## Limitations and privacy

- **What you write is sent to OpenAI (Codex) and Groq.** Do not include secrets, keys or personal data in the context page.
- Free tiers have tight limits and can change or disappear.
- The AIs only see the files you give them; the quality of the context page decides the quality of the debate.
- The result is advice. `consult` never applies changes.

## Inspiration & prior art

No code was copied from any project below.

**Inspired by**

- [karpathy/llm-council](https://github.com/karpathy/llm-council): a local web app where several LLMs answer independently, review each other's answers anonymised ("Response A/B") so none can play favourites, and a chairman model writes the final answer (one review round). `consult` takes the anonymous cross-critique from there and extends it: three rounds in which the voices debate each other, three voices (Codex, Groq and the host Claude) and no fixed chairman. The repository is published as-is and has no license file, which is another reason no code is reused.

**Looked at while designing** (the exact influence is not claimed beyond what is stated)

- [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0): OpenAI's plugin that runs Codex from Claude Code, including an adversarial review whose prompt says "Your job is to break confidence in the change, not to validate it" and "Default to skepticism", and ends in `needs-attention` or `approve`. The `attack` mode is written in that style and uses the same two verdicts.
- [trailofbits/skills, plugin second-opinion](https://github.com/trailofbits/skills/tree/main/plugins/second-opinion): gets an independent review from other AI CLIs; its Codex path runs `codex exec` in a read-only sandbox. `consult` also runs Codex non-interactively and read-only.

**Official prompting guides** used to tune the prompts: [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) (explain the reason behind an instruction, put the query at the end of long inputs, say what to do rather than what not to do), [Google](https://aistudio.google.com/docs/prompting-strategies) (context first, the task last, consistent delimiters) and [OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) (explicit instructions and roles, structured prompts, higher-level goals for reasoning models).

**Related work** (similar goals; not a source of this project)

- [peteski22/star-chamber](https://github.com/peteski22/star-chamber): sends reviews and design questions to several LLM providers and groups findings by consensus; has a debate mode that feeds earlier-round feedback into the next round.
- [0xNyk/council-of-high-intelligence](https://github.com/0xNyk/council-of-high-intelligence): structured multi-persona deliberation with independent first positions and forced disagreement.
- [BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server): an MCP server that connects Claude Code and other CLIs to many models, with code-review, consensus and challenge style tools.
- [ssh-den/council-debates](https://github.com/ssh-den/council-debates): Python package for role-based LLM debates with optional ranking and a chairman answer.
- [hyperb1iss/hyperskills](https://github.com/hyperb1iss/hyperskills): a collection of agent skills that includes a cross-model review skill.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Released under the [MIT License](LICENSE).
