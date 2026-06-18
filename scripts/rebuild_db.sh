#!/usr/bin/env bash
# Local DB rebuild: preamble (drop all) + every migration in order + seed, in ONE psql session.
# Bypasses `supabase db reset` (its healthcheck flaps under the 5000-row seed). Fail-fast.
set -euo pipefail
cd "$(dirname "$0")/.."
C="${SUPABASE_DB_CONTAINER:-supabase_db_musixmatch-customer-ops}"

# wait until postgres accepts connections (container may be restarting)
until docker exec "$C" pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

start=$SECONDS
{
  cat scripts/db_reset_preamble.sql
  cat supabase/migrations/*.sql
  cat supabase/seed.sql
} | docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
echo "REBUILD+SEED ok in $((SECONDS - start))s"
