#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# Runtime config injection.
#
# The Angular app reads window.RUNTIME_CONFIG (see src/app/shared/api-base-url.util.ts)
# and prefers it over the values baked in at build time. That means ONE image can
# be promoted from dev → qa → uat by changing environment variables only — no
# rebuild required.
#
# nginx runs every executable in /docker-entrypoint.d/ before starting, so this
# script regenerates assets/runtime-config.js on each container start.
# ──────────────────────────────────────────────────────────────────────────────
set -e

CONFIG_FILE="/usr/share/nginx/html/assets/runtime-config.js"

: "${API_BASE_URL:=/}"
: "${LOGIN_UI_URL:=/}"

cat > "$CONFIG_FILE" <<EOF
window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};
window.RUNTIME_CONFIG.diagnocareApiURL = "${API_BASE_URL}";
window.RUNTIME_CONFIG.loginUIUrl = "${LOGIN_UI_URL}";
EOF

echo "[runtime-config] diagnocareApiURL=${API_BASE_URL} loginUIUrl=${LOGIN_UI_URL}"
