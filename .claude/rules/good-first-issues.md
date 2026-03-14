# Good First Issues

When creating new GitHub issues, evaluate whether the issue qualifies as a "good first issue" and label it accordingly.

## Criteria

A good first issue is one that a contributor unfamiliar with the codebase could pick up and complete. It must meet **all** of these:

- **Well-scoped**: Clear acceptance criteria — it's obvious what "done" looks like.
- **Low blast radius**: Touches 1-3 files, no architecture changes, no cross-cutting concerns.
- **No deep domain knowledge**: Doesn't require understanding emulation internals, the native C++ addon, shader pipelines, or WebGL rendering.
- **Self-contained**: No external service setup, no secret/credential access, no complex local environment requirements beyond the standard dev setup.
- **Existing patterns to follow**: There's already a similar feature in the codebase that can serve as a reference implementation (e.g. adding a new filter when other filters already exist).

## Not good first issues

- Anything touching the emulation loop, native addon, or frame pacing
- Shader/WebGL work
- Backend/infrastructure (database, auth, cloud saves, multiplayer)
- Major UI redesigns or new architectural patterns
- Platform ports (Windows, Linux)
- Tasks requiring access to external dashboards or credentials that a contributor wouldn't have
- AI/ML features

## When creating issues

When writing a new GitHub issue, check it against the criteria above. If it qualifies, add the `good first issue` label at creation time — don't defer labeling to a later triage pass.
