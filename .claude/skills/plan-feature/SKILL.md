---
name: plan-feature
description: Write a numbered feature plan in docs/plans/ from TEMPLATE.md. Use when the user asks to plan a new feature, before any code is written.
argument-hint: <feature-name>
disable-model-invocation: true
---

Write the plan for **$ARGUMENTS**. Plan only: write no code and create no branch.

1. Number it: list `docs/plans/` (create the folder if missing; it is gitignored), take the highest `NNN-*.md` and add 1, zero-padded to 3 digits. The file is `docs/plans/NNN-<feature-name>.md`, kebab-case.
2. Read `CONTRIBUTING.md`, the root `CLAUDE.md`, `docs/adr/README.md` (and the ADRs that bear on the feature), `docs/domain.md`, the READMEs of the workspaces the feature touches, and the plans it depends on. If `docs/plans/carry-over.md` has a section for this plan, copy it into the plan's Design and delete it from that file.
3. Ask the user whatever you cannot settle from the code and those files: the goal, edge cases, what is out of scope. Ask all of it at once, not one question per turn.
4. Fill in [TEMPLATE.md](TEMPLATE.md):
   - **Goal**: one sentence, from the caller's side.
   - **Behaviour**: Given / when / then, including failures. Each bullet must become one test, so keep them concrete and checkable.
   - **Design**: the files to add or change, public signatures, which workspace owns what (core does no IO), and the ADRs that apply, by number and link. A new decision the plan takes gets its own ADR in the same branch (`docs/adr/README.md` → Adding an ADR).
   - **Out of scope**, then **Done when**: keep the template's docs items and name the READMEs that will change.
   - Status `draft`; the user sets `ready`.
5. Show the user the plan path and a 3-line summary. Next step: `/implement NNN`.
