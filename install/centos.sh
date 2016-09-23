#!/bin/bash
set -e

sudo yum -y groupinstall 'Development Tools'
sudo yum -y install curl git python-setuptools ruby zsh vim mc git ctags screen