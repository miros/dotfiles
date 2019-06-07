#!/bin/bash
set -e

sudo dnf install @development-tools

sudo dnf -y install \
  zsh \
  curl \
  git \
  vim \
  mc \
  screen \
  tmux \
  ruby \
  fzf \
  bat \
  fd

sudo dnf -y copr enable seeitcoming/rcm
sudo dnf install rcm

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






