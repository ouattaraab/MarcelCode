#!/usr/bin/env bash
set -euo pipefail

# Marcel'IA Extension - Build & Deploy Script
# Usage: ./scripts/deploy-extension.sh [--publish] [--copy-to <path>]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_DIR="$ROOT_DIR/packages/extension"
PUBLISH=false
COPY_TO=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)
      PUBLISH=true
      shift
      ;;
    --copy-to)
      COPY_TO="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--publish] [--copy-to <path>]"
      exit 1
      ;;
  esac
done

echo "=== Marcel'IA Extension - Build & Deploy ==="

# Step 1: Build shared + proxy + extension
echo "[1/4] Building project..."
cd "$ROOT_DIR"
npm run build -w packages/shared
npm run build -w packages/proxy
npm run build -w packages/extension

# Step 2: Package VSIX
echo "[2/4] Packaging VSIX..."
cd "$EXT_DIR"
npx vsce package --out marcelia.vsix
VSIX_PATH="$EXT_DIR/marcelia.vsix"
echo "  VSIX created: $VSIX_PATH"

# Step 3: Copy to network share if specified
if [[ -n "$COPY_TO" ]]; then
  echo "[3/4] Copying to $COPY_TO..."
  cp "$VSIX_PATH" "$COPY_TO/"
  echo "  Copied to $COPY_TO/marcelia.vsix"
else
  echo "[3/4] No copy target specified (use --copy-to <path>)"
fi

# Step 4: Publish if requested
if [[ "$PUBLISH" == "true" ]]; then
  echo "[4/4] Publishing to marketplace..."
  if [[ -z "${VSCE_PAT:-}" ]]; then
    echo "  ERROR: VSCE_PAT environment variable required for publishing"
    exit 1
  fi
  cd "$EXT_DIR"
  npx vsce publish --pat "$VSCE_PAT"
  echo "  Published successfully"
else
  echo "[4/4] Skipping publish (use --publish to publish)"
fi

echo ""
echo "=== Done ==="
echo "Install locally: code --install-extension $VSIX_PATH"
