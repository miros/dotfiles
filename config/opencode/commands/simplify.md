---
description: Find code to remove or replace in the current changes
---

Simplify the uncommitted changes. When there are none, use the last commit. When the context below names another target, use that target.

Read the diff, the code it calls, and the code that calls it.

Check each piece of new code, including tests, against this order. Take the first option that works:

1. The task does not need the code. Delete it.
2. The repo already has code that does this. Use it and name its path.
3. The standard library or the platform does this. Use it.
4. An installed dependency does this. Use it.
5. Otherwise, keep the new code in its smallest readable form.

Also report:

- Abstractions with one implementation.
- Wrappers that only pass calls through.
- Options and config that nothing sets.
- New dependencies added for code that takes a few lines.
- Near-copies that must change together.
- Duplicated code that can be dried.
- Comments that repeat the code or run longer than three sentences.
- Tests that repeat the implementation instead of checking behavior.
- Test setup that an existing helper or fixture already does.

Rules:

- Report a finding only when you can name the lines and show the simpler replacement.
- Do not remove validation of external input, error handling that prevents data loss, or security checks.
- Do not report style preferences.
- Do not change code yet.

Output:

- Number the findings and sort them by lines saved, most first.
- For each finding, give the file and lines, the replacement, and the lines saved.
- End with the total lines that can be removed and one line naming what you did not check.
- When there is nothing to simplify, say "Nothing to simplify." and stop.
- Use Engineering Writing rules from AGENTS.md.

Then ask which findings to apply.

$ARGUMENTS
