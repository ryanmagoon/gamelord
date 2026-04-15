# agent-react-devtools — React Component Inspection

The app imports `agent-react-devtools/connect` at the top of the renderer entry point (`src/renderer/main.tsx`), before any React import. When the daemon is running, this gives CLI access to the full React component tree, props, state, hooks, and performance profiling.

## When to Use

- **Debugging state issues**: inspect a component's hooks and props directly instead of adding `console.log`.
- **Performance profiling**: profile renders to find slow or over-rendering components (complements the frame-rate-is-sacred policy).
- **After refactors**: verify component tree structure hasn't changed unexpectedly.
- **Error tracking**: check `errors` to find components with React errors without scanning console logs.

## Workflow

```bash
# 1. Start the daemon (do this before starting the app)
npx agent-react-devtools start

# 2. Start the app (daemon auto-connects)
pnpm --filter @gamelord/desktop dev

# 3. Verify connection
npx agent-react-devtools status    # should show "1 connected, N components"

# 4. Inspect
npx agent-react-devtools get tree --depth 3        # component hierarchy
npx agent-react-devtools find GameLibrary           # find by name
npx agent-react-devtools get component @c34         # inspect props/state/hooks
npx agent-react-devtools errors                     # components with errors
npx agent-react-devtools count                      # component breakdown

# 5. Profile
npx agent-react-devtools profile start
# ... interact with the app ...
npx agent-react-devtools profile stop
npx agent-react-devtools profile slow               # slowest components
npx agent-react-devtools profile rerenders           # most re-rendered
```

## Important

- **Start the daemon before the app.** The connect script attempts a WebSocket connection on module load. If the daemon isn't running, it silently gives up after 2 seconds.
- **Element refs (`@cN`) change after re-renders.** Always re-run `find` or `get tree` to get fresh refs before `get component`.
- **No production overhead.** The connect module checks `import.meta.env.PROD` and no-ops in production builds.
- **No frame pacing impact.** The DevTools hook is passive — it observes the fiber tree without interfering with rendering. Only active when the daemon is connected.
