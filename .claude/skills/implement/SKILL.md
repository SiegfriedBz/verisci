---
name: implement
description: Implement a plan from docs/plans/ test-first on its own branch, committing in small steps. Use when the user asks to implement or build a planned feature.
argument-hint: <plan-number or path>
disable-model-invocation: true
---

Implement plan **$ARGUMENTS** (`docs/plans/$ARGUMENTS-*.md` when given a number). Read the plan and `CONTRIBUTING.md` first. If the plan's status is not `ready`, stop and say why.

1. **Branch.** Propose `<type>/<NNN>-<slug>` per `CONTRIBUTING.md` (under 40 characters) and wait for the user's OK. Then `git fetch origin` and `git switch --no-track -c <branch> origin/develop` (the user sets the upstream when pushing). Never work on `develop` or `main`. Set the plan's Status to `in progress`.
2. **Tests first.** Turn each Behaviour bullet into a test: Vitest next to the code (`*.test.ts`), Foundry in `packages/contracts/test/` (`*.t.sol`). Run them and show the user that they fail for the right reason (missing behaviour, not a typo). Do not commit failing tests: every commit must pass `pnpm test`, so they go into the commit that makes them pass.
3. **Implement** until the tests pass, the smallest change that does it. The edit hooks format, lint and run related tests on each file; fix what they report in the same turn.
4. **Docs, in the same branch** (`CONTRIBUTING.md` → Docs): TSDoc on new exports, NatSpec on contracts, comments the diff made false, the workspace README and the root README when commands, layout or behaviour changed.
5. **Commit** in small steps, each passing `pnpm check`, `pnpm typecheck` and `pnpm test`. Use `type(scope): summary`, with a body that says why. Never push; the user pushes.
6. **Close.** Tick the plan's Done-when items you verified, fill **Deviations** with every place the code differs from the plan and why, and set Status `done`. Stop there and suggest `/review-branch`.
