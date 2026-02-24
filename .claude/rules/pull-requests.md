# Pull Request Media

Before creating a PR, evaluate whether the changes would benefit from a screenshot or short video to clearly communicate what changed. If so, **ask the user for media before opening the PR** so it can be included in the description.

## When to ask

- **Always ask** for UI changes: new components, layout changes, styling, animations, shader effects, theme changes, visual polish.
- **Always ask** for new user-facing features: the PR reviewer (and future readers) should see what was built.
- **Ask when helpful** for bug fixes with a visual symptom: before/after screenshots make the fix obvious.
- **Skip** for purely internal changes: refactors, dependency bumps, test-only changes, CI config, docs-only changes.

## How to ask

Before running `gh pr create`, prompt the user:

> This PR has visual changes — do you have a screenshot or short video showing the result? I'll include it in the PR description.

If the user provides media, embed it in the PR body using GitHub markdown (`![description](url)` or a `<video>` tag). If they don't have one ready, offer to proceed without it but note in the PR body that a visual is pending.
