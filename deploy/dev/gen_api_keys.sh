#!/usr/bin/env bash
# Run once before starting Api. Key generation script for local development.
set -euo pipefail

KEYS_DIR=/keys
API_KEYS_DIR=/api-keys
mkdir -p "$KEYS_DIR" "$API_KEYS_DIR"

for key in access_token_private_key.pem \
  oidc_signing_private_key.pem oidc_provider_crypto_key oidc_code_hmac_key; do
  if [ -e "$KEYS_DIR/$key" ] && [ ! -f "$KEYS_DIR/$key" ]; then
    echo "[gen_api_keys] $KEYS_DIR/$key must be a regular file" >&2
    exit 1
  fi
done

if [ ! -s "$KEYS_DIR/access_token_private_key.pem" ]; then
  echo "[gen_api_keys] generating ed25519 access-token key..."
  openssl genpkey -algorithm ed25519 -out "$KEYS_DIR/access_token_private_key.pem"
else
  echo "[gen_api_keys] access-token key exists, skipping"
fi

if [ ! -s "$API_KEYS_DIR/secret_tink_keyset.json" ]; then
  echo "[gen_api_keys] generating tink AEAD keyset..."
  go run ./apps/api/cmd/api gen-secret-key | sed 's/^SECRET_TINK_KEYSET_JSON=//' > "$API_KEYS_DIR/secret_tink_keyset.json"
else
  echo "[gen_api_keys] tink keyset exists, skipping"
fi

if [ ! -s "$KEYS_DIR/oidc_signing_private_key.pem" ]; then
  echo "[gen_api_keys] generating OIDC RSA signing key..."
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$KEYS_DIR/oidc_signing_private_key.pem"
fi

for key in oidc_provider_crypto_key oidc_code_hmac_key; do
  if [ ! -s "$KEYS_DIR/$key" ]; then
    echo "[gen_api_keys] generating $key..."
    openssl rand -out "$KEYS_DIR/$key" 32
  fi
done

# API и auth работают под non-root (USER app) и монтируют /keys как ro — ключи должны
# быть читаемы любым UID. chmod безусловный, чтобы поправить и уже созданные файлы.
chmod 0644 "$KEYS_DIR/access_token_private_key.pem" "$API_KEYS_DIR/secret_tink_keyset.json" \
  "$KEYS_DIR/oidc_signing_private_key.pem" "$KEYS_DIR/oidc_provider_crypto_key" \
  "$KEYS_DIR/oidc_code_hmac_key"

echo "[gen_api_keys] keys ready in $KEYS_DIR"
