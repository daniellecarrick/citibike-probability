#!/bin/sh
set -e

export PORT=${PORT:-80}
export API_URL=${API_URL:-${VITE_API_URL:-}}
export MAPBOX_TOKEN=${MAPBOX_TOKEN:-${VITE_MAPBOX_TOKEN:-}}

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  API_URL: "${API_URL}",
  MAPBOX_TOKEN: "${MAPBOX_TOKEN}"
};
EOF

if [ -n "$BACKEND_URL" ]; then
  # Ensure scheme is present — Railway internal hostnames arrive without one
  case "$BACKEND_URL" in
    http://*|https://*) ;;
    *) BACKEND_URL="http://$BACKEND_URL" ;;
  esac
  export BACKEND_URL
  BACKEND_HOST=$(echo "$BACKEND_URL" | sed 's|https\?://||' | cut -d/ -f1)
  export BACKEND_HOST
  envsubst '$PORT $BACKEND_URL $BACKEND_HOST' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
else
  # No backend configured — serve static files only
  envsubst '$PORT' < /etc/nginx/nginx-static.conf.template > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
