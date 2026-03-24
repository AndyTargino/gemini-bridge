---
name: gemini-review
description: |
  Code review via Gemini CLI — finds bugs, security issues, performance problems.
  Triggers on: "review code", "code review", "find bugs", "check for issues",
  "review this PR", "review diff", "security review"
user-invocable: true
---

# Gemini Review — Code review via Gemini CLI

## Instructions

Perform thorough code review using Gemini CLI.

### How to execute

1. Gather code to review:
   - Target is "diff" or "changes" → run `git diff` and capture
   - Target is a file → read the file
   - Target is a directory → read key files

2. Build review prompt:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   Perform a thorough code review. Check for:
   1. Bugs and logic errors
   2. Security vulnerabilities (XSS, injection, auth issues)
   3. Performance problems (N+1 queries, memory leaks, unnecessary re-renders)
   4. Code smells and maintainability issues
   5. Missing error handling
   6. Type safety issues

   Rate each finding as: CRITICAL / WARNING / SUGGESTION
   Group by severity. Be specific with file:line references.

   Code to review:
   [INSERT CODE HERE]
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```

3. Structure response as:
   ### CRITICAL (must fix)
   ### WARNING (should fix)
   ### SUGGESTION (nice to have)
   ### Summary

4. Use timeout 600000ms — be patient

### Rules
- ALWAYS use --file mode
- NEVER pipe output through filters
- If Gemini misses obvious issues you spotted, add them yourself
- NEVER fabricate findings
