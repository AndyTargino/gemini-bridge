# Gemini Bridge

**Claude Code plugin that integrates Google Gemini CLI for multi-model collaboration and token optimization.**

Delegate heavy tasks (analysis, planning, code review, test generation) to Gemini CLI while Claude Code focuses on orchestration and applying changes. Save Claude tokens by letting Gemini handle the bulk of the work.

---

## Why?

Claude Code tokens are expensive. Gemini CLI is free (with Google account) and has a massive 1M-2M token context window. This plugin lets you use the best of both:

| Claude Code | Gemini CLI |
|-------------|-----------|
| Orchestration & decisions | Heavy analysis & research |
| Applying code changes | Code generation drafts |
| User interaction | Architecture reviews |
| Quality control | Test generation |
| Final validation | Refactoring suggestions |

**Result:** Same quality, fraction of the Claude token cost.

---

## Installation

### Prerequisites

1. **Claude Code CLI** installed and authenticated
2. **Gemini CLI** installed and authenticated:
   ```bash
   npm install -g @google/gemini-cli
   gemini  # Run once to authenticate
   ```

### Install the plugin

```bash
claude plugin add AndyTargino/gemini-bridge
```

That's it. The plugin registers 6 skills, 3 agents, and lifecycle hooks automatically.

### Copy bridge scripts to global config (one-time setup)

After installing the plugin, copy the bridge scripts so they're available globally:

```bash
cp ~/.claude/plugins/cache/gemini-bridge/gemini-bridge/1.0.0/lib/gemini-bridge.sh ~/.claude/gemini-bridge.sh
cp ~/.claude/plugins/cache/gemini-bridge/gemini-bridge/1.0.0/lib/gemini-session.sh ~/.claude/gemini-session.sh
chmod +x ~/.claude/gemini-bridge.sh ~/.claude/gemini-session.sh
```

---

## Usage

### Slash Commands (Skills)

Use these directly in Claude Code:

| Command | What it does |
|---------|-------------|
| `/gemini-bridge:gemini-ask` | Send any question/task to Gemini |
| `/gemini-bridge:gemini-analyze` | Deep code & architecture analysis |
| `/gemini-bridge:gemini-review` | Code review (bugs, security, performance) |
| `/gemini-bridge:gemini-plan` | Implementation planning |
| `/gemini-bridge:gemini-test` | Generate tests from source code |
| `/gemini-bridge:gemini-refactor` | Refactoring suggestions with risk assessment |

### Examples

```
# Ask Gemini anything
/gemini-bridge:gemini-ask explain the observer pattern in TypeScript

# Analyze a file
/gemini-bridge:gemini-analyze src/services/auth.ts

# Review your changes before committing
/gemini-bridge:gemini-review diff

# Plan a feature (Gemini plans, Claude implements)
/gemini-bridge:gemini-plan add push notification system

# Generate tests
/gemini-bridge:gemini-test src/utils/validators.ts

# Get refactoring ideas
/gemini-bridge:gemini-refactor src/controllers/userController.ts
```

### Agents (Background Delegation)

Claude can spawn these agents to run Gemini tasks in background while continuing other work:

| Agent | Purpose |
|-------|---------|
| `gemini-analyst` | Research, analysis, strategy |
| `gemini-coder` | Code generation + validation + apply |
| `gemini-reviewer` | Thorough code review |

### Recommended Workflow

```
1. /gemini-bridge:gemini-plan [feature]   → Gemini creates the plan
2. Claude implements following the plan    → Claude applies code
3. /gemini-bridge:gemini-review diff       → Gemini reviews the result
4. /gemini-bridge:gemini-test [file]       → Gemini generates tests
```

---

## Configuration

### YOLO Mode

By default, Gemini runs in standard mode and asks for confirmation before executing actions (reading files, running commands, etc.). Enable **YOLO mode** to let Gemini auto-approve everything:

#### Option 1: Config file (persistent)

Create `~/.claude/gemini-bridge.conf`:

```bash
# Let Gemini run freely without confirmation prompts
GEMINI_YOLO=true

# Optionally override the model
GEMINI_MODEL=gemini-2.5-pro
```

A template is included at `lib/gemini-bridge.conf.example`.

#### Option 2: Per-call flag

```bash
# Enable YOLO for one call
bash ~/.claude/gemini-bridge.sh --yolo "analyze this code for bugs"

# Disable YOLO even if config says true
bash ~/.claude/gemini-bridge.sh --no-yolo "review this carefully"
```

#### Option 3: Environment variable

```bash
export GEMINI_YOLO=true
```

### Model Override

Override the default Gemini model:

