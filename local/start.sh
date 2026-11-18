#!/usr/bin/env sh
# Bharat Finance - Local Edition launcher (macOS / Linux). Uses Python 3.9+ already on your computer.
cd "$(dirname "$0")" || exit 1
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)'; then
    exec "$c" run.py "$@"
  fi
done
echo "Python 3.9+ was not found. Install it from https://www.python.org/downloads/ (or your package manager) and run this again."
exit 1
