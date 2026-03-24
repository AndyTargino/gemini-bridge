#!/bin/bash
# =============================================================================
# GEMINI SESSION MANAGER v2 - File-based IPC (Windows compatible)
# =============================================================================
# Uses temp files instead of named pipes for cross-platform compatibility.
#
# Commands:
#   gemini-session.sh start       - Start persistent Gemini background listener
#   gemini-session.sh send "msg"  - Send prompt and wait for response
#   gemini-session.sh send --file path - Send prompt from file
#   gemini-session.sh status      - Check if running
#   gemini-session.sh stop        - Stop the instance
# =============================================================================

set -uo pipefail

# --- Config ---
SESSION_DIR="$HOME/.claude/gemini-sessions"
LOG_DIR="$HOME/.claude/gemini-logs"
SESSION_ID="${CLAUDE_SESSION_ID:-default}"

REQUEST_FILE="$SESSION_DIR/$SESSION_ID.request"
RESPONSE_FILE="$SESSION_DIR/$SESSION_ID.response"
PID_FILE="$SESSION_DIR/$SESSION_ID.pid"
LOG_FILE="$LOG_DIR/session_$SESSION_ID.log"
LOCK_FILE="$SESSION_DIR/$SESSION_ID.lock"

mkdir -p "$SESSION_DIR" "$LOG_DIR"

log() { echo "[$(date +%H:%M:%S)] $1" >> "$LOG_FILE"; }

is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        # Stale
        rm -f "$PID_FILE" "$LOCK_FILE" "$REQUEST_FILE" "$RESPONSE_FILE"
    fi
    return 1
}

do_start() {
    if is_running; then
        echo "GEMINI_SESSION: Already running (PID $(cat "$PID_FILE"))"
        return 0
    fi

    log "=== STARTING SESSION $SESSION_ID ==="
    rm -f "$REQUEST_FILE" "$RESPONSE_FILE" "$LOCK_FILE"

    # Background loop: poll for request files, process, write response
    (
        log "Background listener started (PID $$)"
        while true; do
            # Check if we should exit
            if [ -f "$SESSION_DIR/$SESSION_ID.stop" ]; then
                rm -f "$SESSION_DIR/$SESSION_ID.stop"
                log "Stop signal received"
                break
            fi

            # Check for new request
            if [ -f "$REQUEST_FILE" ] && [ ! -f "$LOCK_FILE" ]; then
                # Lock to prevent race conditions
                touch "$LOCK_FILE"

                local prompt
                prompt=$(cat "$REQUEST_FILE" 2>/dev/null)
                rm -f "$REQUEST_FILE"

                if [ -n "$prompt" ]; then
                    log "Processing request (${#prompt} chars)..."

                    local result=""
                    result=$(gemini -p "$prompt" 2>>"$LOG_FILE") || true

                    if [ -z "$result" ]; then
                        result="ERROR: Gemini returned empty response"
                        log "WARN: Empty response from Gemini"
                    else
                        log "SUCCESS: Response ready (${#result} chars)"
                    fi

                    # Write response
                    echo "$result" > "$RESPONSE_FILE"
                fi

                rm -f "$LOCK_FILE"
            fi

            # Poll interval - short enough to be responsive
            sleep 0.5
        done

        rm -f "$PID_FILE" "$LOCK_FILE" "$REQUEST_FILE" "$RESPONSE_FILE"
        log "=== SESSION ENDED ==="
    ) &

    echo "$!" > "$PID_FILE"
    log "Started with PID $!"
    echo "GEMINI_SESSION: Started (PID $!, Session $SESSION_ID)"
}

do_send() {
    # Auto-start if not running
    if ! is_running; then
        log "Auto-starting session..."
        do_start
        sleep 2  # Let it initialize
    fi

    local prompt=""
    if [ "${1:-}" = "--file" ] && [ -n "${2:-}" ]; then
        [ -f "$2" ] && prompt=$(cat "$2") || { echo "ERROR: File not found: $2"; return 1; }
    elif [ -n "${1:-}" ]; then
        prompt="$1"
    else
        echo "ERROR: No prompt"; return 1
    fi

    [ -z "$prompt" ] && { echo "ERROR: Empty prompt"; return 1; }

    # Wait if another request is being processed
    local wait_count=0
    while [ -f "$LOCK_FILE" ] && [ $wait_count -lt 600 ]; do
        sleep 1
        wait_count=$((wait_count + 1))
    done

    if [ -f "$LOCK_FILE" ]; then
        log "WARN: Lock held too long, forcing"
        rm -f "$LOCK_FILE"
    fi

    # Clean old response
    rm -f "$RESPONSE_FILE"

    # Write request
    echo "$prompt" > "$REQUEST_FILE"
    log "Request submitted (${#prompt} chars), waiting for response..."

    # Wait for response (poll)
    local elapsed=0
    while [ ! -f "$RESPONSE_FILE" ] && [ $elapsed -lt 600 ]; do
        sleep 1
        elapsed=$((elapsed + 1))

        # Check if session died
        if ! is_running; then
            echo "ERROR: Gemini session died during processing"
            return 1
        fi
    done

    if [ -f "$RESPONSE_FILE" ]; then
        cat "$RESPONSE_FILE"
        rm -f "$RESPONSE_FILE"
        return 0
    else
        echo "ERROR: Gemini session timed out (${elapsed}s)"
        return 1
    fi
}

do_status() {
    if is_running; then
        echo "GEMINI_SESSION: Running (PID $(cat "$PID_FILE"), Session $SESSION_ID)"
    else
        echo "GEMINI_SESSION: Not running"
    fi
}

do_stop() {
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)

        # Signal graceful stop
        touch "$SESSION_DIR/$SESSION_ID.stop"
        sleep 2

        # Force if needed
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi

        rm -f "$PID_FILE" "$LOCK_FILE" "$REQUEST_FILE" "$RESPONSE_FILE" "$SESSION_DIR/$SESSION_ID.stop"
        log "Session stopped"
        echo "GEMINI_SESSION: Stopped"
    else
        echo "GEMINI_SESSION: Not running"
    fi
}

# --- Main ---
case "${1:-}" in
    start)  do_start ;;
    send)   shift; do_send "$@" ;;
    status) do_status ;;
    stop)   do_stop ;;
    *)
        echo "Usage: gemini-session.sh {start|send|status|stop}"
        exit 1
        ;;
esac
