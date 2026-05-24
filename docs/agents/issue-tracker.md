# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues at [ryanmagoon/gamelord](https://github.com/ryanmagoon/gamelord). Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Repo-specific rules (see CLAUDE.md for the source of truth)

- **Every PR references an issue** — PR body must include `Closes #<n>` or `Fixes #<n>`. If no issue exists for non-trivial work, create one first. See `## Pull Requests` in CLAUDE.md.
- **Branch naming**: `<type>/<short-descriptive-name>` where type is one of `feat | fix | refactor | docs | test | chore`. See `## Git Conventions` in CLAUDE.md.
- **Never push to `main`** — branch protection enforces this. Always open a PR.
- **Sub-issues for multi-part work**: parent tracking issue + linked sub-issues via the GraphQL `addSubIssue` mutation. See `.claude/rules/github-issues.md`.
- **Good-first-issue labeling**: check new issues against `.claude/rules/good-first-issues.md` and apply the label at creation time when it qualifies.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
