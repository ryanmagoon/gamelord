# agent-browser — Visual Verification

The dev server exposes Chrome DevTools Protocol on port 9222. Use `agent-browser` to inspect and interact with the running Electron app.

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

If port 9222 is in use (e.g. Chrome debugging), the app will fail to bind. Kill the conflicting process or change the port in `apps/desktop/package.json`.
