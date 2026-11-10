#!/bin/sh
# Starts the catfacts image with its domain running and opens a bash prompt in the container.
# The container is stopped and removed when the shell exits.
#
#   ./shell.sh                         uses localhost/catfacts:dev
#   IMAGE=localhost/other:tag ./shell.sh
#
# CASUAL_LOG_PATH is set to a writable file in the shell, so 'casual' commands work, for example
#   casual domain --list-servers
set -eu

image="${IMAGE:-localhost/catfacts:dev}"
name="catfacts-shell-$$"

podman run -d --rm --platform linux/amd64 --name "$name" "$image" > /dev/null
trap 'podman stop -t 2 "$name" > /dev/null 2>&1 || true' EXIT INT TERM

# wait until the domain manager answers
tries=0
until podman exec -e CASUAL_LOG_PATH=/test/casual/cli.log "$name" casual domain --list-servers > /dev/null 2>&1
do
   tries=$((tries + 1))
   if [ "$tries" -ge 30 ]
   then
      echo "domain did not start, see: podman logs $name" >&2
      exit 1
   fi
   sleep 1
done

podman exec -it -e CASUAL_LOG_PATH=/test/casual/cli.log "$name" bash
