# Rules for working with code

- Be brief and concise. Avoid unnecessary words.
- Before modifying a file — read it.
- Do not add features, refactoring, or improvements beyond what was requested.
- Do not rewrite or delete tests without an explicit request.
- Do not add comments or docstrings to code that hasn't been changed.
- Do not add tombstone comments explaining why some code was deleted.
- When adding new env variables to `.env` — update `.env.example`.
- For any question (not an explicit command), give an answer but do not make changes. Ask for consent to make changes explicitly.
- When asked to do something and no previous plan exist, first describe the solutions
- Suggest covering new code with tests. Always show names of tests and their files.
- Name new tests according to the behavior being tested, not the change requested in prompt, or updated details of implementation.
- Before suggesting new tests, think if existing tests already cover the behavior.
- After changing runtime behaviour, run relevant rests.
- If you encounter some failing tests that feel unrelated to your changes, stop, explain to the user and ask if we should ignore them or fix them.
- If you need to use some common tool but it is not installed do not jump to using ineficient workarounds, ask the user first if tools can be installed.
- If running your current task requires Docker and it is not available, notify user of the problem and stop.
- When you explain or show some existing code always include relative path to file with line numbers.
- If comment you write is longer than couple of sentences, think about refactoring code to make comment unnecessary.
- For any substantial work create TODO/Task list and follow it step by step. Pertain TODO on compaction. Do not replace global TODO when doing a single task from it with the task-scoped entries.
- Whan you are asked to post github comments on user's behalf, state clearly that you are an AI agent and name what model are you using.

# Engineering Writing

Apply these rules to code comments, documentation, PR descriptions, PR comments, and changelogs.

- Write short declarative sentences.
- Use active voice.
- Express one idea per sentence.
- Use plain terms from the relevant domain.
- Prefer common verbs such as check, run, send, match, fail, and return.
- Avoid metaphors, aphorisms, and invented abstractions.
- State conditions directly: "When X occurs, do Y."
- State prohibitions directly: "A must not do B."
- Write recommendations and instructions in the imperative mood.
- Use the same term for the same thing throughout a document.
- Define an unfamiliar term when you first use it.
- Do not invent shorthand for a defined term.
- Avoid rhetorical devices, including parallelism for effect and compressed phrasing.
- Do not write phrases for quotation or emphasis.
- Use em dashes only to introduce enumerations.
- Rewrite any sentence that sounds clever in plainer language.
