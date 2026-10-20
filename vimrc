set shell=bash

let mapleader=","

set rtp^=~/.dotfiles/vim

call plug#begin('~/.vim/plugged')

" Lang support
Plug 'elixir-editors/vim-elixir'
Plug 'fatih/vim-go'

" Search helpers
Plug 'dyng/ctrlsf.vim'
Plug 'mileszs/ack.vim'
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'

" Common goodies
Plug 'jlanzarotta/bufexplorer'
Plug 'preservim/nerdtree'
Plug 'vim-airline/vim-airline'

call plug#end()

packadd! editorconfig
packadd! comment

if filereadable(glob("~/.vimrc.local"))
    source ~/.vimrc.local
endif
