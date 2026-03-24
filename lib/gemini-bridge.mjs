/**
 * GEMINI BRIDGE — Core library for calling Gemini CLI from Claude Code
 * Cross-platform (Windows + Linux + macOS), bulletproof error handling.
 */

import { execFile, spawn } from 'node:child_process';
import { writeFile, readFile, unlink, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir, platform } from 'node:os';
import { join } from 'node:path';

const LOG_DIR = join(homedir(), '.claude', 'gemini-logs');
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

// --- Logging ---
async function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }
}

async function log(file, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}\n`;
  try {
    const { appendFile: af } = await import('node:fs/promises');
    await af(file, line);
  } catch { /* ignore logging errors */ }
}

async function cleanupOldLogs() {
  try {
    const files = await readdir(LOG_DIR);
    const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
    for (const f of logFiles.slice(50)) {
      await unlink(join(LOG_DIR, f)).catch(() => {});
    }
  } catch { /* ignore */ }
}

// --- Gemini Detection ---
function getGeminiCommand() {
  // Try common locations
  const candidates = ['gemini'];

  if (platform() === 'win32') {
    candidates.push(
      join(process.env.APPDATA || '', 'npm', 'gemini.cmd'),
      join(process.env.NVM_HOME || '', 'nodejs', 'gemini.cmd'),
    );
  } else {
    candidates.push(
      '/usr/local/bin/gemini',
      join(homedir(), '.nvm/versions/node', 'current', 'bin', 'gemini'),
      join(homedir(), '.local/bin/gemini'),
    );
  }

  return candidates[0]; // Default to PATH lookup
}

// --- Core Call ---

/**
 * Call Gemini CLI with a prompt. Returns the response text.
 * Retries on transient failures, reports auth errors clearly.
 *
 * @param {string} prompt - The prompt to send to Gemini
 * @param {object} options - Options
 * @param {string} options.logFile - Path to log file
 * @param {number} options.timeoutMs - Timeout in ms (default: no limit)
 * @param {boolean} options.yolo - Run in yolo mode (auto-approve all actions)
 * @param {string} options.model - Override Gemini model
 * @returns {Promise<{ok: boolean, response: string, error?: string}>}
 */
export async function callGemini(prompt, options = {}) {
  await ensureLogDir();

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = options.logFile || join(LOG_DIR, `${ts}.log`);

  await log(logFile, `=== GEMINI BRIDGE START ===`);
  await log(logFile, `Prompt: ${prompt.length} chars`);
  await cleanupOldLogs();

  const geminiCmd = getGeminiCommand();
  let lastOutput = '';
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await log(logFile, `Attempt ${attempt}/${MAX_RETRIES}`);

    try {
      const result = await new Promise((resolve, reject) => {
        const args = ['-p', prompt];
        if (options.yolo) args.push('--yolo');
        if (options.model) args.push('-m', options.model);

        const proc = spawn(geminiCmd, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: platform() === 'win32',
          timeout: options.timeoutMs || 0,
          env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
        });

        proc.on('error', (err) => {
          reject(err);
        });
      });

      lastOutput = result.stdout;
      lastError = result.stderr;

      // Log stderr (Gemini loading messages go here)
      if (result.stderr) {
        await log(logFile, `stderr: ${result.stderr.slice(0, 500)}`);
      }

      // Success
      if (result.code === 0 && result.stdout) {
        await log(logFile, `SUCCESS: ${result.stdout.length} chars`);
        return { ok: true, response: result.stdout };
      }

      // Auth error — don't retry
      if (result.stderr.match(/auth|credential|401|403/i) ||
          result.stdout.match(/auth|credential|401|403/i)) {
        await log(logFile, `FATAL: Auth error`);
        return {
          ok: false,
          response: '',
          error: 'Gemini authentication failed. Run "gemini" interactively to re-authenticate.',
        };
      }

      // Rate limit — retry with backoff
      if (result.stderr.match(/rate.limit|quota|429/i) ||
          result.stdout.match(/rate.limit|quota|429/i)) {
        await log(logFile, `WARN: Rate limited`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
      }

      // Other error — retry
      await log(logFile, `WARN: exit code ${result.code}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }

    } catch (err) {
      await log(logFile, `ERROR: ${err.message}`);

      if (err.message.includes('ENOENT')) {
        return {
          ok: false,
          response: '',
          error: 'Gemini CLI not found. Install with: npm install -g @anthropic-ai/gemini-cli',
        };
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  // Exhausted retries
  if (lastOutput) {
    await log(logFile, `PARTIAL: Returning last output`);
    return { ok: true, response: lastOutput };
  }

  await log(logFile, `FATAL: All attempts failed`);
  return {
    ok: false,
    response: '',
    error: `Gemini failed after ${MAX_RETRIES} attempts. ${lastError || 'No output received.'}`,
  };
}

/**
 * Call Gemini with a prompt from a file (for large prompts).
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<{ok: boolean, response: string, error?: string}>}
 */
export async function callGeminiFromFile(filePath, options = {}) {
  const prompt = await readFile(filePath, 'utf-8');
  return callGemini(prompt, options);
}

/**
 * Quick check if Gemini CLI is available.
 * @returns {Promise<{available: boolean, version?: string, error?: string}>}
 */
export async function checkGemini() {
  try {
    const result = await new Promise((resolve, reject) => {
      execFile(getGeminiCommand(), ['--version'], {
        shell: platform() === 'win32',
        timeout: 10000,
      }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    return { available: true, version: result };
  } catch (err) {
    return { available: false, error: err.message };
  }
}
