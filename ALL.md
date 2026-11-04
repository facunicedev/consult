# /consult all - every stage in order, then a final agreement

Run it with ONE SUBAGENT in the background (Agent tool, `general-purpose`, `run_in_background: true`). It returns only: the path of the literal transcript + a short summary + the final proposal and who accepted it. The main Claude session reads that summary, verifies, and gives ITS OWN final recommendation. The subagent plays the "Claude voice" (independent: it knows only the context page, so that page must carry the user's literal quotes).

## Stage order (each = 3 blind rounds, as in SKILL.md, via `consult round`)
1. **ideas** (open up) -> 2. **deep** (go deeper into what survives) -> 3. **attack** (break it) -> 4. **plan** (order the steps) -> 5. **check** (review the plan against the user's literal quotes) -> 6. **agree**.
Stages 1-5 use the mode prompts. One work folder per stage: `W/1_ideas`, `W/2_deep`, ... (`consult new` creates them).

## How a stage hands over to the next
After the 3 rounds of a stage: `consult acta W/<stage> <mode>` creates `acta_<mode>.txt` (literal, anonymous final positions of the 3 voices, drawn order, max 2,500 characters each). The next stage's `ctx.txt` = base context + "RESULT OF THE PREVIOUS STAGES" with the actas appended. Nobody summarises or edits actas. If the context exceeds ~9,000 characters, keep only the latest acta in full and, for earlier ones, only the "final position" line.

## Stage agree (many rounds, until convergence or max 5)
Round 1: each voice writes a joint PROPOSAL (one concrete decision/plan) with all the actas as context (`p1.txt`). Rounds 2..N (max 5): `consult round N <dir> --prompt merge` : each voice reads the other two proposals (anonymous, labelled "Proposal A/B") and writes a better merged version, saying what changed. Stop when the three proposals are nearly equal or two consecutive rounds do not change in substance. Last round: `consult round N <dir> --prompt vote`: each voice answers ACCEPT / ACCEPT WITH CHANGES / REJECT + a one-line reason, about the proposal it finds best. Result: final text + votes; without unanimity, the objector's reservations.

## Limits and pacing (Groq free tier)
Observed on a real account in November 2026 for `openai/gpt-oss-120b`: 30 requests/min, 1,000/day, 8,000 tokens/min, 200,000 tokens/day (per organization; input + output; whichever is reached first). The program waits on its own to respect the per-minute limit (output cap 2,500 tokens, from the config) and refuses to start a call that would exceed its running daily estimate. A full pass is ~20 Groq calls: 20 minutes or more. Do not launch two passes at once. If a 429 persists, wait and rerun; never fall back to a single AI in silence.

## Daily budget
A full `all` pass is ~20 Groq calls of ~3,000-5,000 tokens: ~60,000-100,000 tokens. Rules to stay under: Groq output <= 2,500 tokens; actas <= 2,500 characters each; a stage `ctx` <= 9,000 characters; no more than one full pass per day while the daily limit is 200,000; if a 429 persists after waiting, stop and tell the user (do not loop). The `x-ratelimit-remaining-tokens` header only covers the current minute; the daily figure is estimated by summing.

## Delivery
One text file with every stage and round literal, the letter maps at the foot and the votes (`consult transcript` per stage, concatenated). Summary in the SKILL.md style (starts with "What this is about", translated to plain language). Claude closes with its reasoned recommendation, marked as its own.
