# Dependencies

Keep the dependency footprint minimal. Every new dependency is a maintenance liability — it must justify its inclusion.

## Rules

- **Prefer zero-dependency solutions.** If the feature can be implemented in <50 lines of straightforward code, don't add a library. Standard Web APIs and Node built-ins cover more than you think.
- **When a dependency is needed, pick the best one.** Evaluate candidates on: active maintenance (recent commits, responsive issues), TypeScript-first (native types, not `@types/` afterthought), bundle size, API quality, and community adoption. Don't settle for "good enough" — find the modern, well-maintained option.
- **Type safety is non-negotiable.** Every dependency must have first-class TypeScript support. If a library's types are incomplete, inaccurate, or community-maintained `@types/` with frequent drift, look for an alternative that was written in TypeScript.
- **Audit before adding.** Check the package's dependency tree (`pnpm why`, bundlephobia). A "small" library that pulls in 40 transitive dependencies is not small. Prefer libraries with zero or minimal transitive deps.
- **Document the choice.** When adding a non-obvious dependency, leave a brief comment in the PR description explaining why this library was chosen over alternatives.
- **Check for transitive `@types/node` pollution.** After adding a dependency, run `pnpm why @types/node` and verify the hoisted version still matches the project's pinned version (`^24` via `pnpm.overrides`). Transitive deps that pull in a newer `@types/node` can silently break `tsgo` type resolution on CI.
