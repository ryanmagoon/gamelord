#!/bin/bash
# Capture a screenshot of the running Electron app via CDP.
#
# Usage: ./scripts/capture-screenshot.sh [output-path] [--cdp-port PORT]
#   output-path  Where to save the screenshot (default: /tmp/gamelord-screenshot.png)
#   --cdp-port   CDP debugging port (default: 9222)
#
# Prerequisites:
#   - The Electron app must be running with --remote-debugging-port=9222:
#       cd apps/desktop && pnpm exec electron-vite dev -- --remote-debugging-port=9222
#   - playwright must be installed (it's a dev dependency of this project)
#
# Output: saves a PNG screenshot and prints the path to stdout.

set -euo pipefail

OUTPUT_PATH="/tmp/gamelord-screenshot.png"
CDP_PORT=9222

while [ $# -gt 0 ]; do
  case "$1" in
    --cdp-port)
      CDP_PORT="$2"
      shift 2
      ;;
    *)
      OUTPUT_PATH="$1"
      shift
      ;;
  esac
done

# Verify CDP is reachable
if ! curl -s "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
  echo "Error: no CDP endpoint on port ${CDP_PORT}." >&2
  echo "Start the app with: cd apps/desktop && pnpm exec electron-vite dev -- --remote-debugging-port=${CDP_PORT}" >&2
  exit 1
fi

# Use playwright to connect and screenshot
node -e "
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:${CDP_PORT}');
  const pages = browser.contexts().flatMap(c => c.pages());

  // Prefer the library window (index.html / port 5173), fall back to first page
  const page = pages.find(p => p.url().includes('index.html') || p.url().includes('5173')) || pages[0];

  if (!page) {
    console.error('Error: no pages found via CDP');
    process.exit(1);
  }

  await page.screenshot({ path: '${OUTPUT_PATH}' });
  console.log('${OUTPUT_PATH}');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1

