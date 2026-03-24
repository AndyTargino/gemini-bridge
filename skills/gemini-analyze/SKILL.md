---
name: gemini-analyze
description: |
  Deep code analysis and architecture review via Gemini CLI. Token-efficient
  alternative to Claude analyzing large codebases. Triggers on: "analyze code",
  "review architecture", "deep analysis", "analyze this file", "codebase analysis"
user-invocable: true
---

# Gemini Analyze — Deep code/architecture analysis

## Instructions

Perform deep analysis using Gemini CLI to save Claude tokens.

### How to execute

1. Identify the target:
   - If it's a file path → read the file content
   - If it's a directory → list and read key files
   - If it's a description → use directly

2. Build analysis prompt and write to file:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   Perform a detailed analysis. Provide structured output with:
   - Summary (2-3 sentences)
   - Key Findings (bullet points)
   - Recommendations (prioritized)
   - Action Items (specific next steps)

   Be concise. Use bullet points. Be specific with file/line references.

   Code/Context to analyze:
   [INSERT CODE HERE]
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```

3. Return results structured as: Summary → Findings → Recommendations → Actions
4. Use timeout 600000ms — be patient, never kill mid-execution

### Rules
- ALWAYS read files first before sending to Gemini
- ALWAYS use --file mode (analysis prompts are always large)
- NEVER pipe output through filters
- If Gemini fails, report error honestly — never fabricate analysis
