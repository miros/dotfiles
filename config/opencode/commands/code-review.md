---
description: Review code for correctness, security, design, and tests
---

Perform a code review.

Focus on:

- Regressions and bugs.
- Critical business feature gaps.
- Security issues.
- Code duplication, opportunities for simplification, and unclear responsibilities and boundaries.
- Long comments that are difficult for humans to read.
- Problems in tests:
  - Are important cases missing?
  - Are there tautological tests?
  - Can anything be simplified?
  - Are helper usages missing?

- Present findings. State their criticality and order them by importance.
- Be brief. Use Engineering Writing rules from AGENTS.md.
- Use at most three sentences per finding.
