#!/bin/bash
set -e

sudo yum groupinstall 'Development Tools' && sudo yum install curl git python-setuptools ruby

. ~/.dotfiles/linux.sh