# 0018. The phase-1 scorer has a fixed output contract

- Status: Accepted
- Date: 2026-10-02

## Context

Phase 1 scores a paper by machine. The first scorer judged the Target KA's triples (title, abstract, authors), which show little of what a reader checks: the methods, data, results and statements sit in the paper's body. Published reporting checklists say what a paper of each kind of study should report. The model will change; what downstream code relies on should not.

## Decision

- The scorer reads the paper itself: the text of the PDF its Target KA links ([0010](0010-pdf-to-target-ka-pipeline.md)), cut to a configured length.
- In one request, the model says whether the paper is in LabsTrail's field ([0037](0037-labstrail-rates-life-science-and-health-papers.md)) and which kind of study it is, and answers each check of that kind of study's checklist (shown, partly shown, missing, or not applicable for a check that may not apply), quoting the passage that shows it.
- Code computes the score from those answers: a point for each check shown, half a point for each partly shown, over the checks that apply. An answer whose quote is not in the paper's text counts as missing. The model never gives the number.
- The scorer returns `{ score, rationale, studyType, checks }`: `score` an integer from 0 to 100, `rationale` text, `studyType` the kind of study, `checks` each check's answer and quote.
- Its output is schema-validated; anything else never reaches the chain: the step fails, and a paper the scorer gives two such answers for is cancelled "invalid target" ([0011](0011-a-rating-is-a-separate-r-ka.md)).
- A hosted model is not deterministic, even at temperature 0, so the score is computed once, persisted in the R-KA, and read back by every retry.
- The R-KA records the model and prompt version. The model and provider are configuration; a better scorer is recorded in this ADR.
- The scorer is Gemini, `gemini-3.8-flash`, on the Gemini API's free tier: LabsTrail pays for every rating ([0015](0015-rating-requests-are-free-on-testnet.md)), and Claude's API, considered first, has no free tier.

## Consequences

- Changing the model touches no other code.
- The on-chain score always equals the score in the R-KA.
- The same answers always give the same score, and each point can be traced to a quote in the paper. The score measures how completely a paper reports its work, not whether its findings are right.
- LabsTrail presents the score as reproducibility readiness: whether a paper gives what others need to check and reproduce its work, not whether it reproduces (phase 3, [0012](0012-three-phases-settled-by-the-oracle.md)) or is right. It cannot detect a fabricated paper that states every right thing.
- This ADR guarantees the score's shape, not its quality. The paper's text is untrusted input to the model; a quote the model makes up earns nothing.
- On the free tier, Google may use prompts and answers to improve its products; the scorer sends only a published paper, which is public already. The free tier's daily limit, which every environment shares through one key ([0005](0005-staging-and-production-are-isolated.md)), bounds how many papers are scored a day across all of them: a run asks the scorer once per attempt until it gets an answer, at most 6 times, and stops at the second answer its check refuses; it asks the small model once for the field check, on that model's own quota ([0037](0037-labstrail-rates-life-science-and-health-papers.md)); a restart by the reconciler spends them again.
- A paper is read through the pinning gateway, so the gateway must be up to rate one.
- An R-KA written before the checklists holds the first scorer's output, eight signals `observed` or `missing`; its score still reads back.

## History

- 2026-10-07: corrected where a better scorer is recorded, to match the rule that a choice on a topic an ADR covers goes into that ADR.
- 2026-10-11: the scorer is Gemini `gemini-3.8-flash` on the free tier, since VeriSci pays for every rating and Claude's API has no free tier (rating run plan, user's choice).
- 2026-10-11: the scorer reads the paper's full text, answers its kind of study's checklist with quotes, and code computes the score; the output becomes `{ score, rationale, studyType, checks }`, since the record alone showed little of what a reader checks (scorer v2 plan, user's choice).
- 2026-10-12: the score is presented as reproducibility readiness, and what it cannot detect is stated (scope and branding plan, user's choice).
- 2026-10-16: a paper the scorer gives two answers its check refuses is cancelled "invalid target" ([0011](0011-a-rating-is-a-separate-r-ka.md)), since the same paper tends to give the same answer and each try spends the daily quota (intake and recovery review, user's choice).
- 2026-10-16: corrected: a rating spends one scorer request per attempt until one is answered, at most 6 a run, and one small-model request for the field check ([0037](0037-labstrail-rates-life-science-and-health-papers.md)), each restart again, not one request per rating (ADR sweep and branch review, user's choices).
- 2026-10-17: the daily limit is shared by every environment, since one key serves them all ([0005](0005-staging-and-production-are-isolated.md)) (ADR sweep).
- 2026-10-22: the project renamed LabsTrail ([0042](0042-the-project-is-named-labstrail.md), user's choice).
