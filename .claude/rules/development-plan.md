# Keeping the Development Plan Current

`DEVELOPMENT_PLAN.md` is the single source of truth for project state. It must stay accurate across sessions so any new chat can pick up where the last one left off.

- **Mark items done as you complete them.** When you finish a TODO item, immediately update it from `[ ]` to `[x]` with a brief description of what was done. Don't batch these — update the plan in the same commit as the implementation.
- **Add new items when they're discovered.** If work reveals a new task, bug, or follow-up, add it to the appropriate priority section in `DEVELOPMENT_PLAN.md`. This includes ideas discussed in conversation that we decide to pursue — if it's agreed upon, it goes in the plan.
- **Record new known issues.** If you encounter a bug, limitation, or quirk during development, add it to the "Known Issues" section at the bottom of the plan.
- **Reference GitHub issues.** When a GitHub issue is created for deferred work, include the issue URL next to the corresponding item in the plan (e.g., `— see #42`). When closing an issue via PR, update the plan item to `[x]` in the same change.
