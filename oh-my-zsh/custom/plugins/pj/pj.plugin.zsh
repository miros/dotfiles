pj() { cd $PROJECTS/$1; }
_pj() { _files -W $PROJECTS -/; }
compdef _pj pj
