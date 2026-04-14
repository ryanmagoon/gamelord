# Screenshot Hosting for PRs

PR screenshots are hosted on Vercel Blob. This enables Claude Code to programmatically capture screenshots, upload them, and embed them in PR descriptions — no manual browser interaction required.

## Upload workflow

```bash
# 1. Capture a screenshot (via preview tools, agent-browser, or any other method)
#    Save to a temp file, e.g. /tmp/library-grid.png

# 2. Upload to Vercel Blob
URL=$(./scripts/upload-screenshot.sh /tmp/library-grid.png)

# 3. Embed in PR body
gh pr edit <number> --body "$(gh pr view <number> --json body -q .body)

![Library grid](${URL})"
```

## Script details

`scripts/upload-screenshot.sh <image-path> [pathname]`

- Uploads to Vercel Blob with public access
- Auto-generates a timestamped pathname: `screenshots/20260414-153022-filename.png`
- Prints the public URL to stdout
- Requires `BLOB_READ_WRITE_TOKEN` env var (set in `apps/desktop/.env`, symlinked to worktrees)
- Requires `vercel` CLI (already installed globally)

## Environment setup

1. Create a Blob store in Vercel dashboard: project → Storage → Blob → Create
2. Copy the `BLOB_READ_WRITE_TOKEN` from the store settings
3. Add it to `apps/desktop/.env`:
   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```
4. In worktrees, run `./scripts/setup-worktree.sh` to symlink the `.env` file

## When to use

Follow the guidance in `pull-requests.md` for when screenshots are needed. Use this upload workflow whenever you capture screenshots programmatically and need to include them in a PR.
