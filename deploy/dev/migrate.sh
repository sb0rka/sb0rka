#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD=postgres
PSQL=(psql -v ON_ERROR_STOP=1 -h postgres -U postgres -d platform)

echo "[migrate] configuring search_path..."
"${PSQL[@]}" -c 'ALTER DATABASE platform SET search_path = api, auth, public;'

echo "[migrate] applying platform migrations..."
for f in /migrations/*.sql; do
  echo "[migrate]   -> $(basename "$f")"
  "${PSQL[@]}" -v DB_API_SCHEMA_NAME=api -v DB_DRONE_MAPPING_USER=postgres -f "$f"
done

echo "[migrate] applying auth migrations..."
for f in /migrations-auth/*.sql; do
  echo "[migrate]   -> $(basename "$f")"
  "${PSQL[@]}" -v DB_AUTH_SCHEMA_NAME=auth -f "$f"
done

echo "[migrate] done"
