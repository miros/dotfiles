#!/bin/bash
set -e

# linuxbrew
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install)"
PATH="$HOME/.linuxbrew/bin:$PATH"

echo 'export PATH="$HOME/.linuxbrew/bin:$PATH"' >> ~/.bash_profile
echo 'export MANPATH="$HOME/.linuxbrew/share/man:$MANPATH"' >>~/.bash_profile
echo 'export INFOPATH="$HOME/.linuxbrew/share/info:$INFOPATH"' >>~/.bash_profile

echo 'export PATH="$HOME/.linuxbrew/bin:$PATH"' >> ~/.zshrc
echo 'export MANPATH="$HOME/.linuxbrew/share/man:$MANPATH"' >>~/.zshrc
echo 'export INFOPATH="$HOME/.linuxbrew/share/info:$INFOPATH"' >>~/.zshrc

. ~/.dotfiles/install.sh