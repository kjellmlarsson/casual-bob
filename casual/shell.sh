#!/bin/sh
# Starts the catfacts image with its domain running, then either opens a bash prompt in the
# container or, with the argument 'catfact', calls the service and prints the fact.
# The container is stopped and removed when the script ends.
#
#   ./shell.sh                         bash prompt in the container
#   ./shell.sh catfact                 boot the domain, call catfacts/random once, print the fact
#   IMAGE=localhost/other:tag ./shell.sh
#
# CASUAL_LOG_PATH is set to a writable file in the container, so 'casual' commands work, for example
#   casual domain --list-servers
set -eu

mode="${1:-shell}"
case "$mode" in
   shell|catfact) ;;
   *) echo "usage: $0 [catfact]" >&2; exit 2 ;;
esac

image="${IMAGE:-localhost/catfacts:dev}"
name="catfacts-shell-$$"
log_path=/test/casual/cli.log

podman run -d --rm --platform linux/amd64 --name "$name" "$image" > /dev/null
trap 'podman stop -t 2 "$name" > /dev/null 2>&1 || true' EXIT INT TERM

# wait until the domain is up and the service is advertised
tries=0
until podman exec -e CASUAL_LOG_PATH=$log_path "$name" casual service --list-services 2> /dev/null | grep -aq 'catfacts/random'
do
   tries=$((tries + 1))
   if [ "$tries" -ge 60 ]
   then
      echo "domain did not start, see: podman logs $name" >&2
      exit 1
   fi
   sleep 1
done

case "$mode" in
   catfact)
      # the request buffer is ignored by the service, but casual call needs one: a small X_OCTET buffer
      podman exec -e CASUAL_LOG_PATH=$log_path "$name" sh -c \
         'echo x | casual buffer --compose X_OCTET/ | casual call --service catfacts/random | casual buffer --extract; echo'
      ;;
   *)
      podman exec -it -e CASUAL_LOG_PATH=$log_path "$name" bash
      ;;
esac
