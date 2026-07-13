#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

redocly="${repo_root}/node_modules/.bin/redocly"
spectral="${repo_root}/node_modules/.bin/spectral"
openapi_generator="${repo_root}/node_modules/.bin/openapi-generator-cli"

for tool in "${redocly}" "${spectral}" "${openapi_generator}"; do
  if [ ! -x "${tool}" ]; then
    echo "ERROR: missing local OpenAPI tooling. Run npm ci first."
    exit 1
  fi
done

version_dirs=()
if [ "$#" -eq 0 ]; then
  version_dirs=(openapi/ocpi-*)
else
  for version in "$@"; do
    version="${version#ocpi-}"
    version_dirs+=("openapi/ocpi-${version}")
  done
fi

if [ ${#version_dirs[@]} -eq 0 ]; then
  echo "ERROR: no OpenAPI version directories found under openapi/ocpi-*"
  exit 1
fi

for version_dir in "${version_dirs[@]}"; do
  if [ ! -d "${version_dir}" ]; then
    echo "ERROR: OpenAPI version directory not found: ${version_dir}"
    exit 1
  fi

  top_level_files=("${version_dir}"/*.yaml)
  component_files=("${version_dir}"/shared/*.yaml "${version_dir}"/shared/schemas/*.yaml)
  all_files=("${top_level_files[@]}" "${component_files[@]}")
  if [ ${#all_files[@]} -eq 0 ]; then
    echo "WARNING: no YAML files found in ${version_dir}"
    continue
  fi

  module_files=()
  for file in "${top_level_files[@]}"; do
    if [ "$(basename "${file}")" != "openapi.yaml" ]; then
      module_files+=("${file}")
    fi
  done

  for file in "${all_files[@]}"; do
    echo "=== redocly lint ${file} ==="
    if [[ "${file}" == */shared/* ]]; then
      "${redocly}" lint --config redocly-components.yaml "${file}"
    else
      "${redocly}" lint --config redocly.yaml "${file}"
    fi
  done

  for file in "${module_files[@]}"; do
    echo "=== spectral lint ${file} ==="
    "${spectral}" lint --fail-severity=error "${file}"
  done

  for file in "${module_files[@]}"; do
    echo "=== openapi-generator-cli validate ${file} ==="
    "${openapi_generator}" validate -i "${file}"
  done
done
