set nocompatible              " be iMproved
filetype off                  " required!

set rtp+=~/.vim/bundle/Vundle.vim/
call vundle#rc()

" let Vundle manage Vundle
" required!
Bundle 'gmarik/vundle'

Bundle 'tpope/vim-fugitive'
Bundle 'rosstimson/scala-vim-support'
Bundle 'Xuyuanp/git-nerdtree'
Bundle 'mileszs/ack.vim'
Bundle 'bling/vim-airline'
Bundle 'corntrace/bufexplorer'
Bundle 'vim-scripts/VimClojure'
Bundle 'mattn/codepad-vim'
Bundle 'mattn/webapi-vim'
Bundle 'mattn/gist-vim'
Bundle 'tpope/vim-rails'
Bundle 'vim-scripts/taglist.vim'
Bundle 'Keithbsmiley/rspec.vim'
Bundle 'terryma/vim-multiple-cursors'
Bundle 'miros/vimfiles'
Bundle 'ingydotnet/yaml-vim'
Bundle 'scrooloose/nerdcommenter'
Bundle 'motus/pig.vim'
Bundle 'elixir-lang/vim-elixir'

filetype plugin indent on     " required!
