# Storybook Coverage

All UI components with loading, error, or transitional states **must** have Storybook stories representing each state. This makes states easy to polish, iterate on, and visually verify without needing to reproduce them in the running app. Examples: artwork sync phases (hashing, querying, downloading, done, error, not-found), empty/loading library, form validation errors.

## Presentational Extraction

UI that has multiple visual states (progress, error, loading, empty, etc.) **must** be a standalone presentational component in `packages/ui/`, even if it's only used in one place. Electron-coupled parent components pass data and callbacks via props — the presentational component has zero IPC or `window.gamelord` dependencies.

This ensures every stateful UI can be rendered in Storybook without the Electron runtime. If you can't screenshot it in Storybook, it needs extraction.
