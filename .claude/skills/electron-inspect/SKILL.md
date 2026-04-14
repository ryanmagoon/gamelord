---
name: electron-inspect
description: Inspect and interact with the running GameLord Electron app using agent-browser
---

# Electron App Inspection with agent-browser

GameLord's dev server exposes Chrome DevTools Protocol on port 9222 (`--remote-debugging-port=9222` in the dev script). Use `agent-browser` to connect, take screenshots, inspect the DOM, interact with UI elements, and record videos — all without leaving the terminal.

## Prerequisites

- `agent-browser` installed (`brew install agent-browser && agent-browser install`)
- GameLord dev server running (`pnpm dev` from repo root)

## Quick Start

```bash
# 1. Connect to the running Electron app
agent-browser connect 9222

# 2. List available tabs/windows (library window, game window, etc.)
agent-browser tab list

# 3. Switch to a specific tab by index
agent-browser tab 2

# 4. Take a snapshot (accessibility tree with element refs)
agent-browser snapshot -i

# 5. Take a screenshot
agent-browser screenshot /tmp/gamelord-screenshot.png
```

## Core Workflow

### Inspect UI State

```bash
# Accessibility tree — compact, shows element refs like @e1, @e2
agent-browser snapshot -i

# Get text content of a specific element
agent-browser get text "@e5"

# Check computed styles
agent-browser get styles "@e5"

# Get element bounding box (position + dimensions)
agent-browser get box "@e5"
```

### Interact with the App

```bash
# Click an element by ref
agent-browser click "@e5"

# Type into an input
agent-browser fill "@e3" "Super Mario Bros"

# Press keyboard keys
agent-browser press "Enter"

# Scroll
agent-browser scroll down 500

# Hover (useful for testing hover states)
agent-browser hover "@e5"
```

### Screenshots

```bash
# Full page screenshot
agent-browser screenshot /tmp/gamelord.png

# After a change, compare against previous
agent-browser screenshot /tmp/gamelord-after.png
agent-browser diff screenshot --baseline /tmp/gamelord.png
```

### Video Recording

```bash
# Start recording a workflow
agent-browser record start /tmp/gamelord-demo.webm

# ... perform interactions ...

# Stop and save
agent-browser record stop
```

### Window Management

GameLord has multiple Electron windows (library, game). Each appears as a separate tab target:

```bash
# List all targets
agent-browser tab list

# Switch between them
agent-browser tab 1   # library window
agent-browser tab 2   # game window (when open)
```

### Evaluate JavaScript in the Renderer

```bash
# Run JS in the current window's renderer context
agent-browser eval "document.title"
agent-browser eval "window.gamelord"  # check preload API
```

### Network and Console

```bash
# View console logs (useful for debugging IPC)
agent-browser console

# View page errors
agent-browser errors

# Monitor network requests
agent-browser network requests
```

## Tips

- **Always `snapshot -i` first** to get element refs before clicking/typing.
- **Re-snapshot after interactions** — refs change when the DOM updates.
- **Use `agent-browser tab list`** when the app has multiple windows open — the game window is a separate target.
- **Screenshots go to `/tmp/`** to keep the repo clean. Use descriptive filenames.
- **The port 9222 is always available** in dev mode — no special flags needed.
- **For PR screenshots**, capture specific component states and include them in the PR body.
