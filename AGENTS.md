# GameLord Agent Instructions

See `CLAUDE.md` for project conventions (git, PR workflow, design philosophy, performance rules).
See `DEVELOPMENT_PLAN.md` for current project state and TODO roadmap.

## Cursor Cloud specific instructions

### Project overview

GameLord is an Electron + React + TypeScript emulation frontend (monorepo: `apps/desktop` + `packages/ui`). Uses pnpm workspaces + Turbo. The native C++ addon (`apps/desktop/native/`) bridges libretro cores via N-API.

### Key commands

| Task | Command |
|---|---|
| Install deps | `pnpm install --frozen-lockfile` |
| Build native addon | `cd apps/desktop/native && npx node-gyp rebuild` |
| Dev server (Electron) | `pnpm dev` (from repo root) |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Tests | `pnpm test` |
| Storybook | `pnpm storybook` (port 6006) |

### Non-obvious caveats

- **libasound2-dev required on Linux.** The native addon links `-lasound`. Without this system package, `node-gyp rebuild` fails. Already installed in the VM snapshot.
- **pnpm build script allowlist.** `@swc/core`, `@tailwindcss/oxide`, and `esbuild` must be listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml` (alongside `electron`). Without this, their postinstall scripts are skipped and Vite/Tailwind/SWC won't work.
- **Use `npx node-gyp rebuild`** (not the globally bundled `node-gyp`). The npm-bundled version may be too old for the current Node.js version.
- **Electron GPU errors in headless containers.** `dbus` and GPU initialization errors in the terminal are expected and harmless when running in a container/VM without a real GPU. The app renders via software fallback.
- **Turbo `test` task depends on `build`.** Running `pnpm test` will trigger builds first. For faster iteration on tests only, run `vitest run` directly in the workspace (e.g. `cd apps/desktop && npx vitest run`).
