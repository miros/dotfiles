#!/bin/bash
set -e

sudo yum -y groupinstall 'Development Tools' && sudo yum -y install curl git python-setuptools ruby zsh

. ~/.dotfiles/linux.sh