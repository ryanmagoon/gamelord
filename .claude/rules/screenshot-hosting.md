# Screenshot Hosting for PRs

PR screenshots are hosted on Vercel Blob. Two scripts handle the full pipeline — capture and upload — so Claude Code can programmatically screenshot the running app and embed the result in PRs with no manual interaction.

## Full workflow

```bash
# 1. Start the Electron app with CDP enabled (default port 9222, configurable via CDP_PORT)
cd apps/desktop && pnpm dev

# 2. Capture a screenshot of the running app
./scripts/capture-screenshot.sh /tmp/library.png

# 3. Upload to Vercel Blob
URL=$(./scripts/upload-screenshot.sh /tmp/library.png)

# 4. Embed in PR body
BODY=$(gh pr view <number> --json body -q .body)
gh pr edit <number> --body "${BODY}

![Library window](${URL})"
```

## Scripts

### `scripts/capture-screenshot.sh [output-path] [--cdp-port PORT]`

Connects to the running Electron app via CDP (playwright) and saves a PNG screenshot.

- Default output: `/tmp/gamelord-screenshot.png`
- Default CDP port: `9222` (reads `CDP_PORT` env var, then `--cdp-port` flag)
- Outputs JPEG by default (quality 80) to stay under GitHub's ~5MB camo proxy limit
- Uses `playwright` (project dev dependency)

### `scripts/upload-screenshot.sh <image-path> [pathname]`

Uploads an image to Vercel Blob and prints the public URL.

- Auto-generates a timestamped pathname: `screenshots/20260414-153022-filename.png`
- Requires `BLOB_READ_WRITE_TOKEN` env var
- Requires `vercel` CLI (installed globally)

## Environment setup

1. Create a Blob store in Vercel dashboard: project → Storage → Blob → Create (public access)
2. Copy the `BLOB_READ_WRITE_TOKEN` from the store settings
3. Add it to `apps/desktop/.env`:
   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```
4. In worktrees, run `./scripts/setup-worktree.sh` to symlink the `.env` file

## When to use

Follow the guidance in `pull-requests.md` for when screenshots are needed. Use this workflow whenever you need to include screenshots in a PR.
