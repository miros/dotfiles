#!/usr/bin/env zsh

set -e

compdef() { :; }
source "${0:A:h:h}/oh-my-zsh/custom/plugins/pj/pj.plugin.zsh"

test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
export PROJECTS="$test_root/projects"
export XDG_STATE_HOME="$test_root/state"
mkdir -p "$PROJECTS/alpha" "$PROJECTS/beta" "$PROJECTS/space name"

fzf() {
  print -r -- "$*" > "$test_root/fzf-args"
  cat > "$test_root/candidates"
  [[ "${FZF_CANCEL:-}" != 1 ]] || return 1
  print -r -- "$FZF_SELECT"
}

assert_equal() {
  if [[ "$1" != "$2" ]]; then
    print -u2 "Expected: ${(q)2}"
    print -u2 "Actual:   ${(q)1}"
    return 1
  fi
}

test_shows_projects_in_recent_visit_order() {
  FZF_SELECT=alpha
  pj
  assert_equal "$(< "$test_root/candidates")" $'alpha\nbeta\nspace name'
  assert_equal "$(< "$test_root/fzf-args")" '--no-sort'

  pj 'space name'
  pj beta
  pj 'space name'
  pj
  assert_equal "$(< "$test_root/candidates")" $'space name\nbeta\nalpha'
}

test_changes_to_named_project() {
  pj beta
  assert_equal "$PWD" "$PROJECTS/beta"
  assert_equal "$(tail -n 1 "$XDG_STATE_HOME/pj/recent")" beta
}

test_preserves_directory_when_selection_is_cancelled() {
  local previous_dir=$PWD
  local previous_history=$(< "$XDG_STATE_HOME/pj/recent")
  FZF_CANCEL=1
  if pj; then
    print -u2 'Cancelled selection succeeded unexpectedly'
    return 1
  fi
  unset FZF_CANCEL
  assert_equal "$PWD" "$previous_dir"
  assert_equal "$(< "$XDG_STATE_HOME/pj/recent")" "$previous_history"
}

test_limits_visit_history() {
  { repeat 1000 print -r -- beta } > "$XDG_STATE_HOME/pj/recent"
  pj alpha
  assert_equal "$(wc -l < "$XDG_STATE_HOME/pj/recent" | tr -d ' ')" 500
  assert_equal "$(tail -n 1 "$XDG_STATE_HOME/pj/recent")" alpha
}

test_shows_projects_in_recent_visit_order
test_changes_to_named_project
test_preserves_directory_when_selection_is_cancelled
test_limits_visit_history
print 'pj tests passed'
