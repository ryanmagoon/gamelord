#!/bin/bash
# Upload a screenshot to Vercel Blob and print the public URL.
#
# Usage: ./scripts/upload-screenshot.sh <image-path> [pathname]
#   image-path  Local file to upload (e.g. /tmp/screenshot.png)
#   pathname    Optional remote path (default: screenshots/<timestamp>-<filename>)
#
# Requires:
#   - vercel CLI installed (brew install vercel or pnpm add -g vercel)
#   - BLOB_READ_WRITE_TOKEN env var (from Vercel dashboard → Storage → Blob)
#
# Output: prints the public URL to stdout on success.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <image-path> [pathname]" >&2
  exit 1
fi

IMAGE_PATH="$1"

if [ ! -f "$IMAGE_PATH" ]; then
  echo "Error: file not found: $IMAGE_PATH" >&2
  exit 1
fi

if [ -z "${BLOB_READ_WRITE_TOKEN:-}" ]; then
  echo "Error: BLOB_READ_WRITE_TOKEN is not set." >&2
  echo "Create a Blob store in Vercel dashboard → Storage → Blob, then copy the token." >&2
  exit 1
fi

if ! command -v vercel &>/dev/null; then
  echo "Error: vercel CLI not found. Install with: pnpm add -g vercel" >&2
  exit 1
fi

# GitHub's camo proxy rejects images over ~5MB. Warn early.
FILE_SIZE=$(stat -f%z "$IMAGE_PATH" 2>/dev/null || stat -c%s "$IMAGE_PATH" 2>/dev/null)
if [ "$FILE_SIZE" -gt 5000000 ]; then
  echo "Warning: file is $(( FILE_SIZE / 1048576 ))MB — GitHub's camo proxy may reject it." >&2
  echo "Use JPEG (capture-screenshot.sh defaults to .jpg) or compress with:" >&2
  echo "  sips -s format jpeg -s formatOptions 80 $IMAGE_PATH --out ${IMAGE_PATH%.png}.jpg" >&2
fi

FILENAME="$(basename "$IMAGE_PATH")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [ $# -ge 2 ]; then
  PATHNAME="$2"
else
  PATHNAME="screenshots/${TIMESTAMP}-${FILENAME}"
fi

# Upload to Vercel Blob (store access level is set at creation time in the dashboard).
# --force allows overwriting if pathname already exists.
# BLOB_READ_WRITE_TOKEN is read automatically from the environment.
OUTPUT=$(vercel blob put "$IMAGE_PATH" \
  --pathname "$PATHNAME" \
  --force \
  --no-color 2>&1)

# Extract URL from output — vercel blob put prints "Success! <url>"
URL=$(echo "$OUTPUT" | grep -oE 'https://[^ ]+\.blob\.vercel-storage\.com[^ ]*' | head -1)

if [ -z "$URL" ]; then
  echo "Error: failed to extract URL from vercel blob put output:" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "$URL"
