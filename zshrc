# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

CASE_SENSITIVE="true"
HIST_STAMPS="yyyy-mm-dd"

plugins=(git history macos pj)

source $ZSH/oh-my-zsh.sh

local ret_status="%(?:%{$fg_bold[green]%}>:%{$fg_bold[red]%}>)"
PROMPT='%{$fg[red]%}%n%{$reset_color%}@%{$fg[green]%}%m%{$reset_color%}:%{$fg[white]%}%(5~|%-3~/…/%1~|%4~)%{$reset_color%}$(git_prompt_info)$(git_remote_status) ${ret_status}%{$reset_color%}'

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

export PAGER=less
export LESS="-MQR"

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

alias pbcopy='xclip -selection clipboard'
alias pbpaste='xclip -selection clipboard -o'

alias k='kubectl'

alias docker='nerdctl'

PATH=:/usr/local/bin:$PATH # for homebrew
PATH=$PATH:$HOME/bin

if [ -d $HOME/.rbenv ]; then
  export PATH=$HOME/.rbenv/bin:$PATH
  eval "$(rbenv init -)"
fi

export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

# if [ -d /usr/libexec/java_home ]; then
#   export JAVA_HOME=$(/usr/libexec/java_home -v 1.8)
# fi

export FZF_CTRL_T_COMMAND="command find -L . \\( -path './\\.*' -o -fstype 'dev' -o -fstype 'proc' \\) -prune \
    -o -type f -print \
    -o -type d -print \
    -o -type l -print 2> /dev/null | sed 1d | cut -b3-"

export ERL_AFLAGS="-kernel shell_history enabled -kernel shell_history_file_bytes 1024000"

[ -f ~/.zsh_local ] && source ~/.zsh_local

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
