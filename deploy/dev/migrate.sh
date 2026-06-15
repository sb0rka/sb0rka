#!/usr/bin/env bash
# Готовит общую БД platform: схемы api+auth, search_path, миграции, dev-инициализация.
set -euo pipefail

export PGPASSWORD=postgres
PSQL=(psql -v ON_ERROR_STOP=1 -h postgres -U postgres -d platform)

echo "[migrate] creating schemas + search_path..."
"${PSQL[@]}" -c 'CREATE SCHEMA IF NOT EXISTS api;'
"${PSQL[@]}" -c 'CREATE SCHEMA IF NOT EXISTS auth;'
# api и auth делят одну БД: api-таблицы в схеме api, auth-таблицы в auth, имена не пересекаются.
# api зовёт auth.is_live_session (квалифицированно), auth работает по search_path.
"${PSQL[@]}" -c 'ALTER DATABASE platform SET search_path = api, auth, public;'

echo "[migrate] applying platform migrations..."
for f in $(ls /migrations/*.sql | sort); do
  echo "[migrate]   -> $(basename "$f")"
  "${PSQL[@]}" -v DB_API_SCHEMA_NAME=api -v DB_DRONE_MAPPING_USER=postgres -f "$f"
done

echo "[migrate] applying auth migrations..."
for f in $(ls /migrations-auth/*.sql | sort); do
  echo "[migrate]   -> $(basename "$f")"
  "${PSQL[@]}" -v DB_AUTH_SCHEMA_NAME=auth -f "$f"
done

echo "[migrate] applying dev setup (plans, encryption key)..."
"${PSQL[@]}" -f /dev-setup.sql

echo "[migrate] done"
