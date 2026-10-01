---
description: Check unresolved Copilot review comments
---

Read unresolved GitHub Copilot review comments on the pull request for the current branch.

- Use `gh api graphql` to read the pull request review threads.
- Keep only threads where `isResolved` is false.
- Keep only threads started by Copilot. The author login is `copilot-pull-request-reviewer`.

For each comment:

- Assess whether it is relevant.
- State its criticality.
- Identify the type of problem.
- Provide a short, descriptive title.
- Explain the problem in one to three sentences.
