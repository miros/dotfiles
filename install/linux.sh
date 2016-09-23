set -e

# linuxbrew
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install)"
PATH="$HOME/.linuxbrew/bin:$PATH"
echo 'export PATH="$HOME/.linuxbrew/bin:$PATH"' >> ~/.bash_profile

# brewtap
brew tap Homebrew/bundle
$(cd ~/.dotfiles && brew bundle)

# oh-my-zsh
sh -c "$(wget https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)"

# vim
git clone https://github.com/VundleVim/Vundle.vim.git ~/.vim/bundle/Vundle.vim
vim +PluginInstall +qall

# rbenv
$RBENV_PATH=~/.rbenv

git clone https://github.com/sstephenson/rbenv.git $RBENV_PATH
git clone https://github.com/sstephenson/ruby-build.git $RBENV_PATH/plugins/ruby-build

$RBENV_PATH/bin/rbenv install 2.3.1
$RBENV_PATH/bin/rbenv global 2.3.1
$RBENV_PATH/bin/gem install bundler pry awesome_print
