---
name: gemini-ask
description: |
  Send any question or task to Gemini CLI. Saves Claude tokens by delegating
  work to Gemini. Triggers on: "ask gemini", "send to gemini", "delegate to gemini",
  "gemini help", "use gemini for"
user-invocable: true
---

# Gemini Ask — Send any prompt to Gemini CLI

## Instructions

You are delegating a task to Google Gemini CLI to save Claude tokens.

### How to execute

1. Take the user's prompt/question
2. Call Gemini via the bridge script:
   ```bash
   bash ~/.claude/gemini-bridge.sh "USER_PROMPT_HERE"
   ```
3. For large prompts (>2000 chars), use file mode:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   [PROMPT HERE]
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```
4. Return Gemini's response formatted clearly
5. Use timeout of 600000ms — Gemini can take minutes, be patient

### Rules
- NEVER pipe output through grep/sed/awk
- NEVER kill Gemini mid-execution unless stuck 5+ minutes with no progress
- If Gemini returns ERROR, report it — do NOT retry (bridge handles retries)
- If the response is very long, summarize key points
