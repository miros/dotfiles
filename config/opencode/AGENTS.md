# Code Working Rules

- Before modifying a file — read it.
- Do not add features, refactoring, or improvements beyond what was requested.
- Do not rewrite or delete tests without an explicit request.
- Do not add comments or docstrings to code that hasn't been changed.
- Do not add backwards-compatibility shims — just change the code.
- When adding new env variables to `.env` — update `.env.example`.
- For any question, give an answer but do not make changes. Ask for consent to make changes explicitly.
- When asked to do something, first describe the solution and ask for consent, then do it.
- Try to avoid workarounds — do everything consistently.
- After all changes, run the tests.
- Suggest covering new code with tests.
- Save all tasks involving code changes or new functionality for history in the the following folder: `~/.opencode/task_history/NAME_OF_THE_CURRENT_PROJECT/` where NAME_OF_THE_CURRENT_PROJECT is the name of a folder you are currently working in. Use `.md` files with the naming convention `xxxx. Name.md`, where `xxxx` is a four-digit sequence number with leading zeros and `Name` is a brief task description.

### Task File Format:
---
description: Task description
---

Task body
(Use wording as close as possible to the original user request.)
