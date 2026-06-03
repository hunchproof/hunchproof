#!/usr/bin/env bash
# Hunchproof — one-command local stack: FastAPI backend + the React/Vite frontend, wired.
#
#   ./run_local.sh                 # backend + Vite dev frontend (VITE_API_BASE auto-wired)
#   ./run_local.sh --replay DIR    # also seed real fixtures from football-data CSVs (ingestion)
#   ./run_local.sh --legacy        # serve the legacy single-file UI (hunchproof_app.html) instead
#
# Open the printed URL. The frontend talks to the backend; commits land with a
# server-snapshotted q_submit, distribution invisible pre-reveal.
set -euo pipefail

API_PORT=${API_PORT:-8000}
WEB_PORT=${WEB_PORT:-5173}
LEGACY_PORT=${LEGACY_PORT:-8080}
DB=${POF_DB:-pof_mvp.db}
HERE="$(cd "$(dirname "$0")" && pwd)"     # product/
ROOT="$(cd "$HERE/.." && pwd)"            # repo root
WEB="$ROOT/web"
VENV="$ROOT/.venv"
export POF_DB="$DB"

MODE="modern"; REPLAY_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --legacy) MODE="legacy"; shift ;;
    --replay) REPLAY_DIR="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

# --- resolve a Python >= 3.11 for the backend ---------------------------------
pick_python() {
  for c in python3.12 python3.11 python3.13 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c 'import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)' 2>/dev/null; then
        echo "$c"; return 0
      fi
    fi
  done
  return 1
}
PY="$(pick_python || true)"
if [[ -z "$PY" ]]; then
  echo "ERROR: need Python >= 3.11 for the backend (found none). Install via: brew install python@3.12"
  exit 1
fi

# --- venv + backend deps ------------------------------------------------------
if [[ ! -x "$VENV/bin/uvicorn" ]]; then
  echo "Setting up backend venv at $VENV (one-time) using $PY …"
  "$PY" -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  "$VENV/bin/python" -m pip install -q fastapi "uvicorn[standard]" httpx numpy pandas scipy
fi

echo "Hunchproof — local stack"
echo "  python    : $("$VENV/bin/python" --version)"
echo "  db        : $DB"
echo "  backend   : http://127.0.0.1:$API_PORT"

# --- optional: seed real fixtures via the ingestion pipeline (replay) ---------
if [[ -n "$REPLAY_DIR" ]]; then
  echo "  ingesting fixtures from $REPLAY_DIR (replay) …"
  "$VENV/bin/python" "$HERE/ingestion.py" --replay "$REPLAY_DIR" --db "$DB" --max-matches "${MAX_MATCHES:-20}" || true
fi

pids=()
cleanup(){ echo; echo "stopping…"; for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# --- backend ------------------------------------------------------------------
"$VENV/bin/uvicorn" pof_backend:app --app-dir "$HERE" --port "$API_PORT" --log-level warning &
pids+=($!)

# --- frontend -----------------------------------------------------------------
if [[ "$MODE" == "legacy" ]]; then
  echo "  frontend  : legacy single-file (hunchproof_app.html)"
  "$VENV/bin/python" -m http.server "$LEGACY_PORT" --directory "$HERE" >/dev/null 2>&1 &
  pids+=($!)
  URL="http://127.0.0.1:$LEGACY_PORT/hunchproof_app.html?api=http://127.0.0.1:$API_PORT"
else
  command -v npm >/dev/null 2>&1 || { echo "ERROR: npm not found. Install Node 20+ (brew install node)."; exit 1; }
  if [[ ! -d "$WEB/node_modules" ]]; then
    echo "  installing web deps (one-time)…"; ( cd "$WEB" && npm install --silent )
  fi
  echo "  frontend  : Vite dev (React) on http://127.0.0.1:$WEB_PORT"
  ( cd "$WEB" && VITE_API_BASE="http://127.0.0.1:$API_PORT" npm run dev -- --port "$WEB_PORT" --strictPort ) &
  pids+=($!)
  URL="http://127.0.0.1:$WEB_PORT/"
fi

sleep 2
echo
echo "READY → open: $URL"
echo "(Ctrl-C to stop. For live World-Cup odds, set ODDS_API_KEY and swap ReplaySource for"
echo " TheOddsApiSource in an ingestion daemon — see external/DEPLOYMENT_RUNBOOK.md.)"
wait
