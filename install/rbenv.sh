# rbenv
RBENV_PATH=~/.rbenv
export PATH=$RBENV_PATH/bin:$PATH

git clone https://github.com/sstephenson/rbenv.git $RBENV_PATH
git clone https://github.com/sstephenson/ruby-build.git $RBENV_PATH/plugins/ruby-build

eval "$(rbenv init -)"

rbenv install 2.5.0
rbenv global 2.5.0
gem install bundler pry awesome_print
