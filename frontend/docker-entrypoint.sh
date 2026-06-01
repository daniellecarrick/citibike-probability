#!/bin/sh
set -e

export PORT=${PORT:-80}

if [ -n "$BACKEND_URL" ]; then
  # Ensure scheme is present — Railway internal hostnames arrive without one
  case "$BACKEND_URL" in
    http://*|https://*) ;;
    *) BACKEND_URL="http://$BACKEND_URL" ;;
  esac
  export BACKEND_URL
  envsubst '$PORT $BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
else
  # No backend configured — serve static files only
  envsubst '$PORT' < /etc/nginx/nginx-static.conf.template > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
