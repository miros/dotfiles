# General

- Be brief. Keep answers brief and scannable.
- For any substantial work create TODO/Task list and follow it step by step. Use todo tool. Use max 60 symbols for one entry. Keep the list up to date.
- When asked to do something and no previous plan exist, first describe the solution.
- At the end of the plan list separatly files that you will update and create (one per line). Skip if empty.
- For any question (not an explicit command) in the build mode, give an answer but do not make changes. Ask for consent to make changes explicitly.
- If you find yourself in the wrong project path (user started agent at wrong location), stop and notify user.

# Rules for working with code

- Do not add features, refactoring, or improvements beyond what was requested.
- When you explain or show some existing code always include relative path to file with line numbers.
- If running your current task requires Docker and it is not running, just start it (might be colima).
- When adding new env variables to `.env` — update `.env.example`.

## Comments

- Do not add comments or docstrings to code that hasn't been changed.
- Do not add tombstone comments explaining why some code was deleted.
- Do not write comments explaining rejected options.
- Do not write comments longer than 3 sentences. Intent should be expressed by correct symbol naming in code.
- Whan you are asked to post github comments on user's behalf, start the post by stating that your are AI agent and name what model are you using. Example: "AI agent here. I am MODE_NAME_AND_VERSION."

## Tests

- Suggest covering new code with tests. Always show names of tests and their files.
- Name new tests according to the behavior being tested, not the change requested in prompt, or updated details of implementation.
- Before suggesting new tests, check if existing tests already cover the behavior.
- Do not weite tautalogical tests that merely copy implementation.
- After changing runtime behaviour, run relevant rests.
- If you encounter some failing tests unrelated to your changes, stop, explain to the user and ask if we should ignore them or fix them.

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
