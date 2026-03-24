#!/bin/bash
# =============================================================================
# GEMINI BRIDGE v2 - Bulletproof wrapper for Gemini CLI calls from Claude Code
# =============================================================================
# Tries persistent session first (fast), falls back to direct call (reliable).
#
# Usage: bash ~/.claude/gemini-bridge.sh "your prompt here"
# Usage: bash ~/.claude/gemini-bridge.sh --file /path/to/prompt.txt
# Usage: bash ~/.claude/gemini-bridge.sh --yolo "prompt here"
#
# Config: ~/.claude/gemini-bridge.conf (optional)
#   GEMINI_YOLO=true|false   — run gemini with --yolo (auto-approve all actions)
#   GEMINI_MODEL=model-name  — override gemini model
# =============================================================================

set -uo pipefail

# --- Config ---
GEMINI_CMD="gemini"
MAX_RETRIES=2
RETRY_DELAY=3
LOG_DIR="$HOME/.claude/gemini-logs"
SESSION_SCRIPT="$HOME/.claude/gemini-session.sh"
CONFIG_FILE="$HOME/.claude/gemini-bridge.conf"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

# Defaults
GEMINI_YOLO="${GEMINI_YOLO:-false}"
GEMINI_MODEL="${GEMINI_MODEL:-}"

# Load config file if exists
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# --- Setup ---
mkdir -p "$LOG_DIR"

# --- Functions ---
log() {
    echo "[$(date +%H:%M:%S)] $1" >> "$LOG_FILE"
}

