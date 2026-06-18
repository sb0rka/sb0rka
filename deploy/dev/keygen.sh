#!/usr/bin/env bash
# Генерирует ключи для локального API (один раз, дальше переиспользует том).
# Ed25519 для подписи access-токенов + Tink AEAD keyset для шифрования секретов.
set -euo pipefail

KEYS_DIR=/keys
mkdir -p "$KEYS_DIR"

if [ ! -s "$KEYS_DIR/access_token_private_key.pem" ]; then
  echo "[keygen] generating ed25519 access-token key..."
  openssl genpkey -algorithm ed25519 -out "$KEYS_DIR/access_token_private_key.pem"
else
  echo "[keygen] access-token key exists, skipping"
fi

if [ ! -s "$KEYS_DIR/secret_tink_keyset.json" ]; then
  echo "[keygen] generating tink AEAD keyset..."
  go run ./apps/api/cmd/api gen-secret-key | sed 's/^SECRET_TINK_KEYSET_JSON=//' > "$KEYS_DIR/secret_tink_keyset.json"
else
  echo "[keygen] tink keyset exists, skipping"
fi

# API работает под non-root (USER app) и монтирует /keys как ro — ключи должны
# быть читаемы любым UID. chmod безусловный, чтобы поправить и уже созданные файлы.
chmod 0644 "$KEYS_DIR/access_token_private_key.pem" "$KEYS_DIR/secret_tink_keyset.json"

echo "[keygen] keys ready in $KEYS_DIR"
