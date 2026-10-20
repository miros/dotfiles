#!/bin/bash
set -e

DOTFILES="$HOME/.dotfiles"

link() {
  local source="$DOTFILES/$1"
  local target="$2"

  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    echo "ok        $target"
    return
  fi
  if [[ -e "$target" && ! -L "$target" ]]; then
    mv "$target" "$target.backup"
    echo "backup    $target.backup"
  fi
  mkdir -p "$(dirname "$target")"
  ln -sfn "$source" "$target"
  echo "linked    $target -> $source"
}

# homebrew
if [[ ! -x /opt/homebrew/bin/brew ]]; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
eval "$(/opt/homebrew/bin/brew shellenv)"
brew bundle --file "$DOTFILES/Brewfile"

# oh-my-zsh
if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
  KEEP_ZSHRC=yes sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

# dotfiles
for name in zshrc gitconfig gitignore vimrc tmux.conf editorconfig fzf.zsh gemrc irbrc pryrc screenrc hushlogin tool-versions; do
  link "$name" "$HOME/.$name"
done
link agents "$HOME/.agents"
link oh-my-zsh/custom/plugins/pj "$HOME/.oh-my-zsh/custom/plugins/pj"

# vim
if [[ ! -f "$HOME/.vim/autoload/plug.vim" ]]; then
  curl -fLo "$HOME/.vim/autoload/plug.vim" --create-dirs \
    https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
fi
vim +PlugInstall +qall

# opencode
bun "$DOTFILES/install/opencode.ts"

# asdf
if ! asdf plugin list 2>/dev/null | grep -qx nodejs; then
  asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
fi
(cd "$HOME" && asdf install)

# projects
mkdir -p "$HOME/pjs"
