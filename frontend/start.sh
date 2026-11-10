#!/bin/sh
# Container entrypoint: render the nginx config from the environment, then run nginx in the foreground.
set -eu

BACKEND_HOST="${BACKEND_HOST:-casual-bob-backend}"
BACKEND_PORT="${BACKEND_PORT:-8080}"

# First nameserver from /etc/resolv.conf (cluster DNS on OpenShift). IPv6 addresses need brackets.
NGINX_RESOLVER="$(awk '$1 == "nameserver" { print $2; exit }' /etc/resolv.conf)"
if [ -z "$NGINX_RESOLVER" ]; then
    echo "start.sh: no nameserver found in /etc/resolv.conf" >&2
    exit 1
fi
case "$NGINX_RESOLVER" in
    *:*) NGINX_RESOLVER="[$NGINX_RESOLVER]" ;;
esac

# nginx's resolver ignores the "search" list, so a short Service name does not resolve on its own.
# On Kubernetes, qualify it with the pod's namespace domain (<namespace>.svc.cluster.local).
case "$BACKEND_HOST" in
    *.*) ;;
    *)
        NAMESPACE_DOMAIN="$(awk '$1 == "search" { for (i = 2; i <= NF; i++) if ($i ~ /^[^.]+\.svc\.cluster\.local$/) { print $i; exit } }' /etc/resolv.conf)"
        if [ -n "$NAMESPACE_DOMAIN" ]; then
            BACKEND_HOST="$BACKEND_HOST.$NAMESPACE_DOMAIN"
        fi
        ;;
esac

export BACKEND_HOST BACKEND_PORT NGINX_RESOLVER

# Substitute only our variables so nginx's own $variables are kept
envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${NGINX_RESOLVER}' \
    < /opt/app-root/nginx.conf.template > /tmp/nginx.conf

# -e keeps nginx from trying to open its default error log under /var/log
exec nginx -e /dev/stderr -c /tmp/nginx.conf -g 'daemon off;'
