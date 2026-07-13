#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not installed."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not authenticated. Run gh auth login."
  exit 1
fi

branch="$(git branch --show-current)"
if [ -z "${branch}" ]; then
  echo "ERROR: cannot publish from a detached HEAD."
  exit 1
fi

echo "Branch: ${branch}"
configured_remote="$(git config --get "branch.${branch}.remote" || true)"
configured_merge="$(git config --get "branch.${branch}.merge" || true)"
if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"; then
  echo "Upstream: ${upstream}"
  git rev-list --left-right --count "${upstream}...HEAD" | awk '{ print "Remote delta: behind=" $1 ", ahead=" $2 }'
elif [ -n "${configured_remote}" ] && [ -n "${configured_merge}" ]; then
  configured_branch="${configured_merge#refs/heads/}"
  echo "Upstream: ${configured_remote}/${configured_branch} (missing or deleted)"
else
  echo "Upstream: not configured"
fi

if [ -n "$(git status --short)" ]; then
  echo "Worktree: modified"
  git status --short
else
  echo "Worktree: clean"
fi

pull_requests="$(gh pr list --head "${branch}" --state all --limit 1 --json number,url,state,title)"
node -e '
  const [pr] = JSON.parse(process.argv[1])
  if (!pr) {
    console.log("Pull request: none for the current branch")
    process.exit(0)
  }
  console.log(`Pull request: #${pr.number} [${pr.state}] ${pr.title}`)
  console.log(`URL: ${pr.url}`)
' "${pull_requests}"
