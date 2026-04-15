# Pull Request Media

Before creating a PR, evaluate whether the changes would benefit from a screenshot or short video to clearly communicate what changed.

## When screenshots are needed

- **Always** for UI changes: new components, layout changes, styling, animations, shader effects, theme changes, visual polish.
- **Always** for new user-facing features: the PR reviewer (and future readers) should see what was built.
- **When helpful** for bug fixes with a visual symptom: before/after screenshots make the fix obvious.
- **Skip** for purely internal changes: refactors, dependency bumps, test-only changes, CI config, docs-only changes.

## Storybook vs app screenshots

Choose the capture method based on what the change actually needs to prove:

- **Storybook is sufficient** when the component's visual states are fully representable as stories. This covers new component states, styling changes, loading/error/empty states, and prop-driven variations. If the reviewer can evaluate the visual change from isolated stories alone, Storybook screenshots are enough.
- **App screenshots are needed** when the surrounding context matters: layout within the game window, interaction with adjacent UI, integration behavior that depends on IPC or real data, or when the change affects how the component looks in situ (positioning, z-index stacking, backdrop effects over the game canvas).
- **Both** when the change adds new component states (show them isolated in Storybook) *and* changes how the component fits into the app (show it in context).

When in doubt, Storybook screenshots are the baseline — they're fast to capture, reproducible, and cover the visual diff. Add app screenshots when they'd tell the reviewer something Storybook can't.

## Capture screenshots yourself

**Capture screenshots using preview tools before creating the PR.** Don't ask the user for screenshots when you can take them.

1. Start the relevant preview server (Storybook for component stories, desktop dev for full app)
2. Navigate to the relevant story/page
3. Use `preview_screenshot` to capture each meaningful state
4. Resize the viewport to crop tightly around the component (`preview_resize`)
5. Include the screenshots in the PR body using GitHub markdown

Only ask the user for media when the state can't be reproduced in a preview server (e.g., requires real hardware, real network conditions, or the full Electron runtime with IPC).

After capturing screenshots, upload them to Vercel Blob using `scripts/upload-screenshot.sh` and embed the returned URL in the PR body. The script requires `BLOB_READ_WRITE_TOKEN` — source it from `apps/desktop/.env` before calling. See `screenshot-hosting.md` for the full workflow (includes both Storybook and app capture methods).

If the user provides media, embed it in the PR body using GitHub markdown (`![description](url)` or a `<video>` tag). If screenshots can't be captured or provided, note in the PR body that a visual is pending.

## Review Comments

**All review comments must be resolved before merging.** This is enforced by GitHub branch protection (`required_conversation_resolution`). Before merging any PR:

1. Check for review comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   gh api repos/{owner}/{repo}/pulls/{number}/reviews
   ```
2. Address every comment — push fixes to the same branch for code changes, reply to acknowledge non-actionable feedback.
3. Verify no unresolved conversations remain before running `gh pr merge`.

After creating a PR, also check proactively for comments before moving on to other work. If the PR is already merged, open a follow-up PR for any unaddressed feedback.
