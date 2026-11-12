#!/usr/bin/env bash
# Fill missing Auth client secrets in the env file. Existing non-empty values are kept.
# Names match secret_env / attestation_secret_env in db/migrations/seed/011-initial_auth_clients.sql.
set -euo pipefail

env_file="${AUTH_CLIENT_SECRETS_ENV:-apps/auth/.env}"
mkdir -p "$(dirname "$env_file")"
if [ ! -f "$env_file" ]; then
  touch "$env_file"
fi

# A copied .env.sample may not end with a newline; don't glue the next assignment onto it.
if [ -s "$env_file" ] && [ "$(tail -c 1 "$env_file" | wc -l)" -eq 0 ]; then
  printf '\n' >> "$env_file"
fi

set_secret() {
  local name="$1"
  local current=""
  if grep -qE "^${name}=" "$env_file"; then
    current="$(grep -E "^${name}=" "$env_file" | tail -n 1 | cut -d= -f2-)"
    current="$(printf '%s' "$current" | tr -d '[:space:]"'"'"'')"
    if [ -n "$current" ]; then
      return 0
    fi
    local secret tmp
    secret="$(openssl rand -hex 32)"
    tmp="$(mktemp)"
    awk -v name="$name" -v secret="$secret" '
      $0 ~ "^" name "=" && !done { print name "=\"" secret "\""; done = 1; next }
      { print }
    ' "$env_file" > "$tmp"
    mv "$tmp" "$env_file"
    return 0
  fi
  printf '%s="%s"\n' "$name" "$(openssl rand -hex 32)" >> "$env_file"
}

set_secret SB0RKA_SOM_WEB_CLIENT_SECRET
set_secret SB0RKA_IR_WEB_CLIENT_SECRET
set_secret SB0RKA_SOM_WORKLOAD_CLIENT_SECRET
set_secret SB0RKA_SOM_ATTESTATION_SECRET
set_secret SB0RKA_IR_GATEWAY_CLIENT_SECRET

chmod 0600 "$env_file"
