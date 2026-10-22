# 0041. Production counts visits with Vercel Web Analytics, without cookies

- Status: Accepted
- Date: 2026-10-18

## Context

The maintainer wants to know which countries and pages LabsTrail's visitors come from. The site has no accounts and no cookies, and it runs on free plans. Google Analytics is free but sets cookies, which EU visitors must accept through a banner before it loads, and it adds a third-party script to every page.

## Decision

- Production counts page views with Vercel Web Analytics: each view's page, referrer, country, device and browser. Staging, previews and local runs count nothing.
- It sets no cookies and identifies no visitor across days, so the site needs no consent banner.
- No custom events and no other tracker. The wallet's libraries run with their own analytics off; once a visitor uses the wallet, AppKit still sends Reown the two events it always sends: its start-up, with the page's address, and each connection, with the wallet's address ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)).

## Consequences

- Vercel's Hobby plan includes 50,000 events a month, shared by every project of the account; past that, collection pauses until the next month and nothing is billed. Data is kept for one month.
- Vercel leaves bots out of the counts, and ad blockers may hide some visits, so the numbers are a floor.
- Web Analytics is switched on in the Vercel project's settings; until then the page's script records nothing.
- The About page says visits are counted this way.

## History

- 2026-10-22: the project renamed LabsTrail ([0042](0042-the-project-is-named-labstrail.md), user's choice).