cleanup_old_logs() {
    local count
    count=$(ls -1 "$LOG_DIR"/*.log 2>/dev/null | wc -l || echo 0)
    if [ "$count" -gt 50 ]; then
        ls -1t "$LOG_DIR"/*.log | tail -n +51 | xargs rm -f 2>/dev/null || true
    fi
}

check_gemini() {
    if ! command -v "$GEMINI_CMD" &>/dev/null; then
        echo "ERROR: Gemini CLI not found in PATH. Install with: npm install -g @google/gemini-cli"
        log "FATAL: gemini not found"
        return 1
    fi
    log "OK: gemini found at $(which $GEMINI_CMD)"
    return 0
}

# Build gemini command args based on config
build_gemini_args() {
    local prompt="$1"
    local args=()

    args+=("-p" "$prompt")

    if [ "$GEMINI_YOLO" = "true" ]; then
        args+=("--yolo")
        log "YOLO mode enabled"
    fi

    if [ -n "$GEMINI_MODEL" ]; then
        args+=("-m" "$GEMINI_MODEL")
        log "Using model: $GEMINI_MODEL"
    fi

    echo "${args[@]}"
}

# Try sending via persistent session (fast path)
try_session() {
    local prompt="$1"

    if [ ! -f "$SESSION_SCRIPT" ]; then
        log "Session script not found, skipping session mode"
        return 1
    fi

    local status
    status=$(bash "$SESSION_SCRIPT" status 2>/dev/null) || return 1

    if echo "$status" | grep -q "Running"; then
        log "Persistent session available, using fast path"
        local result
        result=$(bash "$SESSION_SCRIPT" send "$prompt" 2>>"$LOG_FILE") || return 1

        if [ -n "$result" ] && ! echo "$result" | grep -q "^ERROR:"; then
            log "SESSION SUCCESS: Got response (${#result} chars)"
            echo "$result"
            return 0
        fi
        log "Session returned error or empty, falling back to direct call"
    else
        log "No persistent session running, using direct call"
    fi

    return 1
}

# Direct call to gemini (reliable fallback)
call_gemini_direct() {
    local prompt="$1"
    local attempt=1
    local output=""
    local exit_code=0

    # Build args array
    local -a cmd_args=("-p" "$prompt")
    [ "$GEMINI_YOLO" = "true" ] && cmd_args+=("--yolo")
    [ -n "$GEMINI_MODEL" ] && cmd_args+=("-m" "$GEMINI_MODEL")

    while [ $attempt -le $MAX_RETRIES ]; do
        log "Direct call attempt $attempt/$MAX_RETRIES (yolo=$GEMINI_YOLO, model=${GEMINI_MODEL:-default})"

        local output_file
        output_file=$(mktemp)

        exit_code=0
        $GEMINI_CMD "${cmd_args[@]}" 2>>"$LOG_FILE" > "$output_file" || exit_code=$?

        output=$(cat "$output_file")
        rm -f "$output_file"

        # Success
        if [ $exit_code -eq 0 ] && [ -n "$output" ]; then
            log "DIRECT SUCCESS: Got response (${#output} chars)"
            echo "$output"
            return 0
        fi

        # Check error types
        if echo "$output" | grep -qi "rate.limit\|quota\|429"; then
            log "WARN: Rate limited, waiting ${RETRY_DELAY}s"
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
        elif echo "$output" | grep -qi "auth\|credential\|401\|403"; then
            log "FATAL: Authentication error"
            echo "ERROR: Gemini auth failed. Run 'gemini' interactively to re-authenticate."
            return 1
        elif [ $exit_code -ne 0 ]; then
            log "WARN: Exit code $exit_code on attempt $attempt"
        elif [ -z "$output" ]; then
            log "WARN: Empty response on attempt $attempt"
        fi

        attempt=$((attempt + 1))
        [ $attempt -le $MAX_RETRIES ] && sleep $RETRY_DELAY
    done

    # Return whatever we have
    if [ -n "$output" ]; then
        log "PARTIAL: Returning last output despite errors"
        echo "$output"
        return 0
    else
        log "FATAL: All $MAX_RETRIES attempts failed"
        echo "ERROR: Gemini failed after $MAX_RETRIES attempts. Logs: $LOG_FILE"
        return 1
    fi
}

# --- Main ---
log "=== GEMINI BRIDGE v2 START ==="
cleanup_old_logs

# Parse arguments
PROMPT=""
YOLO_FLAG=false

while [ $# -gt 0 ]; do
    case "$1" in
        --yolo)
            GEMINI_YOLO="true"
            shift
            ;;
        --no-yolo)
            GEMINI_YOLO="false"
            shift
            ;;
        --model)
            GEMINI_MODEL="$2"
            shift 2
            ;;
        --file)
            if [ -n "${2:-}" ] && [ -f "$2" ]; then
                PROMPT=$(cat "$2")
                log "Loaded prompt from file: $2 (${#PROMPT} chars)"
            else
                echo "ERROR: Prompt file not found: ${2:-}"
                exit 1
            fi
            shift 2
            ;;
        *)
            PROMPT="$1"
            log "Received inline prompt (${#PROMPT} chars)"
            shift
            ;;
    esac
done

# Read from stdin if no prompt yet
if [ -z "$PROMPT" ] && [ ! -t 0 ]; then
    PROMPT=$(cat)
    log "Received prompt from stdin (${#PROMPT} chars)"
fi

# Validate
if [ -z "$PROMPT" ]; then
    echo "ERROR: No prompt provided"
    echo "Usage: gemini-bridge.sh [--yolo] [--no-yolo] [--model MODEL] [--file PATH] \"prompt\""
    exit 1
fi

# Check gemini exists
check_gemini || exit 1

# Remove control chars (keep newlines)
PROMPT=$(echo "$PROMPT" | tr -d '\000-\010\013\014\016-\037')

log "Config: yolo=$GEMINI_YOLO model=${GEMINI_MODEL:-default}"

# Strategy: try persistent session first (fast), then direct call (reliable)
log "Attempting persistent session..."
if try_session "$PROMPT"; then
    log "=== BRIDGE END (via session) ==="
    exit 0
fi

log "Falling back to direct call..."
call_gemini_direct "$PROMPT"
EXIT=$?

log "=== BRIDGE END (direct, exit=$EXIT) ==="
exit $EXIT
