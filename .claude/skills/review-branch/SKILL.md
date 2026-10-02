---
name: review-branch
description: Review the current branch against develop with the reviewer subagent, block on stale docs, then draft the PR title and description. Use when a branch is ready for a PR.
disable-model-invocation: true
---

1. Find the base: `git fetch origin`, then diff against `origin/develop` (or `origin/main` for a release or hotfix branch). Find the branch's plan in `docs/plans/` from the number in the branch name, if there is one.
2. Run the **reviewer** subagent on that diff and plan. It reports and edits nothing.
3. Show its findings, most severe first, in two sections: **Code** and **Docs**, then its **Docs checked** list. If that list misses a README or `CLAUDE.md` of a workspace in the diff or depending on one, run the reviewer again on those files before going on.
4. If there is any **Docs** finding, stop: list the files to update and do not draft the PR. Fixing them comes first (`CONTRIBUTING.md` → Docs).
5. Otherwise draft the PR from the plan, the diff and `.github/pull_request_template.md`:
   - **Title** = the squash commit: `type(scope): summary`, at most 72 characters.
   - **Body**: Summary, Changes, How to verify, Checklist. Write it **full width**: each paragraph and bullet on one line, no hard wraps.
   - End with the line `Built with Claude Code`.
   - Base branch `develop` (or `main` for a release); merge method **Squash and merge** (merge commit for a release).
6. Remind the user that pushing and opening the PR are theirs.
