# GameLord

## Key Documentation

- `DEVELOPMENT_PLAN.md` — Architecture overview, completed work, TODO roadmap, and technical notes. Read this first when orienting on the project.

### Keeping the Development Plan Current

`DEVELOPMENT_PLAN.md` is the single source of truth for project state. It must stay accurate across sessions so any new chat can pick up where the last one left off.

- **Mark items done as you complete them.** When you finish a TODO item, immediately update it from `[ ]` to `[x]` with a brief description of what was done. Don't batch these — update the plan in the same commit as the implementation.
- **Add new items when they're discovered.** If work reveals a new task, bug, or follow-up, add it to the appropriate priority section in `DEVELOPMENT_PLAN.md`. This includes ideas discussed in conversation that we decide to pursue — if it's agreed upon, it goes in the plan.
- **Record new known issues.** If you encounter a bug, limitation, or quirk during development, add it to the "Known Issues" section at the bottom of the plan.
- **Reference GitHub issues.** When a GitHub issue is created for deferred work, include the issue URL next to the corresponding item in the plan (e.g., `— see #42`). When closing an issue via PR, update the plan item to `[x]` in the same change.

## Package Manager

This project uses **pnpm**. Always use `pnpm` for installing dependencies, running scripts, etc. — never `npm` or `yarn`.

## Git Conventions

- Use descriptive branch names: `<type>/<short-descriptive-name>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Examples: `feat/game-library-search`, `fix/storybook-tailwind`, `refactor/emulator-manager`

## Pull Requests

- **Reference the GitHub issue.** If a PR implements a feature or fixes a bug that has an existing GitHub issue, the PR description must include `Closes #<number>` (or `Fixes #<number>` for bugs). This auto-closes the issue on merge and makes the history traceable. If no issue exists and the work is non-trivial, create one first.

## Design Philosophy

- **Extremely polished UI.** Every interaction should feel intentional and delightful. Prioritize craft and attention to detail — this is a desktop app, not a throwaway prototype.
- **Microinteractions and animations.** Use tasteful transitions, hover effects, loading states, and motion to make the app feel alive. Think about easing curves, staggered animations, and subtle feedback on every click, toggle, and navigation.
- **Ideate novel flourishes.** When implementing a feature, proactively suggest creative UI touches — e.g. a CRT power-on animation when launching a game, particle effects on achievements, satisfying haptic-style feedback on button presses, ambient glow effects. Propose these ideas to the user before implementing.

## Storybook Coverage

All UI components with loading, error, or transitional states **must** have Storybook stories representing each state. This makes states easy to polish, iterate on, and visually verify without needing to reproduce them in the running app. Examples: artwork sync phases (hashing, querying, downloading, done, error, not-found), empty/loading library, form validation errors.

## Performance — Frame Rate is Sacred

Emulation frame pacing is a top-tier concern. Every code change — especially in the renderer, game window, and emulation loop — must be evaluated for its impact on consistent frame delivery. The app must look and feel smooth on 120Hz+ displays.

### Rules

- **No `backdrop-filter` or `backdrop-blur` in the game window.** These force expensive GPU compositing every frame and compete with the WebGL shader pipeline. Use solid or semi-transparent backgrounds instead. Backdrop effects are fine in the library UI where frame pacing doesn't matter.
- **No expensive CSS effects layered over the game canvas.** Avoid `box-shadow` animations, large `filter: blur()`, or CSS `transform` animations on elements that overlap the canvas during gameplay. Static transforms and opacity transitions are acceptable.
- **Renderer draws must be synced to `requestAnimationFrame`.** Never draw to WebGL directly from an IPC event handler. Buffer the latest frame and draw it in the next rAF callback to align with the display's vsync.
- **Emulation timing must not rely on `setTimeout`/`setInterval` precision.** These have ~4ms minimum granularity and jitter under load. The target architecture is a dedicated Worker thread with high-resolution timing (see P2 in `DEVELOPMENT_PLAN.md`).
- **Profile before adding multi-pass shaders.** Any shader preset with 3+ passes must be tested on integrated GPUs (e.g. Apple M-series) to confirm it maintains 60fps. Include lighter alternatives users can fall back to.
- **Measure, don't guess.** When in doubt about a change's performance impact, add a temporary FPS/frame-time counter and test with a real game running. Don't ship code that "should be fine" without verification.
- **Pause-state effects are exempt.** When the emulation loop is stopped (paused, menu open, etc.), the GPU is idle and expensive cosmetic effects (VHS distortion, scanline drift, static overlays) are fair game. The performance rules above apply to effects running *during active gameplay*.

## Responsiveness — Never Block the UI

The renderer process must stay responsive at all times. Long-running operations (file I/O, hashing, network requests, database queries, bulk processing) must never freeze the UI or make the user wait with no feedback.

### Rules

- **Never await a long operation without streaming progress.** If an IPC invoke could take more than ~200ms (scanning directories, hashing files, downloading assets, bulk sync), the main process must emit incremental progress events so the renderer can show live feedback (counts, progress bars, items appearing as they're found).
- **Process new/unknown items first.** When rescanning or re-syncing, prioritize items the user hasn't seen before. Known/cached items can be verified in the background after new items are already visible.
- **Cache aggressively, invalidate precisely.** Store enough metadata (file mtimes, content hashes, ETags) to skip redundant work on repeat operations. A rescan of unchanged data should be near-instant.
- **Bound concurrency, don't serialize.** When processing many independent items (hashing files, downloading images, querying APIs), use bounded parallel execution (e.g. `Promise.all` over batches of 4-8) instead of sequential `for...of` loops.
- **Show the result before the operation finishes.** If a scan finds 5 new games, those 5 should appear in the library grid immediately — don't wait for the remaining 2000 known files to be re-verified before updating the UI.
- **Maintain a reverse index for O(1) lookups.** When a data structure is frequently queried by a secondary key (e.g. looking up games by `romPath` during scans), maintain an index map instead of doing linear scans over the full collection.
