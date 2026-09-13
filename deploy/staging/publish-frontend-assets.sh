#!/usr/bin/env bash
set -Eeuo pipefail

if (($# != 2)); then
  printf 'usage: %s SOURCE_ASSETS_DIR DESTINATION_ASSETS_DIR\n' "$0" >&2
  exit 64
fi

source_assets_dir="$1"
destination_assets_dir="$2"

refuse_unsafe_absolute_directory_path() {
  local destination_path="$1"
  local current_path=""
  local component
  local -a components

  if [[ "$destination_path" != /* || "$destination_path" == "/" ]]; then
    printf 'frontend asset destination must be an absolute non-root path: %s\n' "$destination_path" >&2
    exit 65
  fi

  IFS='/' read -r -a components <<<"${destination_path#/}"
  for component in "${components[@]}"; do
    if [[ -z "$component" ]]; then
      continue
    fi
    if [[ "$component" == "." || "$component" == ".." ]]; then
      printf 'frontend asset destination contains an unsafe path component: %s\n' "$destination_path" >&2
      exit 65
    fi
    current_path="$current_path/$component"
    if [[ -L "$current_path" ]]; then
      printf 'refusing symbolic link in frontend asset destination: %s\n' "$current_path" >&2
      exit 65
    fi
    if [[ -e "$current_path" && ! -d "$current_path" ]]; then
      printf 'frontend asset destination is not a directory: %s\n' "$current_path" >&2
      exit 65
    fi
  done
}

refuse_unsafe_destination_parent() {
  local destination_path="$1"
  local relative_path="${destination_path#"$destination_assets_dir"}"
  local current_path="$destination_assets_dir"
  local component
  local -a components

  if [[ "$relative_path" == "$destination_path" ]]; then
    printf 'frontend asset destination escaped its root: %s\n' "$destination_path" >&2
    exit 65
  fi
  if [[ -z "$relative_path" ]]; then
    return
  fi

  IFS='/' read -r -a components <<<"${relative_path#/}"
  for component in "${components[@]}"; do
    if [[ -z "$component" ]]; then
      continue
    fi
    current_path="$current_path/$component"
    if [[ -L "$current_path" ]]; then
      printf 'refusing symbolic link in frontend asset destination: %s\n' "$current_path" >&2
      exit 65
    fi
    if [[ -e "$current_path" && ! -d "$current_path" ]]; then
      printf 'frontend asset destination parent is not a directory: %s\n' "$current_path" >&2
      exit 65
    fi
  done
}

if [[ ! -d "$source_assets_dir" ]]; then
  printf 'frontend asset source is not a directory: %s\n' "$source_assets_dir" >&2
  exit 66
fi

if [[ -n "$(find "$source_assets_dir" -type l -print -quit)" ]]; then
  printf 'frontend asset source contains a symbolic link\n' >&2
  exit 65
fi

refuse_unsafe_absolute_directory_path "$destination_assets_dir"
install -d -m 0755 "$destination_assets_dir"

while IFS= read -r -d '' source_asset; do
  relative_path="${source_asset#"$source_assets_dir"/}"
  destination_asset="$destination_assets_dir/$relative_path"

  if [[ -e "$destination_asset" || -L "$destination_asset" ]]; then
    if [[ ! -f "$destination_asset" || -L "$destination_asset" ]] || ! cmp --silent "$source_asset" "$destination_asset"; then
      printf 'refusing frontend asset hash collision: %s\n' "$relative_path" >&2
      exit 65
    fi
    continue
  fi

  destination_parent="$(dirname "$destination_asset")"
  refuse_unsafe_destination_parent "$destination_parent"
  install -d -m 0755 "$destination_parent"
  install -m 0644 "$source_asset" "$destination_asset"
done < <(find "$source_assets_dir" -type f -print0)
