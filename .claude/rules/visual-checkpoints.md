# Visual Checkpoints — Don't Drift from the Reference

When implementing a visual feature (UI aesthetic, animation, layout, styling), **check in with the user frequently** rather than building out the full implementation in one shot.

## Rules

- **After each visual milestone, screenshot and ask.** Don't implement 7 commits of a visual feature without showing the user what it looks like. At minimum, pause and share a preview after:
  1. The first pass of the core visual effect (e.g. the glow, the color palette, the animation)
  2. Any structural change to existing components (new DOM layers, new CSS classes)
  3. Before moving on to secondary effects (chromatic aberration, scanlines, noise, etc.)

- **Compare against the reference explicitly.** If the user shared a reference image, video, or example, describe what your implementation matches and what it doesn't before proceeding. Don't assume alignment — confirm it.

- **Ask before adding effects the user didn't request.** If the reference shows a pointer-tracking glow but you're also adding chromatic aberration, VHS tracking distortion, background noise, and a warm color palette — stop and ask. Each additional effect is a decision point, not an obvious next step.

- **Don't over-interpret a reference.** A reference showing cards with a shared hover glow doesn't mean "recolor the entire app with a warm phosphor palette." Implement what's shown, not what you imagine the reference implies.

- **One effect at a time, verified.** Implement the most important visual behavior first, get user approval, then layer on the next. This prevents building 6 effects that all need to be scrapped because the foundation was wrong.

## Why This Matters

Visual features are subjective. The gap between "what I think this should look like" and "what the user wants" grows silently with every uncommitted assumption. Checking in early and often is cheaper than scrapping a branch.
