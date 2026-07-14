# Code Working Rules

- Before modifying a file — read it.
- Do not add features, refactoring, or improvements beyond what was requested.
- Do not rewrite or delete tests without an explicit request.
- Do not add comments or docstrings to code that hasn't been changed.
- Do not add tombstone comments explaining why some code was deleted.
- Do not add backwards-compatibility shims — just change the code.
- When adding new env variables to `.env` — update `.env.example`.
- For any question, give an answer but do not make changes. Ask for consent to make changes explicitly.
- When asked to do something, first describe the solution and ask for consent, then do it.
- Try to avoid workarounds — do everything consistently.
- After all changes, run the tests.
- Suggest covering new code with tests.
- If you encounter some failing tests that feel unrelated to your changes, stop, explain to the user and ask if we should ignore them or fix them.
- After initial plan creation, when user asks questions, answer them. If answer imply some changes to plan, cleanly present the changes and ask for permission to change the plan.
