# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

CASE_SENSITIVE="true"
HIST_STAMPS="yyyy-mm-dd"

plugins=(git history macos pj)

source $ZSH/oh-my-zsh.sh

local ret_status="%(?:%{$fg_bold[green]%}>:%{$fg_bold[red]%}>)"

PROMPT='%{$fg[white]%}%33>...>%1~%>>%{$reset_color%}%25>…>$(git_prompt_info)%>>$(git_remote_status) ${ret_status}%{$reset_color%}'

ZSH_THEME_GIT_PROMPT_PREFIX=" %{$fg[cyan]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%}"
ZSH_THEME_GIT_PROMPT_DIRTY=" %{$fg_bold[red]%}*"

ZSH_THEME_GIT_PROMPT_BEHIND_REMOTE=" %{$fg[yellow]%}B%{$reset_color%}"
ZSH_THEME_GIT_PROMPT_AHEAD_REMOTE=" %{$fg[yellow]%}A%{$reset_color%}"
ZSH_THEME_GIT_PROMPT_DIVERGED_REMOTE=" %{$fg_bold[red]%}D%{$reset_color%}"

export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

bindkey \^U backward-kill-line

unsetopt auto_name_dirs

export EDITOR=vim
alias v="vim"

export PAGER="bat -p"
export LESS="--mouse --wheel-lines=3 -R -Q"
export DELTA_PAGER="less -RF"

alias gr='grep --color=auto'
alias g='grep --color=auto'
alias ll='ls -laGh'

alias rake='noglob rake'

# log queries
alias psql='psql -eL /tmp/psql.log'

# docker
alias docker_gc_containers='docker rm `docker ps --no-trunc -aq`'
alias docker_gc_images='docker images -q --filter "dangling=true" | xargs docker rmi'

alias notify_me='terminal-notifier -message "Task Done"'

alias git-amend-f='git add . && git commit --amend --no-edit && git push --force-with-lease'

alias k='kubectl'

alias p="pnpm"

alias cat='bat --paging=never'
alias ls='eza --group-directories-first'

alias be='bundle exec'

alias oc-fork='opencode -c --fork'

oc-plan() {
  OPENCODE_CONFIG_CONTENT='{"plugin":[["@plannotator/opencode@latest",{"workflow":"plan-agent"}]]}' \
    command opencode "$@"
}

PATH=:/usr/local/bin:$PATH # for homebrew
PATH=$PATH:$HOME/bin

export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

export FZF_CTRL_T_COMMAND="command find -L . \\( -path './\\.*' -o -fstype 'dev' -o -fstype 'proc' \\) -prune \
    -o -type f -print \
    -o -type d -print \
    -o -type l -print 2> /dev/null | sed 1d | cut -b3-"

export ERL_AFLAGS="-kernel shell_history enabled -kernel shell_history_file_bytes 1024000"

export PATH="$HOME/.local/bin:$PATH"

git-rebase-main() {
  git fetch origin || return

  local branch
  branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD) || {
    echo "Cannot determine origin's default branch" >&2
    return 1
  }

  git rebase "$branch"
}

git-cd() {
  local branch="$1"
  if [[ -z "$branch" ]]; then
    echo "Usage: git-cd <branch>" >&2
    return 1
  fi

  local wt_path
  wt_path=$(git worktree list --porcelain | awk -v branch="refs/heads/$branch" '
    /^worktree / { wt = substr($0, 10) }
    $1 == "branch" && $2 == branch { print wt; exit }
  ')

  if [[ -n "$wt_path" ]]; then
    cd "$wt_path"
  else
    git checkout "$branch"
  fi
}

[ -f ~/.zsh_local ] && source ~/.zsh_local

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
