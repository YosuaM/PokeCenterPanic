---
name: pokecenter-code-quality
description: Apply PokéCenter Panic code language, comment, authorship, and automated-test rules when adding or changing source code, scripts, executable configuration, or tests in this repository.
---

# Code quality

- Write identifiers, types, APIs, test names, comments, and developer-facing messages in English. Keep product copy in localization data when multiple languages are needed. Existing Spanish project documentation can remain in Spanish.
- Do not add author tags, AI generation notices, or comments that identify who wrote a code section.
- Keep comments brief. Use them to explain a non-obvious reason or invariant; prefer clear names and small functions for behavior that the code already shows.
- Every added or changed piece of executable code must have corresponding automated tests for its observable behavior. Include relevant edge cases and failures. For multiplayer state changes, cover server authority and conflicting or repeated interactions. Do not substitute tests that only mirror implementation details.
- Introduce a suitable test runner alongside the first executable code. Run the relevant tests before handing off code changes, and report the commands and results. Also run type checking, linting, and build checks when those tools exist and are relevant.
- Keep test fixtures free of real secrets and third-party binary assets. Use synthetic data and placeholders.
