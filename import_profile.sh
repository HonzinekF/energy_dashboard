#!/usr/bin/env bash
set -euo pipefail
PROFILE=${1:-}
if [ -z "$PROFILE" ]; then
  echo "Usage: $0 PROFILE_SLUG (např. JAN_FAIT nebo PETR_TESAR)" >&2
  exit 1
fi
CSV_PATH="/Users/janfait/energy-dashboard/energy_report_${PROFILE}_ALL.csv"
if [ ! -f "$CSV_PATH" ]; then
  echo "CSV nenalezeno: $CSV_PATH" >&2
  exit 1
fi
SYSTEM_ID=$(echo "$PROFILE" | tr '[:upper:]' '[:lower:]')
USER_ID=$SYSTEM_ID
export SYSTEM_ID USER_ID
npx tsx scripts/import-jan-fait-all.ts "$CSV_PATH"
npx tsx scripts/import-measurements.ts --file "$CSV_PATH"
