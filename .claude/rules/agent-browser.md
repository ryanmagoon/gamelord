# agent-browser — Visual Verification

The dev server exposes Chrome DevTools Protocol on port 9222 by default (configurable via `CDP_PORT` env var). Use `agent-browser` to inspect and interact with the running Electron app.

## When to Use

- **After UI changes**: connect, snapshot, and screenshot to verify the change renders correctly before committing.
- **For PR screenshots**: capture component states directly rather than asking the user for media.
- **When debugging visual issues**: snapshot the accessibility tree, inspect element styles, check console/errors.
- **For video demos**: use `agent-browser record start/stop` to capture interaction sequences.

## Workflow

```bash
agent-browser connect 9222          # connect to running app
agent-browser tab list              # find the right window
agent-browser snapshot -i           # get element refs
agent-browser screenshot /tmp/x.png # capture state
```

Always re-snapshot after interactions — element refs change when the DOM updates.

## Port Conflict

If port 9222 is in use (e.g. another app instance or Chrome debugging), set `CDP_PORT` to use a different port:

```bash
CDP_PORT=9223 pnpm dev
agent-browser connect 9223
```

Each worktree can use its own port to avoid collisions.
