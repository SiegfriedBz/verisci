# Contributing

One feature, one branch, one PR, squash-merged into `develop`. `develop`
reads as a clean list of Conventional Commits, one per feature; `main`
receives them through release PRs.

## Environments

Two long-lived branches, each deployed at a stable URL so that webhooks and
other services can target it.

| Branch | Environment | Networks | Receives |
| --- | --- | --- | --- |
| `develop` | Staging | testnets | squash-merged feature PRs |
| `main` | Production | testnets, until a payment plan allows mainnet | release PRs from `develop` |

Each environment has its own contract, context graph, webhook, oracle wallet and
Inngest environment. The DKG node is shared: one node wallet and one admin token
serve both graphs, so a guard in the dkg package will refuse the production
graph outside production (enforced once its env module lands)
([ADR 0005](docs/adr/0005-staging-and-production-are-isolated.md)). Mainnet
waits on a payment plan
([ADR 0015](docs/adr/0015-rating-requests-are-free-on-testnet.md)). Both
branches are protected: PRs only, CI green, never deleted.

## Branches

Feature branches start from `develop`:
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
- **Body** (optional, wrapped at 72 on branch commits; squash commits take
  the full-width PR description): *why*, not *what* — the diff shows what.

```text
feat(core): parse both UAL shapes

V10 UALs carry the author's wallet where older ones carry the storage
contract, so the parser accepts both instead of assuming our node.
```

Commit small and often on the branch: each commit should build and pass its
tests. History on the branch is for you; squash-merge rewrites it for `develop`.

verisci is built with [Claude Code](https://claude.com/claude-code). Commits it
writes end with `Co-Authored-By: Claude <noreply@anthropic.com>`, and PR
descriptions end with a "Built with Claude Code" line.

## Docs

Docs ship with the code: a PR is not ready to push until every doc its diff
touches is true again.

- **READMEs.** The root `README.md` is the entry point: what verisci is, how
  to set it up, and a short section per workspace that links to that
  workspace's own `README.md` instead of repeating it. Each workspace README
  says what the workspace is for, what it depends on, and how to run, test
  and use it.
- **Comments.** Comments say *why*, not *what*. A comment the diff made false
  is fixed or deleted in the same PR.
- **TSDoc.** Every export of a package has a `/** … */` comment.
- **NatSpec.** Every Solidity contract, interface and library has `@title`
  and `@notice`. Every public or external function, event and error has
  `@notice`, `@param` and `@return`, or uses `@inheritdoc`. `pnpm check`
  enforces this.
- **ADRs.** A branch's code and ADRs agree with the accepted ADRs.
  `/review-branch` blocks the PR on a conflict until you decide to amend an
  ADR, supersede it, or change the code; `/review-adrs` checks all ADRs on
  demand ([ADR 0025](docs/adr/0025-reviews-gate-on-adrs-and-lint.md)).

## Pull requests

- **Title** = the squash commit on `develop`, so it follows the commit format
  and reads as a plain sentence: `feat(web): add the KA detail page`.
- **Description**: four sections — Summary (what and why, 2–3 sentences),
  Changes (bullets), How to verify (commands and expected result),
  Checklist (tests, `pnpm check`/`typecheck`/`test` pass, READMEs, comments,
  TSDoc and NatSpec updated as described in [Docs](#docs), code and ADRs
  agree with the accepted ADRs, no secrets).
  Claude drafts it with `/review-branch`, from
  [`.github/pull_request_template.md`](.github/pull_request_template.md); you
  edit and paste it.
- **Full width**: PR titles and descriptions have no hard line breaks inside
  a paragraph or bullet; each one is a single line, and GitHub wraps it.
  This also applies to the squash commit, whose body is the description;
  the 72-column wrap applies only to commits written on a branch.
- **Base** = `develop` (the default branch).
- **Merge** with "Squash and merge", with the default squash message set to
  "Pull request title and description".
- Delete the feature branch after merge. Then `/clear` in Claude Code.

## Releases

A release PR from `develop` into `main`, titled
`chore(repo): release <YYYY-MM-DD>`, listing the features it ships. Merge it
with **"Create a merge commit"**, never squash: squashing would give `main`
commits that `develop` lacks, and every later release would conflict.
`git log --first-parent main` then lists one entry per release or hotfix.

A fix that cannot wait for a release branches from `main`, goes to `main`
in its own PR. Then a PR from `main` into `develop`, merged with a merge
commit, brings the fix back.

## Who does what

| Step | Claude Code | You |
| --- | --- | --- |
| Create branch | Proposes the name, runs `git switch -c` | Approve |
| Commit | Writes the message, runs `git commit` (asks first) | Approve or edit |
| Push | — (denied in settings) | `git push -u origin <branch>` |
| Open PR | `/review-branch` runs CI's checks and builds, reviews code, docs and ADRs, then drafts title and description | Decide any ADR conflict it reports; then `gh pr create` or GitHub UI |
| Merge | — | Squash and merge into `develop` when CI is green |
| Release | Drafts the release PR | Merge commit into `main` |
