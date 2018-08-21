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

# projects
mkdir -p $HOME/pjs
echo 'export PROJECTS=$HOME/pjs' >> ~/.zsh_local

