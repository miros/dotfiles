set shell=bash

set nocompatible              " be iMproved
filetype off                  " required!

set rtp+=~/.vim/bundle/Vundle.vim/
call vundle#rc()

" let Vundle manage Vundle
" required!
Bundle 'gmarik/vundle'

" Lang support
Plugin 'rosstimson/scala-vim-support'
Plugin 'vim-scripts/VimClojure'
Plugin 'ingydotnet/yaml-vim'
Plugin 'motus/pig.vim'
Plugin 'elixir-lang/vim-elixir'
Plugin 'lambdatoast/elm.vim'
Plugin 'evanmiller/nginx-vim-syntax'
Plugin 'fatih/vim-go'

Plugin 'editorconfig/editorconfig-vim'

" Framework support

Plugin 'tpope/vim-rails'
Plugin 'Keithbsmiley/rspec.vim'

" Search helpers

Plugin 'dyng/ctrlsf.vim'
Plugin 'mileszs/ack.vim'
Plugin 'junegunn/fzf'
Plugin 'junegunn/fzf.vim'

" Common goodies

Plugin 'corntrace/bufexplorer'
Plugin 'Xuyuanp/git-nerdtree'
Plugin 'bling/vim-airline'
Plugin 'terryma/vim-multiple-cursors'
Plugin 'tpope/vim-fugitive'
Plugin 'scrooloose/nerdcommenter'

" Custom configs
Plugin 'miros/vimfiles'

call vundle#end()            " required
filetype plugin indent on    " required

if filereadable(glob("~/.vimrc.local"))
    source ~/.vimrc.local
endif
