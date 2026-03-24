---
name: gemini-plan
description: |
  Generate implementation plans via Gemini CLI. Saves Claude tokens for actual coding.
  Triggers on: "plan implementation", "create plan", "design feature", "plan this",
  "architecture plan", "implementation strategy"
user-invocable: true
---

# Gemini Plan — Implementation planning via Gemini CLI

## Instructions

Use Gemini to create detailed implementation plans, saving Claude tokens for coding.

### How to execute

1. Read current project context (package.json, key configs, file structure)
2. Build planning prompt:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   Create a detailed implementation plan for: [TASK]

   Current project context:
   [PROJECT INFO - tech stack, structure, key files]

   Provide:
   1. Architecture decisions and trade-offs
   2. Files to create/modify (with full paths)
   3. Step-by-step implementation order
   4. Key interfaces and types to define
   5. Edge cases and error handling strategy
   6. Testing approach
   7. Estimated complexity per step (LOW/MEDIUM/HIGH)

   Be specific and actionable. Use bullet points.
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```

3. Return structured plan
4. Use timeout 600000ms

### Workflow
After Gemini creates the plan:
1. Claude reviews and adjusts the plan if needed
2. Claude implements following the plan (saving tokens by having clear direction)
3. Optionally run /gemini-bridge:gemini-review on the result
