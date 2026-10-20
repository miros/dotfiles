---
description: Check unresolved Copilot review comments
---

Read unresolved GitHub Copilot review comments on the pull request for the current branch.

- Use `gh api graphql` to read the pull request review threads.
- Keep only threads where `isResolved` is false.
- Keep only threads started by Copilot. The author login is `copilot-pull-request-reviewer`.

For each comment:

- Assess whether it is relevant. Be critical and realistic. Take into account business flows visible in code.
- State its criticality.
- Identify the type of problem.
- Provide a short, descriptive title.
- Explain the problem at conceptual in 3 sentences.
- Suggest solution at conceptual level in 3 sentences.
- Recommended action in 1 sentence.

## Output format

- Use the format shown below for every comment.
- Include the file path with its line number when available.
- Order relevant findings by criticality: Critical, High, Medium, Low.
- Put irrelevant comments last. Use `None` for their criticality.
- If no matching comments exist, return: "No unresolved Copilot review comments."

## Output examples

These examples are illustrative. Use the actual findings and locations.

### 1. Missing ownership check

- **Relevant:** Yes
- **Criticality:** High
- **Type:** Security
- **Location:** `src/api/orders.ts:42`
**Explanation:**
The endpoint loads an order by ID without checking its owner. An authenticated user could access another user's order.
**Solution:**
Some soultion.
**Recommended action:** Some action.

### 2. Null check already exists

- **Relevant:** No
- **Criticality:** None
- **Type:** False positive
- **Location:** `src/services/orders.ts:18`
**Explanation:**
Copilot reports a possible null access. The preceding guard already returns when the order is null.
**Solution:**
Some soultion.
**Recommended action:** Some action.
