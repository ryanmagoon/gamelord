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

### Rename auto-generated worktree branches

Claude Code creates worktrees with random branch names like `claude/xenodochial-bassi`. These are useless for identifying what's being worked on. **Before starting any work**, rename the branch to follow the project's `<type>/<short-descriptive-name>` convention:

```bash
git branch -m claude/random-name feat/descriptive-feature-name
```

This matters because:
- The dev branch badge in the title bar displays the branch name — a descriptive name immediately tells you which feature each app window belongs to.
- PRs, commit history, and `git branch` output are all more readable with meaningful names.
- The worktree directory name stays the same (it's just a checkout path), so nothing else breaks.
