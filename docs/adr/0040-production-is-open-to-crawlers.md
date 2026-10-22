# 0040. Production is open to search engines and AI crawlers; other environments are closed

- Status: Accepted
- Date: 2026-10-18

## Context

LabsTrail's records are public by design: anyone can read a paper's record and check its scores ([0010](0010-pdf-to-target-ka-pipeline.md), [0011](0011-a-rating-is-a-separate-r-ka.md), [0014](0014-contract-owns-scores-dkg-owns-content.md)). Until now no page told search engines or AI search what it holds, and a 2020 research model from AllenAI's SciFact work shares LabsTrail's name. Production still runs on testnets ([0015](0015-rating-requests-are-free-on-testnet.md)); staging and previews hold test papers in their own graph ([0005](0005-staging-and-production-are-isolated.md)).

## Decision

- Production is indexed now, testnet records included. Staging, previews and local runs keep every crawler out.
- Every crawler may read production, AI training crawlers included, so models learn what LabsTrail is. The API stays closed to them.
- Only published papers, ratings once their first score is recorded ([0012](0012-three-phases-settled-by-the-oracle.md)), and the site's own pages are offered to search results. A paper on its way, a rating waiting for its first score, and a page whose read failed are kept out.
- Pages describe themselves with structured data that mirrors the schema.org records LabsTrail writes to the DKG ([0010](0010-pdf-to-target-ka-pipeline.md), [0011](0011-a-rating-is-a-separate-r-ka.md)). A rating is a Review of its paper, as its R-KA is, never an aggregate rating or a fact-check. The submitter's wallet is never named as an author.
- Crawlers that run no JavaScript, as most AI search crawlers do, get a paper's and a rating's content in the page's HTML, the same content visitors see.

## Consequences

- Testnet records can appear in search before mainnet. A move to mainnet keeps the papers' addresses, which use the CID, but changes the UALs and contracts the structured data names.
- A paper page read while the DKG node is down is marked to stay out of search results until a crawler reads it again.
- Crawlers that run no JavaScript wait for the node before they get the page.

## History

- 2026-10-22: the project renamed LabsTrail; the reason to tell it apart from the SciFact model dropped, since the names no longer clash ([0042](0042-the-project-is-named-labstrail.md), user's choice).
