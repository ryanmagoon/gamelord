# Contributing

## Setup

```bash
git clone https://github.com/ryanmagoon/gamelord.git
cd gamelord
pnpm install
cd apps/desktop/native && npx node-gyp rebuild && cd ../../..
pnpm dev
```

## Branch Naming

Use `<type>/<short-descriptive-name>`:

- `feat/game-library-search`
- `fix/audio-desync`
- `refactor/emulator-manager`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

## Pull Requests

- **Reference the issue** — Use `Closes #123` in the PR description
- **All PRs are squash-merged** onto `main`
- **CI must pass** — Lint, typecheck, format, and tests all need to be green before merge
- **Review comments must be resolved** before merging

## Code Style

- TypeScript everywhere
- No `as any` casts — use proper types
- No `!` non-null assertions — use guard clauses
- Use existing shadcn/Radix primitives from `packages/ui/` before building custom interactive elements
- Run `pnpm lint && pnpm typecheck && pnpm format` before committing

## Testing

- Colocate tests next to source files (e.g. `Foo.test.ts` next to `Foo.ts`)
- Use happy-dom over jsdom when a simulated DOM is needed
- Run `pnpm test` before pushing

## UI Components

Components with multiple visual states (loading, error, empty, etc.) should be standalone presentational components in `packages/ui/` with Storybook stories for each state. Run `pnpm storybook` to browse them.
