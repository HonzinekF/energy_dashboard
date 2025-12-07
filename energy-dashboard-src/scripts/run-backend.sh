#!/usr/bin/env bash

set -euo pipefail

ENERGY_ROOT="/Users/janfait/Energetika"
VENV_ACTIVATE="$ENERGY_ROOT/solax_env/bin/activate"

if [[ -f "$VENV_ACTIVATE" ]]; then
  # shellcheck disable=SC1090
  source "$VENV_ACTIVATE"
else
  echo "Virtualenv nenalezen: $VENV_ACTIVATE" >&2
  exit 1
fi

export ENERGY_DB_PATH="/Users/janfait/energy-dashboard/data/energy.db"
export IMPORT_CALLBACK_URL="http://127.0.0.1:3000/api/imports/update"
export IMPORT_WEBHOOK_SECRET="${IMPORT_WEBHOOK_SECRET:-local-import-secret}"

HOST="${1:-127.0.0.1}"
PORT="${2:-8787}"

echo "Spouštím backend na $HOST:$PORT (DB: $ENERGY_DB_PATH)"
python3 "$ENERGY_ROOT/processor.py" serve --host "$HOST" --port "$PORT"
