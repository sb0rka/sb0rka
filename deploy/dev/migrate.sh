#!/usr/bin/env bash
# Готовит платформенную БД: схемы, search_path, миграции, dev-инициализация.
set -euo pipefail

export PGPASSWORD=postgres
PSQL=(psql -v ON_ERROR_STOP=1 -h postgres -U postgres -d platform)

echo "[migrate] creating schemas + search_path..."
"${PSQL[@]}" -c 'CREATE SCHEMA IF NOT EXISTS api;'
"${PSQL[@]}" -c 'CREATE SCHEMA IF NOT EXISTS auth;'
"${PSQL[@]}" -c 'ALTER DATABASE platform SET search_path = api, public;'

echo "[migrate] applying migrations..."
for f in $(ls /migrations/*.sql | sort); do
  echo "[migrate]   -> $(basename "$f")"
  "${PSQL[@]}" -v DB_API_SCHEMA_NAME=api -v DB_DRONE_MAPPING_USER=postgres -f "$f"
done

echo "[migrate] applying dev setup (auth stub, plans, encryption key)..."
"${PSQL[@]}" -f /dev-setup.sql

echo "[migrate] done"
