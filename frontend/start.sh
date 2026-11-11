#!/bin/sh
# Container entrypoint: render the nginx config from the environment, then run nginx in the foreground.
set -eu

export BACKEND_HOST="${BACKEND_HOST:-casual-bob-backend}"
export BACKEND_PORT="${BACKEND_PORT:-8080}"

# First nameserver in /etc/resolv.conf (cluster DNS on OpenShift), IPv6 in brackets
NGINX_RESOLVER="$(awk '$1 == "nameserver" { print ($2 ~ ":") ? "[" $2 "]" : $2; exit }' /etc/resolv.conf)"
export NGINX_RESOLVER

# Substitute only our variables so nginx's own $variables are kept
envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${NGINX_RESOLVER}' \
    < /opt/app-root/nginx.conf.template > /tmp/nginx.conf

exec nginx -e /dev/stderr -c /tmp/nginx.conf -g 'daemon off;'
