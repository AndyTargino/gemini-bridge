---
name: gemini-test
description: |
  Generate tests via Gemini CLI based on existing code. Triggers on:
  "generate tests", "write tests", "create test file", "test this code",
  "add test coverage"
user-invocable: true
---

# Gemini Test — Test generation via Gemini CLI

## Instructions

Use Gemini to generate comprehensive tests.

### How to execute

1. Read the target source file
2. Read existing test files to understand patterns and testing framework
3. Build test generation prompt:
   ```bash
   cat > /tmp/gemini_prompt.txt << 'GEMINI_EOF'
   Generate comprehensive tests for this code.

   Testing framework: [jest/vitest/pytest/etc]
   Existing test patterns:
   [PASTE EXISTING TEST EXAMPLE]

   Source code to test:
   [PASTE SOURCE CODE]

   Include:
   - Unit tests for each function/method
   - Edge cases (null, undefined, empty, boundary values)
   - Error cases (invalid input, network failures)
   - Happy path tests
   - Integration tests if applicable

   Return ONLY the test code. No explanations. Match existing patterns exactly.
   GEMINI_EOF
   bash ~/.claude/gemini-bridge.sh --file /tmp/gemini_prompt.txt
   ```

4. Validate generated tests make sense
5. Write to appropriate test file location
6. Use timeout 600000ms

### Rules
- ALWAYS read existing tests first for pattern matching
- Validate output is actual test code before writing
- Fix obvious issues before writing the file
