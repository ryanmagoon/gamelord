# Session Start

At the start of every new conversation, before doing anything else:

1. `git fetch origin && git checkout main && git pull origin main` — ensure you're on the latest `main`.
2. If there are stashed or uncommitted changes from a previous session, surface them to the user and ask what to do (keep, drop, or stash).
3. Read `DEVELOPMENT_PLAN.md` for current project state.

Never give advice about what to work on next, or start new work, from a stale branch.
