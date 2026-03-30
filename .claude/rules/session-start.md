# Session Start (Project-Specific)

After the global session-start steps (sync with main, check for stashed changes):

1. Read `DEVELOPMENT_PLAN.md` for current project state.

## Native Addon

Before manually testing any emulator functionality, ensure the native addon is built: `cd apps/desktop/native && npx node-gyp rebuild`. The app will start without it, but emulator cores won't load. Rebuild after `pnpm install` (which may clear `node_modules`) or when switching to a worktree (build artifacts aren't shared).

## Worktree Setup

When working in a git worktree (`.claude/worktrees/`), dependencies and build artifacts are not shared with the main repo. After `pnpm install`, run:

1. **`./scripts/setup-worktree.sh`** — Symlinks `.env` and any other shared files from the main repo. Safe to run multiple times. This replaces the manual symlink step.
2. **Build the native addon** (see above).

### Rename auto-generated worktree branches

Claude Code creates worktrees with random branch names like `claude/xenodochial-bassi`. These are useless for identifying what's being worked on. **Before starting any work**, rename the branch to follow the project's `<type>/<short-descriptive-name>` convention:

```bash
git branch -m claude/random-name feat/descriptive-feature-name
```

This matters because:

- The dev branch badge in the title bar displays the branch name — a descriptive name immediately tells you which feature each app window belongs to.
- PRs, commit history, and `git branch` output are all more readable with meaningful names.
- The worktree directory name stays the same (it's just a checkout path), so nothing else breaks.
