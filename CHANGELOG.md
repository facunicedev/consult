# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [0.1.0] - 2026-11-05

### Added
- Claude Code skill `consult` with five modes (attack, check, plan, deep, ideas) and an `all` pipeline (ideas, deep, attack, plan, check, agree).
- Blind, anonymous 3-round debate between Claude, Codex CLI and a Groq-hosted model, with a random A/B draw and a separate letter map.
- Single cross-platform Node program (ESM, no dependencies, Node >= 18): `new`, `round`, `acta`, `transcript`, `doctor`, `install`.
- `--dry-run`, Groq pacing and daily-budget guard, `consult.config.json`.
- Tests with the built-in Node runner (all mocked; no network).
- Demo GIF and MP4 in the README.
- CODE_OF_CONDUCT.md.
- In every mode the debate runs in one background subagent, and the mode selector uses two AskUserQuestion steps.
