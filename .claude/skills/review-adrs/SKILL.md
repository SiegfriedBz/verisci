---
name: review-adrs
description: Check every ADR in docs/adr/ against every other with the reviewer subagent in sweep mode, and report contradictions, one-way Supersedes links, links to merged ADRs, index mismatches and answered open questions as decisions for the user. Use on demand, for example before a release; it edits nothing.
disable-model-invocation: true
---

1. Run the **reviewer** subagent in **sweep mode** (its "ADR sweep mode" section): every ADR in `docs/adr/` and `docs/adr/README.md`, no diff. It reports and edits nothing.
2. Show its findings, most severe first, each with both ADRs and both sentences (or the index row and the file), then the options: **amend** an ADR (in place, with a dated History line), **supersede** it, or fix the index. Then its **ADRs checked** list.
3. Stop there. The user decides each finding (ADR 0025); never pick an option, never propose ADR wording, never edit. A decision that needs a new ADR goes through `/plan-feature` or the branch of the plan that takes it (`docs/adr/README.md` → Adding an ADR).
