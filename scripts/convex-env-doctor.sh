#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULTS_FILE="${DEFAULTS_FILE:-$ROOT_DIR/config/env/convex.defaults.env}"
LOCAL_FILE="${LOCAL_FILE:-$ROOT_DIR/.env.convex.local}"
REQUIRED_FILE="${REQUIRED_FILE:-$ROOT_DIR/config/env/convex.required.keys}"

TARGET="dev"
PRINT_RESOLVED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --print-resolved)
      PRINT_RESOLVED=1
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: $0 [--target dev|prod] [--print-resolved]

Validates merged Convex env values from:
  1) config/env/convex.defaults.env
  2) .env.convex.local

Use --print-resolved to output resolved required KEY=VALUE pairs.
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

if [[ ! -f "$DEFAULTS_FILE" ]]; then
  echo "Defaults file not found: $DEFAULTS_FILE" >&2
  exit 1
fi

if [[ ! -f "$REQUIRED_FILE" ]]; then
  echo "Required keys file not found: $REQUIRED_FILE" >&2
  exit 1
fi

if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "Local secret file missing: $LOCAL_FILE" >&2
  echo "Create it from template: cp .env.convex.local.example .env.convex.local" >&2
  exit 1
fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

strip_wrapping_quotes() {
  local v="$1"
  local n=${#v}
  if (( n >= 2 )); then
    local first="${v:0:1}"
    local last="${v:n-1:1}"
    if [[ "$first" == '"' && "$last" == '"' ]]; then
      printf '%s' "${v:1:n-2}"
      return
    fi
    if [[ "$first" == "'" && "$last" == "'" ]]; then
      printf '%s' "${v:1:n-2}"
      return
    fi
  fi
  printf '%s' "$v"
}

MERGED_FILE="$(mktemp)"
trap 'rm -f "$MERGED_FILE" "$MERGED_FILE.tmp"' EXIT

merge_file() {
  local file="$1"
  local line key value cleaned

  while IFS= read -r line || [[ -n "$line" ]]; do
    cleaned="$(trim "$line")"
    [[ -z "$cleaned" ]] && continue
    [[ "${cleaned:0:1}" == "#" ]] && continue

    if [[ "$cleaned" != *=* ]]; then
      echo "Invalid env line in $file: $line" >&2
      exit 1
    fi

    key="$(trim "${cleaned%%=*}")"
    value="${cleaned#*=}"
    value="$(trim "$value")"

    if [[ ! "$key" =~ ^[A-Z][A-Z0-9_]*(__(DEV|PROD))?$ ]]; then
      echo "Invalid env key '$key' in $file" >&2
      exit 1
    fi

    value="$(strip_wrapping_quotes "$value")"

    grep -v "^${key}=" "$MERGED_FILE" > "$MERGED_FILE.tmp" || true
    mv "$MERGED_FILE.tmp" "$MERGED_FILE"
    printf '%s=%s\n' "$key" "$value" >> "$MERGED_FILE"
  done < "$file"
}

resolve_value() {
  local key="$1"
  local target_upper
  target_upper="$(printf '%s' "$TARGET" | tr '[:lower:]' '[:upper:]')"
  local target_key="${key}__${target_upper}"
  local line

  line="$(grep -E "^${target_key}=" "$MERGED_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    line="$(grep -E "^${key}=" "$MERGED_FILE" | tail -n 1 || true)"
  fi

  if [[ -n "$line" ]]; then
    printf '%s' "${line#*=}"
  fi
}

merge_file "$DEFAULTS_FILE"
merge_file "$LOCAL_FILE"

if [[ "$PRINT_RESOLVED" -eq 0 ]]; then
  echo "Convex env doctor"
  echo "  Target: $TARGET"
  echo "  Defaults: $DEFAULTS_FILE"
  echo "  Local overrides: $LOCAL_FILE"
  echo "  Required keys: $REQUIRED_FILE"
fi

missing=()
resolved_lines=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="$(trim "$line")"
  [[ -z "$line" ]] && continue
  [[ "${line:0:1}" == "#" ]] && continue

  key="$line"
  value="$(resolve_value "$key")"
  if [[ -z "$value" ]]; then
    missing+=("$key")
  else
    resolved_lines+=("$key=$value")
  fi
done < "$REQUIRED_FILE"

if (( ${#missing[@]} > 0 )); then
  echo "Missing required Convex env keys for target '$TARGET':" >&2
  for k in "${missing[@]}"; do
    echo "  - $k" >&2
  done
  echo "Set them in $LOCAL_FILE (or KEY__DEV / KEY__PROD variants)." >&2
  exit 1
fi

if [[ "$PRINT_RESOLVED" -eq 1 ]]; then
  printf '%s\n' "${resolved_lines[@]}"
else
  echo "All required keys resolved for target '$TARGET'."
fi
