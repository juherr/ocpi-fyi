#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish_pr.sh [options]

Push the current branch, wait for GitHub to observe it, and create a pull request.

Options:
  --base <branch>      Base branch (default: main).
  --title <title>      Pull request title.
  --body-file <path>   Pull request body file.
  --draft              Create a draft pull request.
  --fill               Fill title and body from commits (default without title/body).
  -h, --help           Show this help.
EOF
}

base="main"
title=""
body_file=""
draft=false
fill=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      base="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --body-file)
      body_file="${2:-}"
      shift 2
      ;;
    --draft)
      draft=true
      shift
      ;;
    --fill)
      fill=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if { [ -n "${title}" ] && [ -z "${body_file}" ]; } || { [ -z "${title}" ] && [ -n "${body_file}" ]; }; then
  echo "ERROR: --title and --body-file must be provided together." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not installed." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not authenticated. Run gh auth login." >&2
  exit 1
fi
if [ -n "$(git status --short)" ]; then
  echo "ERROR: commit or stash worktree changes before publishing." >&2
  git status --short >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [ -z "${branch}" ]; then
  echo "ERROR: cannot publish from a detached HEAD." >&2
  exit 1
fi
if [ "${branch}" = "${base}" ]; then
  echo "ERROR: current branch and base branch are both ${base}." >&2
  exit 1
fi
if [ -n "${body_file}" ] && [ ! -f "${body_file}" ]; then
  echo "ERROR: pull request body file not found: ${body_file}" >&2
  exit 1
fi

echo "Pushing ${branch} to origin..."
git push --set-upstream origin "HEAD:${branch}"

repo="$(gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq .nameWithOwner)"
encoded_branch="$(node -p 'encodeURIComponent(process.argv[1])' "${branch}")"
encoded_base="$(node -p 'encodeURIComponent(process.argv[1])' "${base}")"
remote_sha="$(git rev-parse HEAD)"

echo "Waiting for GitHub to observe ${branch} at ${remote_sha:0:12}..."
visible=false
for attempt in {1..30}; do
  observed_sha="$(gh api "repos/${repo}/git/ref/heads/${encoded_branch}" --jq .object.sha 2>/dev/null || true)"
  if [ "${observed_sha}" = "${remote_sha}" ]; then
    visible=true
    break
  fi
  sleep 2
done
if [ "${visible}" != true ]; then
  echo "ERROR: GitHub did not expose the pushed branch within 60 seconds." >&2
  exit 1
fi

ahead_by="$(gh api "repos/${repo}/compare/${encoded_base}...${encoded_branch}" --jq .ahead_by)"
if [ "${ahead_by}" -lt 1 ]; then
  echo "ERROR: ${branch} has no commits ahead of ${base}." >&2
  exit 1
fi
echo "GitHub comparison: ${branch} is ${ahead_by} commit(s) ahead of ${base}."

existing_pr="$(gh pr list --repo "${repo}" --head "${branch}" --state open --limit 1 --json url --jq '.[0].url // empty')"
if [ -n "${existing_pr}" ]; then
  echo "Pull request already exists: ${existing_pr}"
  exit 0
fi

create_args=(--repo "${repo}" --base "${base}" --head "${branch}")
if [ -n "${title}" ]; then create_args+=(--title "${title}"); fi
if [ -n "${body_file}" ]; then create_args+=(--body-file "${body_file}"); fi
if [ "${draft}" = true ]; then create_args+=(--draft); fi
if [ "${fill}" = true ] || { [ -z "${title}" ] && [ -z "${body_file}" ]; }; then create_args+=(--fill); fi

for attempt in 1 2 3; do
  if pr_url="$(gh pr create "${create_args[@]}" 2>&1)"; then
    echo "Pull request created: ${pr_url}"
    exit 0
  fi
  if [ "${attempt}" -lt 3 ]; then
    delay=$((attempt * 3))
    echo "GitHub has not accepted the pull request yet; retrying in ${delay}s..." >&2
    sleep "${delay}"
  fi
done

echo "ERROR: failed to create pull request after 3 attempts." >&2
echo "${pr_url}" >&2
exit 1
