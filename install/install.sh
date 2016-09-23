#!/bin/bash
set -e

# brewtap
brew tap Homebrew/bundle
(cd ~/.dotfiles && brew bundle -v)

# oh-my-zsh
sh -c "$(wget https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)"

[ -f ~/.zshrc.pre-oh-my-zsh ] && cat ~/.zshrc.pre-oh-my-zsh >> ~/.zsh_local

# link dotfiles
rcup -U .oh-my-zsh/custom/plugins/pj -U scripts -U bin -x install

# vim
git clone https://github.com/VundleVim/Vundle.vim.git ~/.vim/bundle/Vundle.vim
vim +PluginInstall +qall

# rbenv
RBENV_PATH=~/.rbenv
export PATH=$RBENV_PATH/bin:$PATH

git clone https://github.com/sstephenson/rbenv.git $RBENV_PATH
git clone https://github.com/sstephenson/ruby-build.git $RBENV_PATH/plugins/ruby-build

eval "$(rbenv init -)"

rbenv install 2.3.1
rbenv global 2.3.1
gem install bundler pry awesome_print

# projects
mkdir -p $HOME/projects
echo 'export PROJECTS=$HOME/projects' >> ~/.zsh_local