```bash
# Via config file
GEMINI_MODEL=gemini-2.5-pro

# Via flag
bash ~/.claude/gemini-bridge.sh --model gemini-2.5-flash "quick question"

# Via environment
export GEMINI_MODEL=gemini-2.5-pro
```

### All Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `GEMINI_YOLO` | `false` | Auto-approve all Gemini actions |
| `GEMINI_MODEL` | *(CLI default)* | Override Gemini model |
| `MAX_RETRIES` | `2` | Retry count on transient failures |
| `RETRY_DELAY` | `3` | Seconds between retries |

---

## Architecture

```
gemini-bridge/
├── .claude-plugin/          # Plugin manifest & hooks config
│   ├── plugin.json          # Name, version, skills, MCP servers
│   ├── marketplace.json     # GitHub marketplace registry
│   └── hooks/hooks.json     # Lifecycle hook definitions
├── skills/                  # 6 slash command skills
│   ├── gemini-ask/          # /gemini-bridge:gemini-ask
│   ├── gemini-analyze/      # /gemini-bridge:gemini-analyze
│   ├── gemini-review/       # /gemini-bridge:gemini-review
│   ├── gemini-plan/         # /gemini-bridge:gemini-plan
│   ├── gemini-test/         # /gemini-bridge:gemini-test
│   └── gemini-refactor/     # /gemini-bridge:gemini-refactor
├── agents/                  # 3 delegatable agents
│   ├── gemini-analyst.md    # Analysis & research
│   ├── gemini-coder.md      # Code generation
│   └── gemini-reviewer.md   # Code review
├── hooks/                   # Lifecycle scripts
│   ├── sessionstart.mjs     # Checks Gemini availability on start
│   └── stop.mjs             # Cleanup on session end
├── lib/                     # Core libraries
│   ├── gemini-bridge.sh     # Bash wrapper (bulletproof, cross-platform)
│   ├── gemini-bridge.mjs    # Node.js bridge library
│   ├── gemini-session.sh    # Persistent session manager
│   ├── gemini-session.mjs   # Node.js session library
│   └── gemini-bridge.conf.example  # Configuration template
├── CLAUDE.md                # Instructions for Claude
└── package.json
```

### How it works

1. **SessionStart hook** checks if Gemini CLI is installed and reports status
2. **Skills** provide slash commands that format prompts and call the bridge
3. **Bridge script** (`gemini-bridge.sh`) handles:
   - Retry logic with exponential backoff on rate limits
   - Auth error detection with clear messages
   - Config loading (yolo, model, retries)
   - Logging to `~/.claude/gemini-logs/`
4. **Session manager** provides persistent Gemini instance (optional, faster)
5. **Stop hook** cleans up any running sessions

### Error Handling

| Error | Bridge Response |
|-------|----------------|
| Gemini not installed | Clear install instructions |
| Auth expired | "Run gemini interactively to re-authenticate" |
| Rate limited | Auto-retry with exponential backoff |
| Empty response | Retry, then report failure |
| Timeout | Never kills — waits up to 10 minutes |

---

## Bridge Script (Direct Usage)

You can use the bridge script directly without the plugin skills:

```bash
# Simple prompt
bash ~/.claude/gemini-bridge.sh "explain async/await in JavaScript"

# Large prompt from file
bash ~/.claude/gemini-bridge.sh --file /tmp/my-prompt.txt

# With YOLO mode
bash ~/.claude/gemini-bridge.sh --yolo "refactor this entire module"

# With specific model
bash ~/.claude/gemini-bridge.sh --model gemini-2.5-pro "complex analysis task"

# Combine flags
bash ~/.claude/gemini-bridge.sh --yolo --model gemini-2.5-pro --file /tmp/prompt.txt
```

---

## Persistent Sessions

For faster response times, start a persistent Gemini session:

```bash
# Start background listener
bash ~/.claude/gemini-session.sh start

# Send prompts (no cold-start delay)
bash ~/.claude/gemini-session.sh send "your prompt here"
bash ~/.claude/gemini-session.sh send --file /tmp/prompt.txt

# Check status
bash ~/.claude/gemini-session.sh status

# Stop when done
bash ~/.claude/gemini-session.sh stop
```

The bridge script automatically tries the persistent session first, then falls back to a direct call.

---

## Compatibility

| Platform | Status |
|----------|--------|
| Windows 10/11 | Tested |
| Linux (Ubuntu/Debian) | Supported |
| macOS | Supported |
| WSL/WSL2 | Supported |

**Requirements:**
- Node.js >= 18
- Gemini CLI (npm install -g @google/gemini-cli)
- Claude Code CLI

---

## License

MIT

---

## Credits

Built by [@AndyTargino](https://github.com/AndyTargino) with Claude Code (Opus 4.6).

Inspired by the growing multi-model AI collaboration ecosystem.
