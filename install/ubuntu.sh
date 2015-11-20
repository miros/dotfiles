#!/bin/bash
sudo apt-get install zsh
sh -c "$(wget https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)"

git clone https://github.com/VundleVim/Vundle.vim.git ~/.vim/bundle/Vundle.vim
vim +PluginInstall +qall

git clone https://github.com/sstephenson/rbenv.git ~/.rbenv
git clone https://github.com/sstephenson/ruby-build.git ~/.rbenv/plugins/ruby-build

rbenv install 2.2.3
gem install bundler pry awesome_print

wget https://thoughtbot.github.io/rcm/debs/rcm_1.3.0-1_all.deb
sudo dpkg -i rcm_1.3.0-1_all.deb

rcup -U .oh-my-zsh/custom/plugins/pj -U scripts -U bin -x install

echo 'export PROJECTS=$HOME/projects' > ~/.zsh_local