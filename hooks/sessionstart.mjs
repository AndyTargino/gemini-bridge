#!/usr/bin/env node
/**
 * SessionStart hook — Checks Gemini CLI availability and reports status.
 * Runs when Claude Code session starts.
 */

import { checkGemini } from '../lib/gemini-bridge.mjs';

async function main() {
  // Read stdin (hook context)
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const check = await checkGemini();

  const status = check.available
    ? `Gemini CLI v${check.version} ready`
    : `Gemini CLI not found: ${check.error}`;

  // Return system-reminder to inject into context
  const result = {
    result: 'continue',
    additionalContext: `Gemini Bridge Plugin: ${status}. Use /gemini-bridge:* skills to delegate tasks to Gemini CLI.`,
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ result: 'continue' }));
});
