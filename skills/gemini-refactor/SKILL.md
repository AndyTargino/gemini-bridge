---
name: gemini-refactor
description: |
  Get refactoring suggestions from Gemini CLI before Claude implements.
  Triggers on: "refactor this", "suggest refactoring", "improve code quality",
  "clean up code", "code smells", "reduce complexity"
user-invocable: true
---

# Gemini Refactor — Refactoring analysis via Gemini CLI

## Instructions

Use Gemini to analyze code and suggest refactoring strategies.

### How to execute

1. Read the target code files
2. Build refactoring prompt:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   Analyze this code and suggest refactoring improvements.

   For each suggestion provide:
   1. What to change and why (specific pattern/smell identified)
   2. Before/after code example
   3. Risk level: LOW / MEDIUM / HIGH
   4. Priority: 1 (most important) to 5 (least)
   5. Estimated effort: TRIVIAL / SMALL / MEDIUM / LARGE

   Focus on:
   - DRY violations
   - Complex conditionals
   - Long methods/functions
   - Poor naming
   - Missing abstractions
   - Performance anti-patterns
   - Unnecessary coupling

   Be specific with line references.

   Code to analyze:
   [INSERT CODE HERE]
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```

3. Present suggestions organized by priority
4. Ask user which refactorings to apply
5. Claude implements the approved changes

### Workflow
Gemini suggests → User approves → Claude implements → Gemini reviews result
