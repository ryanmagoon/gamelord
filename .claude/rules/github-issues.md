# GitHub Issues

## Sub-Issues for Multi-Part Work

When creating a set of related issues (3+) that form a single initiative, always create a **parent tracking issue** and link the individual issues as sub-issues using the GraphQL API:

```bash
# 1. Create the parent tracking issue with a task list referencing child issues
gh issue create --title "Parent title" --body "- [ ] #101\n- [ ] #102\n- [ ] #103"

# 2. Get node IDs
gh api graphql -f query='{
  repository(owner: "ryanmagoon", name: "gamelord") {
    parent: issue(number: 104) { id }
    child: issue(number: 101) { id }
  }
}'

# 3. Link each child as a sub-issue
gh api graphql -f query='
  mutation {
    addSubIssue(input: {issueId: "PARENT_NODE_ID", subIssueId: "CHILD_NODE_ID"}) {
      issue { number }
      subIssue { number }
    }
  }
'
```

The `gh` CLI does not have a `--add-parent` flag — use the GraphQL `addSubIssue` mutation instead.
