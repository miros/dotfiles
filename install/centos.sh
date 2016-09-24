#!/bin/bash
set -e

sudo yum -y groupinstall 'Development Tools'
sudo yum -y install \
  zsh \
  curl \
  git \
  vim \
  mc \
  screen \
  tmux \
  ruby
