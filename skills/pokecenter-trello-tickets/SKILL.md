---
name: pokecenter-trello-tickets
description: Manage planning tickets and workflow on the PokéCenter Panic Trello board. Use when creating, editing, moving, or reviewing cards or lists on this board; not for other Trello boards.
---

# PokéCenter Panic Trello tickets

Board: https://trello.com/b/jnnB9u4p/pokecenter-panic
Specification: [docs/specification.md](../../docs/specification.md)

## Language and titles

Write all board-owned content in English, including list names, card titles, descriptions, checklists, labels, and new comments. Keep Pokémon names and technical identifiers as written in the specification. Use a short, action-oriented card title that names one concrete outcome, such as `Set up the monorepo and development tooling`. Do not add a phase number or type prefix to the title.

## Card content

Use this structure for planned work. Keep each section concise and omit a field only when it does not apply:

```markdown
**Type:** Feature | Bug | Chore | Documentation | Test
**Phase:** 1 — Technical prototype

## Goal
One sentence describing the outcome and why it matters.

## Scope
- The work included in this card.

## Acceptance criteria
- An observable result that shows the work is complete.
- Verification appropriate to the change, including automated tests for changed code.

## References
- `docs/specification.md`, relevant section or phase.
```

Use one actual type, not the full list. Use the phase from the specification when relevant; omit it for cross-cutting work. For a bug, add concise **Steps to reproduce**, **Actual behavior**, and **Expected behavior** before Scope. Make acceptance criteria specific and checkable; describe externally visible behavior and important error cases. Include automated test coverage whenever code or executable configuration changes. Add links to dependencies or a pull request when they exist. Do not invent dates, estimates, owners, or test results.

## Workflow

- Check existing cards before creating one. Update the relevant card instead of duplicating it. Split work only when separate outcomes need separate review.
- Keep the lists in this order: `Backlog → Ready → In Progress → In Review → Done`.
- Move a card to `Ready` when its scope and acceptance criteria are clear; to `In Progress` when work starts; to `In Review` when the result is ready for review; and to `Done` only after its acceptance criteria have been verified. Return it to an earlier state if work reopens.
- Keep the card's scope, evidence, blockers, and PR link current when they change. Record actual verification results in the card or linked PR before moving it to `Done`. Use concise comments for material progress or decisions; avoid routine status noise.

## Public content

Treat the board as shareable project material. Never put secrets, credentials, or private data in cards or attachments. Do not upload third-party sprites, audio, fonts, tilesets, or other external assets. Link to approved sources and note required credits instead. Do not add AI authorship or co-author attribution.
