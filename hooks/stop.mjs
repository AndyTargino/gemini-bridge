#!/usr/bin/env node
/**
 * Stop hook — Cleans up any running Gemini sessions when Claude stops.
 */

import { stopSession } from '../lib/gemini-session.mjs';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    await stopSession();
  } catch {}

  process.stdout.write(JSON.stringify({ result: 'continue' }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ result: 'continue' }));
});
