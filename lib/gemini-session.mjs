/**
 * GEMINI SESSION MANAGER — Persistent Gemini instance per Claude session
 * Uses file-based IPC (Windows + Linux compatible, no named pipes).
 */

import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { callGemini } from './gemini-bridge.mjs';

const SESSION_DIR = join(homedir(), '.claude', 'gemini-sessions');
const LOG_DIR = join(homedir(), '.claude', 'gemini-logs');

async function ensureDirs() {
  await mkdir(SESSION_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
}

function sessionPaths(sessionId) {
  return {
    pid: join(SESSION_DIR, `${sessionId}.pid`),
    request: join(SESSION_DIR, `${sessionId}.request`),
    response: join(SESSION_DIR, `${sessionId}.response`),
    lock: join(SESSION_DIR, `${sessionId}.lock`),
    stop: join(SESSION_DIR, `${sessionId}.stop`),
    log: join(LOG_DIR, `session_${sessionId}.log`),
  };
}

/**
 * Check if a session is running.
 */
export async function isRunning(sessionId = 'default') {
  await ensureDirs();
  const paths = sessionPaths(sessionId);

  if (!existsSync(paths.pid)) return false;

  try {
    const pid = parseInt(await readFile(paths.pid, 'utf-8'), 10);
    process.kill(pid, 0); // Check if alive (signal 0)
    return true;
  } catch {
    // Stale PID file
    await cleanup(sessionId);
    return false;
  }
}

/**
 * Clean up session files.
 */
async function cleanup(sessionId) {
  const paths = sessionPaths(sessionId);
  for (const f of Object.values(paths)) {
    if (f.endsWith('.log')) continue;
    await unlink(f).catch(() => {});
  }
}

/**
 * Start a background session listener.
 * Returns immediately after spawning the background process.
 */
export async function startSession(sessionId = 'default') {
  await ensureDirs();

  if (await isRunning(sessionId)) {
    return { ok: true, message: `Already running`, sessionId };
  }

  await cleanup(sessionId);
  const paths = sessionPaths(sessionId);

  // Spawn a detached Node.js process that runs the listener loop
  const child = spawn(process.execPath, [
    '-e',
    getListenerCode(sessionId),
  ], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  child.unref();

  // Write PID file
  await writeFile(paths.pid, String(child.pid));

  return { ok: true, message: `Started (PID ${child.pid})`, sessionId, pid: child.pid };
}

/**
 * Send a prompt to the running session and wait for response.
 */
export async function sendToSession(prompt, sessionId = 'default', timeoutSec = 600) {
  await ensureDirs();

  // Auto-start if not running
  if (!(await isRunning(sessionId))) {
    await startSession(sessionId);
    await new Promise(r => setTimeout(r, 2000)); // Let it init
  }

  const paths = sessionPaths(sessionId);

  // Wait for lock to clear
  let waited = 0;
  while (existsSync(paths.lock) && waited < timeoutSec) {
    await new Promise(r => setTimeout(r, 1000));
    waited++;
  }

  // Clean old response
  await unlink(paths.response).catch(() => {});

  // Write request
  await writeFile(paths.request, prompt);

  // Wait for response
  let elapsed = 0;
  while (!existsSync(paths.response) && elapsed < timeoutSec) {
    await new Promise(r => setTimeout(r, 1000));
    elapsed++;

    // Check session is still alive
    if (!(await isRunning(sessionId))) {
      return { ok: false, error: 'Session died during processing' };
    }
  }

  if (existsSync(paths.response)) {
    const response = await readFile(paths.response, 'utf-8');
    await unlink(paths.response).catch(() => {});
    return { ok: true, response };
  }

  return { ok: false, error: `Timeout after ${elapsed}s` };
}

/**
 * Stop a running session.
 */
export async function stopSession(sessionId = 'default') {
  await ensureDirs();
  const paths = sessionPaths(sessionId);

  if (!(await isRunning(sessionId))) {
    return { ok: true, message: 'Not running' };
  }

  try {
    // Signal stop
    await writeFile(paths.stop, '1');
    await new Promise(r => setTimeout(r, 2000));

    // Force kill if still running
    if (existsSync(paths.pid)) {
      const pid = parseInt(await readFile(paths.pid, 'utf-8'), 10);
      try { process.kill(pid, 'SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 1000));
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  } catch {}

  await cleanup(sessionId);
  return { ok: true, message: 'Stopped' };
}

/**
 * Get session status.
 */
export async function getStatus(sessionId = 'default') {
  const running = await isRunning(sessionId);
  if (!running) return { running: false, sessionId };

  const paths = sessionPaths(sessionId);
  const pid = existsSync(paths.pid)
    ? parseInt(await readFile(paths.pid, 'utf-8'), 10)
    : null;

  return { running: true, sessionId, pid };
}

// --- Background Listener Code (runs as detached process) ---
function getListenerCode(sessionId) {
  return `
const { readFile, writeFile, unlink } = require('fs/promises');
const { existsSync } = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const { join } = require('path');
const { homedir, platform } = require('os');

const SESSION_DIR = join(homedir(), '.claude', 'gemini-sessions');
const LOG_DIR = join(homedir(), '.claude', 'gemini-logs');
const SID = '${sessionId}';

const paths = {
  request: join(SESSION_DIR, SID + '.request'),
  response: join(SESSION_DIR, SID + '.response'),
  lock: join(SESSION_DIR, SID + '.lock'),
  stop: join(SESSION_DIR, SID + '.stop'),
  log: join(LOG_DIR, 'session_' + SID + '.log'),
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  require('fs').appendFileSync(paths.log, '[' + ts + '] ' + msg + '\\n');
}

async function loop() {
  log('Listener started PID=' + process.pid);

  while (true) {
    // Check stop signal
    if (existsSync(paths.stop)) {
      await unlink(paths.stop).catch(() => {});
      log('Stop signal received');
      break;
    }

    // Check for request
    if (existsSync(paths.request) && !existsSync(paths.lock)) {
      try {
        await writeFile(paths.lock, '1');
        const prompt = await readFile(paths.request, 'utf-8');
        await unlink(paths.request).catch(() => {});

        if (prompt.trim()) {
          log('Processing request (' + prompt.length + ' chars)');

          let result = '';
          try {
            const geminiCmd = 'gemini';
            const child = require('child_process').spawnSync(
              geminiCmd,
              ['-p', prompt],
              {
                encoding: 'utf-8',
                timeout: 600000,
                shell: platform() === 'win32',
                env: process.env,
              }
            );
            result = (child.stdout || '').trim();
            if (child.stderr) log('stderr: ' + child.stderr.slice(0, 300));
            if (!result) result = 'ERROR: Gemini returned empty response';
            else log('SUCCESS: ' + result.length + ' chars');
          } catch (e) {
            result = 'ERROR: ' + e.message;
            log('ERROR: ' + e.message);
          }

          await writeFile(paths.response, result);
        }
      } catch (e) {
        log('ERROR in loop: ' + e.message);
      } finally {
        await unlink(paths.lock).catch(() => {});
      }
    }

    // Poll interval
    await new Promise(r => setTimeout(r, 500));
  }

  // Cleanup
  for (const f of [paths.lock, paths.request, paths.response]) {
    await unlink(f).catch(() => {});
  }
  log('Listener ended');
  process.exit(0);
}

loop().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
`;
}
