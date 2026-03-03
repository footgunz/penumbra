#!/usr/bin/env bash
# Wraps air so that signal handling and terminal cleanup work properly.
# Air doesn't kill its child process or restore the tty on crash/exit.
cleanup() {
  trap - EXIT INT TERM HUP
  stty sane 2>/dev/null
  kill 0 2>/dev/null
}
trap cleanup INT TERM HUP EXIT
exec go run github.com/air-verse/air
