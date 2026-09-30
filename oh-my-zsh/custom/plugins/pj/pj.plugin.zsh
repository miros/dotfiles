pj() {
  local history_file="${XDG_STATE_HOME:-$HOME/.local/state}/pj/recent"
  local project selected

  if (( $# == 0 )); then
    if ! command -v fzf >/dev/null 2>&1; then
      print -u2 'pj requires fzf for interactive project selection'
      return 1
    fi

    local -a projects visits ordered
    local -A seen
    local i
    projects=("$PROJECTS"/*(N-/))
    if (( $#projects == 0 )); then
      print -u2 'pj found no projects'
      return 1
    fi

    if [[ -f "$history_file" ]]; then
      while IFS= read -r project; do
        visits+=("$project")
      done < "$history_file"
    fi

    for (( i = $#visits; i >= 1; i-- )); do
      project=${visits[i]}
      if [[ -d "$PROJECTS/$project" && -z ${seen[$project]-} ]]; then
        ordered+=("$project")
        seen[$project]=1
      fi
    done

    for project in "${projects[@]}"; do
      project=${project:t}
      if [[ -z ${seen[$project]-} ]]; then
        ordered+=("$project")
      fi
    done

    selected=$(printf '%s\n' "${ordered[@]}" | fzf --no-sort) || return
    [[ -n "$selected" ]] || return 1
    cd -- "$PROJECTS/$selected" || return
  else
    cd -- "$PROJECTS/$1" || return
    selected=${1%%/*}
    [[ -d "$PROJECTS/$selected" ]] || return 0
  fi

  mkdir -p -- "${history_file:h}" || return 0
  print -r -- "$selected" >> "$history_file" || return 0

  if (( $(wc -l < "$history_file") > 1000 )); then
    local recent_tmp
    recent_tmp=$(mktemp "${history_file}.XXXXXX") || return 0
    tail -n 500 "$history_file" > "$recent_tmp" && mv -f -- "$recent_tmp" "$history_file" || rm -f -- "$recent_tmp"
  fi
  return 0
}
_pj() { _files -W $PROJECTS -/; }
compdef _pj pj
