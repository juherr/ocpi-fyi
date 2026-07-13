#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

if [ -d .git ]; then
  npm run build:site
  exit 0
fi

if [ ! -f .git ]; then
  echo "ERROR: ${repo_root} is not a Git repository or worktree."
  exit 1
fi

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/ocpi-site-build.XXXXXX")"
clone_dir="${temporary_root}/repository"

cleanup() {
  if [ "${KEEP_WORKTREE_BUILD:-0}" = "1" ]; then
    echo "Temporary build retained at ${temporary_root}"
  else
    rm -rf "${temporary_root}"
  fi
}
trap cleanup EXIT

echo "Conductor worktree detected; building from a temporary standalone clone."
git clone --quiet --no-hardlinks "${repo_root}" "${clone_dir}"
git -C "${clone_dir}" checkout --quiet --detach HEAD

patch_file="${temporary_root}/worktree.patch"
git diff --binary HEAD > "${patch_file}"
if [ -s "${patch_file}" ]; then
  git -C "${clone_dir}" apply "${patch_file}"
fi

while IFS= read -r -d '' file; do
  mkdir -p "${clone_dir}/$(dirname "${file}")"
  cp -p "${repo_root}/${file}" "${clone_dir}/${file}"
done < <(git ls-files --others --exclude-standard -z)

dependencies_are_current=false
if [ -d "${repo_root}/node_modules" ] \
  && cmp -s "${repo_root}/package.json" "${clone_dir}/package.json" \
  && cmp -s "${repo_root}/package-lock.json" "${clone_dir}/package-lock.json" \
  && npm --prefix "${repo_root}" ls --depth=0 >/dev/null 2>&1; then
  dependencies_are_current=true
fi

if [ "${dependencies_are_current}" = true ]; then
  ln -s "${repo_root}/node_modules" "${clone_dir}/node_modules"
else
  npm --prefix "${clone_dir}" ci
fi

npm --prefix "${clone_dir}" run build:site

mkdir -p "${repo_root}/public"
rsync -a --delete "${clone_dir}/public/" "${repo_root}/public/"
echo "Site output copied to ${repo_root}/public"
