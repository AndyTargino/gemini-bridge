# Gemini Bridge Plugin

This plugin integrates Google Gemini CLI with Claude Code for multi-model collaboration.

## Purpose
Delegate heavy/expensive tasks to Gemini CLI (free/cheap, 1M-2M token context) to save Claude tokens.
Claude orchestrates and applies code. Gemini does analysis, planning, reviews, and code generation.

## Available Skills (slash commands)
- `/gemini-bridge:gemini-ask` — Send any prompt to Gemini
- `/gemini-bridge:gemini-analyze` — Deep code/architecture analysis
- `/gemini-bridge:gemini-review` — Code review (bugs, security, performance)
- `/gemini-bridge:gemini-plan` — Implementation planning
- `/gemini-bridge:gemini-test` — Test generation
- `/gemini-bridge:gemini-refactor` — Refactoring suggestions

## Available Agents (for background delegation)
- `gemini-analyst` — Analysis, strategy, research
- `gemini-coder` — Code generation + apply
- `gemini-reviewer` — Code review

## How It Works
All calls go through `~/.claude/gemini-bridge.sh` which:
1. Validates Gemini CLI is available
2. Handles retries on transient failures
3. Reports auth/rate-limit errors clearly
4. Logs all calls to `~/.claude/gemini-logs/`

## Rules for Claude
- ALWAYS use the bridge script, never call `gemini` directly
- NEVER pipe Gemini output through grep/sed/awk
- Use timeout 600000ms — Gemini can take minutes
- NEVER kill Gemini unless stuck 5+ min with no progress
- For large prompts (>2000 chars), use `--file` mode
