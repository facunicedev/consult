---
name: consult
description: Ask OTHER AIs (Codex CLI and the Groq API) to help Claude and the user think better, in one specific mode - attack, check, plan, deep or ideas (or "all" for a full pipeline). Usage "/consult <mode> [topic]". Also use it when the user says "challenge this", "second opinion", "what could go wrong", "give me ideas", "think deeper", or before closing an important decision.
---

# /consult <mode>

Claude is the moderator AND a third voice that argues for real. **The whole debate always runs in ONE background subagent** (Agent tool, `general-purpose`, `run_in_background: true`) in EVERY mode, not only `all`, so the rounds never fill the user's main chat: the main session only prepares the context page (steps 1-3), launches the subagent with the work folder and these instructions, and later receives only its final summary. The subagent does steps 4-9 (including writing Claude's own rounds, blind) and returns ONLY the summary of step 9; the main session then gives its own recommendation. The other AIs (always two: Codex and Groq) bring another view; the THREE voices debate in 3 anonymous, blind rounds and Claude closes with a recommendation that weighs the whole process. The user only receives the final summary and copies nothing. If the mode is not given, show a selector with the AskUserQuestion tool (it allows at most 4 options per question, so use two steps). Step 1 (header "Mode", single choice): attack - break the idea or plan; check - verify something that already exists; plan - order the steps; More... - other modes. Only if the user picks "More...", step 2 (header "Mode", single choice): deep - go deeper into what exists; ideas - new, unfiltered ideas; all - the full pipeline (ideas, deep, attack, plan, check, agree). Never ask the mode as plain text.

All mechanics (draw of labels, prompts, calls, pacing, minutes) are done by one program: `node "<this skill's folder>/consult.mjs" <command>`. Below, `consult` means that command. Run `consult --help` for the list.

## Setup check
If anything fails or it is the first use: `consult doctor` (add `--online` to also test the Groq key; spends no tokens). It prints OK / MISSING with the exact command to fix each item (Node >= 18, Codex CLI and login, `GROQ_API_KEY`, output folder, skill installed). Never ask the user to paste a key into the chat: they store it themselves in an environment variable.

## Modes
| Mode | When | What the other AIs are asked |
|---|---|---|
| **attack** | There is an idea/plan/decision and I want someone to break it | Attack, do not validate |
| **check** | Something ALREADY exists (code, page, doc) | Check it against what was asked |
| **plan** | Steps must be ordered | Steps, dependencies, risks, order |
| **deep** | I do NOT want new ideas: I want to go deeper into what exists | Go deeper into the same options: assumptions, consequences, what has not been thought about THIS. Only what was proposed; another route is noted in one separate line, undeveloped |
| **ideas** | I want new ideas, creativity | Many different, odd, out-of-the-box ideas, unfiltered |

## Steps (always, in this order)
1. **Read everything literally**: the conversation, the relevant files and the user's exact words (quotes, not summaries).
2. **Create the work folder**: `consult new <mode> "<topic>"` (inside `outputDir` from `consult.config.json`). Write the **context page** to `ctx.txt` (same text for all AIs). Order: data first (general goal, literal user quotes, what was already discarded and why, constraints, the material: diff, text, decision) and LAST the **CONCRETE TASK of this consultation** block (one sentence, with the purpose; otherwise the AI gets lost in the general goal). If the context is very long, repeat the task in one line near the end. **No recommendation or opinion of mine in this file** (so the AIs are not biased; my stance enters as my round 1, written before reading theirs). No secrets, keys or personal data; if in doubt, ask before sending.
3. **Notice before sending**: tell the user in 3-5 lines what is going out (topic, which AIs, which material, that there are 3 rounds, that it goes to OpenAI and Groq). The exact text need not be approved, but if anything is personal or doubtful, ask. Optionally run the round with `--dry-run` first: it builds every file and prints the estimated Groq tokens without calling anyone.
4. **Round 1**: `consult round 1 <dir> --mode <mode>` (builds `p1.txt` = context + mode prompt + closing, then calls Codex and Groq in parallel). **Always two different AIs: Codex and Groq**; if one fails, tell the user, do not continue with one in silence. The AIs see only what is in the files and have no memory between calls (every round is self-contained). Everything goes through files, so you never read the other voices' text in the chat until the end.
5. **My round 1**: write `claude_r1.txt` YOURSELF (same context, same mode prompt) BEFORE reading the AIs' answers. Do not stop between rounds and show nothing intermediate to the user.
6. **Rounds 2 and 3** (see below): `consult round 2 <dir>`, write `claude_r2.txt` from `claude_in_r2.txt`; `consult round 3 <dir>`, write `claude_r3.txt` from `claude_in_r3.txt`.
7. **Save everything literal**: `consult transcript <dir> <file>.txt` joins the 3 rounds of the 3 voices (uncut) plus the letter maps at the foot. Open it for the user.
8. **Verify**: AIs invent (and I can be wrong too): check every claim against the code or real facts. Mark: ✔ verified, ✘ false, ? not verified.
9. **Present to the user ONLY the final summary** in plain language (the literal text is in the file). It **ALWAYS starts with "What this is about"**: 3-5 lines in everyday words: what was being decided, why it matters and what each option means in daily terms (a concrete example if it helps). No ids or acronyms without a one-sentence explanation. Then, **what each voice (Codex, Groq and me) said, translated to plain language** ("in plain words: ..."). Then: which channels answered/failed, where they ended up agreeing, where they still disagree (who yielded and who did not), verified ✔/✘/?, options with advantage and drawback, and **my final recommendation, marked as mine and reasoned with the WHOLE process: what verified weighs most, who yielded and why, what disagreements remain and why I side with one option over another, what data is missing to be surer and what would change my recommendation**. Do NOT decide or apply anything: the user decides.

