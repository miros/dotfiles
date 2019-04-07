# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

CASE_SENSITIVE="true"
HIST_STAMPS="yyyy-mm-dd"

plugins=(git history osx pj)

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
alias migrate='bundle exec rake db:migrate db:test:clone_structure'
alias reset_test_db='RAILS_ENV=test bundle exec rake db:migrate:reset'
alias bopen='EDITOR=subl bundle open'

alias rc='rebar compile'
alias rt='rebar eunit skip_deps=true'

alias hfs='hadoop fs'

# log queries
alias psql='psql -eL /tmp/psql.log'

# docker
alias docker_gc_containers='docker rm `docker ps --no-trunc -aq`'
alias docker_gc_images='docker images -q --filter "dangling=true" | xargs docker rmi'

alias notify_me='terminal-notifier -message "Task Done"'

alias vssh='vagrant ssh'

alias be='bundle exec'

alias mixc='mix compile'

alias git-amend-f='git add . && git commit --amend --no-edit && git push -f'

alias start-proxy='/usr/local/opt/squid/sbin/squid -N -d 1'

alias pbcopy='xclip -selection clipboard'
alias pbpaste='xclip -selection clipboard -o'

PATH=:/usr/local/bin:$PATH # for homebrew
PATH=$PATH:$HOME/bin

if [ -d $HOME/.rbenv ]; then
  export PATH=$HOME/.rbenv/bin:$PATH
  eval "$(rbenv init -)"
fi

export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

if [ -d /usr/libexec/java_home ]; then
  export JAVA_HOME=$(/usr/libexec/java_home -v 1.8)
  source ${HOME}/scripts/colorize_mvn
fi

export FZF_CTRL_T_COMMAND="command find -L . \\( -path './\\.*' -o -fstype 'dev' -o -fstype 'proc' \\) -prune \
    -o -type f -print \
    -o -type d -print \
    -o -type l -print 2> /dev/null | sed 1d | cut -b3-"

export ERL_AFLAGS="-kernel shell_history enabled -kernel shell_history_file_bytes 1024000"

[ -f ~/.zsh_local ] && source ~/.zsh_local

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
