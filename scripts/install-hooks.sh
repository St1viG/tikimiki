#!/bin/sh
# Install the Gerrit commit-msg hook into the local clone.
#
# Why this exists:
#   Husky owns core.hooksPath (.husky/_), so git no longer runs .git/hooks/*
#   on its own. Our .husky/commit-msg shim chains to the Gerrit commit-msg hook
#   at "<git-common-dir>/hooks/commit-msg" (it appends the Change-Id trailer
#   required to push to refs/for/master). That Gerrit hook is per-clone and not
#   version-controlled, so a fresh clone is missing it and pushes get rejected.
#
#   This script copies the tracked hook (scripts/gerrit-commit-msg) into place.
#   It runs automatically from the root "prepare" script after husky, and is
#   safe to re-run.

set -eu

# Resolve paths relative to this script, so cwd doesn't matter.
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
src="$script_dir/gerrit-commit-msg"

if [ ! -f "$src" ]; then
  echo "install-hooks: source hook not found at $src" >&2
  exit 1
fi

# Not a git checkout (e.g. tarball install) -> nothing to do, don't fail.
common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
[ -n "$common_dir" ] || exit 0

hooks_dir="$common_dir/hooks"
mkdir -p "$hooks_dir"
dest="$hooks_dir/commit-msg"

# Only copy when missing or changed, to keep output quiet on repeat installs.
if ! cmp -s "$src" "$dest" 2>/dev/null; then
  cp "$src" "$dest"
  chmod +x "$dest"
  echo "install-hooks: installed Gerrit commit-msg hook -> $dest"
fi
