#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCTOR_SCRIPT="$ROOT_DIR/scripts/convex-env-doctor.sh"

TARGET="dev"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    -h|--help)
      cat <<USAGE
Usage: $0 [--target dev|prod]

Syncs required Convex runtime env vars using upsert-only semantics.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$TARGET" != "dev" && "$TARGET" != "prod" ]]; then
  echo "Invalid target '$TARGET'. Use dev or prod." >&2
  exit 1
fi

if [[ ! -x "$DOCTOR_SCRIPT" ]]; then
  echo "Doctor script not executable: $DOCTOR_SCRIPT" >&2
  exit 1
fi

resolved=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  resolved+=("$line")
done < <("$DOCTOR_SCRIPT" --target "$TARGET" --print-resolved)

if (( ${#resolved[@]} == 0 )); then
  echo "No keys resolved; aborting sync." >&2
  exit 1
fi

if [[ "$TARGET" == "prod" ]]; then
  context="production deployment (--prod)"
else
  context="development deployment (default convex target)"
fi

echo "Syncing Convex env to $context"
if [[ -n "${CONVEX_DEPLOYMENT:-}" ]]; then
  echo "CONVEX_DEPLOYMENT=$CONVEX_DEPLOYMENT"
fi

echo "Upserting ${#resolved[@]} required keys..."
for entry in "${resolved[@]}"; do
  key="${entry%%=*}"
  value="${entry#*=}"
  pair="${key}=${value}"
  if [[ "$TARGET" == "prod" ]]; then
    npx convex env set --prod "$pair"
  else
    npx convex env set "$pair"
  fi
done

echo "Convex env sync complete for target '$TARGET'."
