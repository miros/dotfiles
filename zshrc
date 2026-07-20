# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

CASE_SENSITIVE="true"
HIST_STAMPS="yyyy-mm-dd"

plugins=(git history macos pj)

source $ZSH/oh-my-zsh.sh

local ret_status="%(?:%{$fg_bold[green]%}>:%{$fg_bold[red]%}>)"

# %{$fg[red]%}%n%{$reset_color%}@%{$fg[green]%}%m%{$reset_color%}:

function prompt_path() {
  local path
  local segment
  local result=""
  local -a segments

  if [[ "$PWD" == "$HOME" ]]; then
    path="~"
  elif [[ "$PWD" == "$HOME"/* ]]; then
    path="~${PWD#$HOME}"
  else
    path="$PWD"
  fi

  segments=("${(@s:/:)path}")
  [[ "$path" == /* ]] && result="/"
  for segment in "${segments[@]}"; do
    if [[ -n "$result" && "$result" != */ ]]; then
      result+="/"
    fi
    if (( ${#segment} > 15 )); then
      result+="${segment[1,15]}*"
    else
      result+="$segment"
    fi
  done

  print -r -- "$result"
}

PROMPT='%{$fg[white]%}$(prompt_path)%{$reset_color%}%25>…>$(git_prompt_info)%>>$(git_remote_status) ${ret_status}%{$reset_color%}'

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
alias git-rebase-main='git co main && git pull && git co - && git rebase main'
alias git-rebase-master='git co master && git pull && git co - && git rebase master'

alias k='kubectl'

alias p="pnpm"

alias cat='bat --paging=never'
alias ls='eza --group-directories-first'

alias be='bundle exec'

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

[ -f ~/.zsh_local ] && source ~/.zsh_local

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
