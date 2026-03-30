#!/bin/bash
# Setup script for git worktrees.
# Symlinks shared files that aren't part of the git tree (credentials, env).
# Safe to run multiple times — skips files that already exist.
#
# Usage: ./scripts/setup-worktree.sh
#   Run from the worktree root after `pnpm install`.

set -euo pipefail

# Resolve the main repo root by walking up from this script's location
# to find the nearest .git *file* (worktrees have a .git file, not a directory).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find the main repo: read the gitdir pointer from the worktree's .git file
GIT_FILE="$WORKTREE_ROOT/.git"
if [ -f "$GIT_FILE" ]; then
  # .git file contains: "gitdir: /path/to/main/.git/worktrees/<name>"
  GITDIR=$(sed 's/^gitdir: //' "$GIT_FILE")
  # Walk up from .git/worktrees/<name> to the main repo root
  MAIN_REPO="$(cd "$GITDIR/../../.." && pwd)"
else
  echo "Not running inside a worktree (no .git file). Nothing to do."
  exit 0
fi

echo "Worktree root: $WORKTREE_ROOT"
echo "Main repo:     $MAIN_REPO"

# --- Symlink .env ---
ENV_SOURCE="$MAIN_REPO/apps/desktop/.env"
ENV_TARGET="$WORKTREE_ROOT/apps/desktop/.env"

if [ -f "$ENV_SOURCE" ]; then
  if [ -e "$ENV_TARGET" ]; then
    echo ".env already exists — skipping"
  else
    ln -s "$ENV_SOURCE" "$ENV_TARGET"
    echo "Symlinked .env"
  fi
else
  echo "Warning: $ENV_SOURCE not found — artwork sync credentials will be missing"
fi

echo "Worktree setup complete."
