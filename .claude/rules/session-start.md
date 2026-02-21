# Session Start

At the start of every new conversation, before doing anything else:

1. `git fetch origin && git checkout main && git pull origin main` — ensure you're on the latest `main`.
2. If there are stashed or uncommitted changes from a previous session, surface them to the user and ask what to do (keep, drop, or stash).
3. Read `DEVELOPMENT_PLAN.md` for current project state.

Never give advice about what to work on next, or start new work, from a stale branch.

## Worktree Setup

When working in a git worktree (`.claude/worktrees/`), dependencies and build artifacts are not shared with the main repo. After `pnpm install`, also run:

1. **Build the native addon** — `cd apps/desktop/native && npx node-gyp rebuild`. Without this, the emulator cores won't load.
2. **Symlink `.env`** — `ln -s /Users/ryanmagoon/code/gamelord/apps/desktop/.env apps/desktop/.env`. The worktree only has `.env.example`; the real credentials (ScreenScraper, etc.) live in the main repo.