## The 3 rounds: blind peer review among equals (same procedure in ALL modes; only the mode goal changes)
There are THREE voices: Codex, Groq and Claude. Each criticises the OTHER TWO and never its own; answers are anonymous.
- **Round 1 (independent)**: each voice gets context + mode prompt without seeing the others.
- **Round 2 (critique)**: each voice gets the round-1 answers of the other two as "Response A" and "Response B" (order drawn at random, no names), plus "YOUR PREVIOUS ANSWER" (to remember what it said; it is not criticised). Taking a position is the point, not agreeing.
- **Round 3 (final position)**: each voice gets the two critiques the others wrote in round 2, as "Critique A" and "Critique B" (drawn, no names), plus its own round-2 text. It answers each critique and closes with AGREEMENTS, remaining DISAGREEMENTS and its final position in one sentence.
- **Anonymity**: no AI names appear inside the texts. The program draws the order and saves the letter-to-voice map in `map_rN.txt`; **I do not open that map until the final summary**. Only the anonymous files (`claude_in_rN.txt`) are for me. At the end the map goes to the foot of the transcript and is revealed in the summary.
- My voice follows the same mode rules as the AIs (in `deep`, no new alternatives; in `ideas`, 10 ideas, etc.), also yields or holds, and I do not act as referee until the final summary: I weigh each answer by what it says, not by who wrote it.
- If an AI fails mid-rounds, stop and tell the user; fix the cause and rerun the same round command (the letters are redrawn on a rerun).

## Channel
- **Codex CLI**: run by the program as `codex exec --skip-git-repo-check --sandbox read-only --ephemeral -o <out> -` with the prompt on stdin. If it says the session expired: ask the user to run `codex login` (interactive; in Claude Code `! codex login`).
- **Groq API**: called by the program with `fetch`. Model, output cap and limits come from `consult.config.json`. The key comes ONLY from the `GROQ_API_KEY` environment variable and is never written to files or logs. If missing, the program prints how to create and store it; I never write it nor does the user paste it in chat.
- Pacing is automatic (see README, "Usage limits"). On a persistent 429: stop, wait, rerun; never switch to a single AI in silence.
- Every send goes to a service the user has an account with: say what is sent (notice before sending).

## Prompts per mode
Each prompt has **role + reader + purpose** (one sentence), the task stated positively with the reason for each limit, and the common closing. They live in `src/prompts.mjs` and are assembled by the program; do not retype them. No emphatic capitals (ALWAYS/NEVER) in what is sent to the AIs.

## Lessons (from real use)
- **Gemini web/API and browser automation were dropped**: the web chat replaced long answers with a generic refusal, the free API often gave 503/429, and browser automation spent a lot of context.
- **Each AI has its own stance, and that is the point**: let them be autonomous and disagree. Do not push them to yield or to agree; present each stance as is. What we do watch: staying within the mode scope (e.g. new ideas in `deep`) - flag it when presenting.
- **Inventing**: reduce it by giving the right context and a defined scope (CONCRETE TASK block, what was discarded, and "if data is missing, say so"). Invented content that adds nothing: mark ✘. If it adds something (a useful idea that is the AI's own), fine: say it is the AI's idea, not a fact.
- If both channels disagree on the verdict, say so as is; do not average.

## Mode `all` (all stages + `agree`)
`/consult all [topic]`: runs ideas, deep, attack, plan, check, agree in the background with a subagent, and ends with a proposal the three voices accept or reject (many rounds, max 5). Details, Groq limits and delivery in `ALL.md` (same folder).
