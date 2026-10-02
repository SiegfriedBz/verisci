# Contributing

One feature, one branch, one PR, squash-merged. `main` reads as a clean list
of Conventional Commits, one per feature.

## Branches

`<type>/<plan>-<slug>` — lowercase, kebab-case, under 40 characters.

| Type | Use for |
| --- | --- |
| `feat` | New behaviour a user or caller can see |
| `fix` | A bug fix (starts with a failing test) |
| `refactor` | Same behaviour, better code |
| `test` | Tests only |
| `docs` | Docs, ADRs, plans only |
| `chore` | Tooling, config, dependencies |
| `ci` | GitHub Actions only |

Examples: `chore/001-workspace-skeleton`, `feat/012-rating-reconciler`,
`fix/rka-detail-empty-evidence` (no number for a fix without a plan).
Plans are local working notes (`docs/plans/`, gitignored); the number only
keeps branches in build order.

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.

- **Scope** = the workspace touched: `env`, `core`, `dkg`, `contracts`,
  `agents`, `web`; or `repo`, `ci`, `claude`, `docs` for cross-cutting work.
  Several workspaces → the main one, or omit the scope.
- **Summary**: imperative, lowercase, no full stop, ≤ 72 characters.
  "add the UAL parser", not "Added UAL parser." or "UAL parser".
- **Body** (optional, wrapped at 72): *why*, not *what* — the diff shows what.

```text
feat(core): parse UALs into chain id, agent address and token id

The middle segment is the node's agent wallet, not a contract, so the
parser names it dkgAgentAddress to stop the old confusion recurring.
```

Commit small and often on the branch: each commit should build and pass its
tests. History on the branch is for you; squash-merge rewrites it for `main`.

## Pull requests

- **Title** = the squash commit on `main`, so it follows the commit format and
  reads as a plain sentence: `feat(web): add the KA detail page`.
- **Description**: four sections — Summary (what and why, 2–3 sentences),
  Changes (bullets), How to verify (commands and expected result),
  Checklist (tests, `pnpm check`/`typecheck`/`test` pass, docs updated,
  no secrets). Claude drafts it; you edit and paste it.
- **Merge** with "Squash and merge" only (repo setting), with the default
  squash message set to "Pull request title and description".
- Delete the branch after merge. Then `/clear` in Claude Code.

## Who does what

| Step | Claude Code | You |
| --- | --- | --- |
| Create branch | Proposes the name, runs `git switch -c` | Approve |
| Commit | Writes the message, runs `git commit` (asks first) | Approve or edit |
| Push | — (denied in settings) | `git push -u origin <branch>` |
| Open PR | `/review` drafts title and description | `gh pr create` or GitHub UI |
| Merge | — | Squash and merge when CI is green |
