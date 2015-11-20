# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME="robbyrussell"

# Set to this to use case-sensitive completion
CASE_SENSITIVE="true"

# Comment this out to disable weekly auto-update checks
# DISABLE_AUTO_UPDATE="true"

# Uncomment following line if you want to disable colors in ls
# DISABLE_LS_COLORS="true"

# Uncomment following line if you want to disable autosetting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment following line if you want red dots to be displayed while waiting for completion
# COMPLETION_WAITING_DOTS="true"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Example format: plugins=(rails git textmate ruby lighthouse)
plugins=(git bundler pj osx)

source $ZSH/oh-my-zsh.sh

# Customize to your needs...

unsetopt auto_name_dirs

export EDITOR=vim

alias rake='noglob rake'

alias migrate='bundle exec rake db:migrate db:test:clone_structure'
alias reset_test_db='RAILS_ENV=test bundle exec rake db:migrate:reset'
alias bopen='EDITOR=subl bundle open'

alias rc='rebar compile'
alias rt='rebar eunit skip_deps=true'

alias gr='grep'

alias hfs='hadoop fs'

# log queries
alias psql='psql -eL /tmp/psql.log'

PATH=/usr/local/bin:$PATH # for homebrew
PATH=$PATH:$HOME/bin

export PATH=$HOME/.rbenv/bin:$PATH
eval "$(rbenv init -)"

export JAVA_HOME=$(/usr/libexec/java_home -v 1.7)
source ${HOME}/scripts/colorize_mvn

source ~/.zsh_local