---
description: Rebase onto the latest default branch and show meaningful conflict decisions
agent: build
subagent: false
---

Rebase the current Git branch using the helper script. Resume an existing rebase.

1. Run `bash "$HOME/.dotfiles/bin/rebase-main" start`.
2. Follow the reported status:
   - `completed`: finish with steps 7–9. Do not run checks if no conflicts occurred.
   - `error`: report the failure and stop. Do not retry with different Git options.
   - `conflicts`: resolve the listed files while preserving the intent of both sides.
3. Ask the user when the correct resolution cannot be inferred safely.
4. Stage only files you resolved. Do not use `git add .` or `git add -A`.
5. Run `bash "$HOME/.dotfiles/bin/rebase-main" continue`.
6. Repeat until completion or error.
7. Run relevant checks only if conflicts occurred and were resolved.
8. Invoke `show-me` only for choices between incompatible business intentions
   or code designs. Summarize only those choices.
9. Do not invoke `show-me` for mechanical resolutions, including keeping both changes.

Do not automatically stash, skip commits, abort the rebase, or push.
