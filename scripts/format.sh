#!/usr/bin/env bash
#
# Prettier over the files you actually changed.
#
# By default it only looks at files that differ from the last commit (staged +
# unstaged) plus untracked files — fast, and it won't flag a teammate's file you
# never touched. Flags:
#
#   -a, --all      run over the ENTIRE repo (respects .prettierignore)
#   -w, --write    fix files in place        (default action is --check)
#   -c, --check    only report, don't write  (the default)
#
# Used by the "format" / "format:check" package.json scripts. Extra flags pass
# straight through, e.g.  `pnpm format:check -a`  or  `pnpm format -a`.
#
# Autor: Stevan Gnjato (2023/0141)
set -euo pipefail

action="--check"
all=0
for arg in "$@"; do
  case "$arg" in
    -a | --all) all=1 ;;
    -w | --write) action="--write" ;;
    -c | --check) action="--check" ;;
  esac
done

# Whole repo — let prettier walk it with its own ignore rules.
if [ "$all" -eq 1 ]; then
  exec pnpm exec prettier "$action" .
fi

# Changed = tracked files that differ from HEAD (excluding deletions) + untracked.
changed=$(
  {
    git diff --name-only --diff-filter=d HEAD
    git ls-files --others --exclude-standard
  } | sort -u
)

if [ -z "$changed" ]; then
  echo "No changed files to format."
  exit 0
fi

# --ignore-unknown skips files prettier can't handle (images, .env, .sh, …) so a
# mixed changeset doesn't error. NUL-delimited to be safe with odd filenames.
printf '%s\n' "$changed" |
  tr '\n' '\0' |
  xargs -0 pnpm exec prettier --ignore-unknown "$action"
