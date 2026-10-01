---
description: Rebase onto the latest default branch and show meaningful conflict decisions
agent: build
subagent: false
---

Rebase the current Git branch onto the latest default branch of its tracking remote.

- Ensure the working tree is clean.
- Determine the tracking remote. Fall back to `origin` when unambiguous.
- Fetch the remote and detect its default branch.
- Rebase the current branch onto the fetched default branch.
- Resolve conflicts while preserving the intent of both sides.
- Ask the user only when the correct resolution cannot be inferred safely.
- Continue until the rebase completes.
- Run relevant checks only if conflicts were resolved.
- If the rebase completes without conflicts, do not run tests or other checks.
- Invoke `show-me` only when conflict resolution required choosing between incompatible business intentions or code designs.
- Summarize only those choices.
- Do not invoke `show-me` when all conflicts were resolved mechanically, including by keeping both changes.
