# @labstrail/web

The Next.js 16 app (App Router).

Status: the home page; the upload pages, where a visitor connects a wallet, publishes a PDF,
follows it until its Target KA is minted and verifies its record; the list of published
papers, with each paper's score; ratings, where a published paper's page lists its ratings
and requests one from the wallet, and each rating's page follows it to its score and shows
every check behind it; the method and about pages; what search engines and AI search read
(below: titles, canonical links, `robots.txt`, the sitemap, structured data and share
images); `/api/inngest`, which serves the workflows' Inngest functions
([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)); and
`/api/webhooks/alchemy`, which takes the Alchemy Notify webhook's rating requests
([ADR 0017](../../docs/adr/0017-chain-events-are-ingested-at-least-once.md)).

Architecture views: [`.omm/overall-architecture/web-app/`](../../.omm/overall-architecture/web-app/), [`.omm/route-page-map/`](../../.omm/route-page-map/), [`.omm/state-transitions/paper-page/`](../../.omm/state-transitions/paper-page/), [`.omm/state-transitions/rating-page/`](../../.omm/state-transitions/rating-page/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

All five packages: `@labstrail/env`, `@labstrail/core`, `@labstrail/dkg`,
`@labstrail/contracts`, `@labstrail/workflows`. Each one must be listed in
`transpilePackages` in `next.config.ts`. Also `inngest` (the `/api/inngest` route's `serve`
handler); Reown AppKit, wagmi's actions and viem (the wallet, loaded only when used;
TanStack Query stays installed as wagmi's peer); `@vercel/analytics` (production's visit
counts); `@upstash/ratelimit`
and `@upstash/redis` (the limits); Zod (settings and run outputs); `@next/env` (loads the
root env files in `next.config.ts`); TanStack Table (the papers table); Tailwind CSS, with
`clsx` and `tailwind-merge` for shadcn's `cn` (`lib/utils.ts`); and Phosphor icons. `next.config.ts`
points the optional `@x402/*` packages, reached through wagmi's connectors, at
`lib/empty-module.ts` (`docs/domain.md` → Next.js).

## Pages and routes

| Path | What it is |
| --- | --- |
| `/` | Home: what LabsTrail is, in one sentence (`SITE.definition`), with a demo that publishes a paper and then rates it, the latest papers (the five newest, streamed in with a skeleton, linking to `/papers`), why LabsTrail exists (the 2016 *Nature* reproducibility survey, and AI agents that build on papers they can't weigh, linking to `/about`), the DKG's two layers (the record off-chain, its ERC-721 token and merkle root on-chain, the UAL linking them), how publishing and rating work (phase 1 live, human review and replication to come), and an example paper asset |
| `/publish` | Connect a wallet, drop a PDF, sign once; what publishing means and the limits ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md), [ADR 0034](../../docs/adr/0034-users-connect-a-wallet-anyone-may-publish.md)) |
| `/papers?page=<n>` | Every paper this environment published, newest mint first, 20 to a page, each with its score (below) |
| `/papers/<cid>?event=<id>` | A 404 for an address that is no CID, before anything streams; otherwise where a paper stands, then its record, abstract and how to verify it, and its Ratings section (`#rating`, scrolled into view when the page opens at it, `components/rating/scroll-to-rating.tsx`) once published (below), under "Papers / <title>" breadcrumbs. `?already=1` says a re-submitted PDF was already published |
| `/api/papers/<cid>?event=<id>` | The same as JSON (`PaperView`: the stage, and the record once published), never cached: a read, so a route rather than a server action |
| `/papers/<cid>/ratings/<requestId>` | One rating: where it stands until it is scored, then its score and every check behind it, or why it was cancelled (below), under "Papers / <title> / Rating" breadcrumbs. `?new=1`, from the Rate button, follows a request the chain doesn't show yet for 2 minutes |
| `/api/ratings/<requestId>` | The same as JSON (`RatingView`), never cached, for the rating page to poll; not-found for an id that is not `0x` + 64 hex digits, or where no contract takes ratings |
| `/method` | How the reproducibility readiness score works: how a paper is scored, the checklist for each kind of study (`STUDY_TYPES` from `@labstrail/core`, with each one's number of checks), the scorer's model (`RATING_SETTINGS.model`) and the PDF it reads from IPFS by its CID, what the score leaves out, where it is recorded (the score on Base, the answers in the rating's own Knowledge Asset), and the three phases |
| `/about` | Why LabsTrail exists (the reproducibility crisis, and AI agents that build on papers they can't weigh), the OriginTrail DKG's two layers, the paper's PDF stored off-chain on IPFS at an address hashed from its content, papers and ratings as Knowledge Assets that LabsTrail's node mints and holds, what comes next (the root README's roadmap, each step with its status and why), who builds LabsTrail (its maintainer, the code on GitHub, a LinkedIn profile, from `SITE`), testnets until mainnet, how it differs from the 2020 SciFact model of the same name, and that visits are counted with Vercel Web Analytics, which sets no cookies (ADR 0041) |
| `/robots.txt`, `/sitemap.xml` | Production's crawling rules and every page and paper to index; elsewhere, every crawler kept out and an empty sitemap (below) |
| `/opengraph-image`, `/papers/<cid>/opengraph-image`, `/papers/<cid>/ratings/<request id>/opengraph-image` | The 1200 × 630 images a shared link shows: the site's, a paper's, and a rating's, which is the site's (below) |
| `/api/inngest` | Serves the Inngest functions: the publish function and the failure alerts, plus the rating, oracle, reconciler and health functions where the oracle key is set |
| `POST /api/webhooks/alchemy` | The Alchemy Notify webhook's deliveries: hands the raw body and `X-Alchemy-Signature` to the workflows' intake (`getWebhookIntake`) and answers its status, with an empty body: 200, 401 (bad signature), 400 (not a delivery), 503 (Inngest refused, so Alchemy Notify delivers again), or 404 where `ALCHEMY_WEBHOOK_SIGNING_KEY` is unset (`packages/workflows` README → The Alchemy Notify webhook) |
| any other path | `app/not-found.tsx`; a page that fails to render shows `app/error.tsx` with a retry |

`app/actions.ts` holds three server actions. Locally, `announceLocalRating(txHash)` has the
server announce a rating request (The Ratings section, below). The publish form calls the
other two: `requestUpload()` signs a
Pinata upload URL within the connection's daily limit, and `submitPaper(input)` checks the
signed submission and starts its publish run within the address's daily limit
([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)). The browser
(`lib/publish/publish-flow.ts`) first refuses a file that is not a PDF (by its type, or, when the
picker gives none, by the `%PDF-` it must start with) or is over 15 MB, before spending an
upload URL. It then uploads the PDF straight to Pinata, canonicalizes the CID it answers,
and has the wallet sign `{ cid, contextGraph, deadline }` with a deadline 10 minutes ahead.
The work itself is `@labstrail/workflows`' `getUploadService()`
([`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)).

Limits (`lib/publish/limits.ts`): 10 upload URLs per connection (IP) and 5 submissions per signing
address, each per rolling day, in Upstash; in memory with `APP_ENV=local` and no Upstash
settings, reset when the server restarts. A limit store that does not answer refuses
rather than letting requests through.

A service that does not answer gives the visitor "A service we rely on didn't answer", and
the server logs one warning naming it: `upload-url-unavailable: <service>: <what came back>`
(`upstash`, `pinata`) for an upload URL, `submit-unavailable: …` for a submission
([`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)). The line never
carries a key, a URL or the visitor's IP: the limits drop the command Upstash echoes in its
errors, whose key holds the IP.

### The papers list

`/papers` reads one page from the DKG node per request (`listPapers`,
[`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)), with no database
([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)): the papers newest mint
first, the total, each paper's first three authors (or how many it has, when none could be
named) and its signature check. The heading
shows at once and the rows stream into a `Suspense` boundary keyed by page, with a skeleton
shaped like the table (`components/papers/papers-table-skeleton.tsx`).

- The table (`components/papers/papers-table.tsx`) is TanStack Table v9 with core features
  only, since the server sorts and pages; its columns are module constants
  (`papers-columns.tsx`), drawn with shadcn's table restyled with the app's tokens
  (`components/ui/table.tsx`). Below `md`, each row is one stacked cell.
- Page links (`components/papers/pager.tsx`) are plain links to `/papers?page=N`, so each page
  is a URL the server renders, and its own canonical address (`generateMetadata`): the first,
  the last and the current page's neighbours past seven pages.
- A `?page=` that is not a positive whole number, or one so far out that page × 20 passes
  `Number.MAX_SAFE_INTEGER`, answers 404 before anything streams. A page past the last shows
  the not-found page, as a 200 with `noindex`, since the response is already streaming when
  the node answers (`docs/domain.md` → Next.js).
- The Score column shows each paper's latest phase-1 score, the contract's
  ([ADR 0014](../../docs/adr/0014-contract-owns-scores-dkg-owns-content.md)), in the on-chain
  teal, followed by the phase it reached, "phase 1"
  ([ADR 0012](../../docs/adr/0012-three-phases-settled-by-the-oracle.md)); otherwise its state
  in words, summed by `summariseRatings`, the rule the paper page
  shares: "Pending", "Can't be rated" (a request was cancelled as invalid), "Not rated" with a
  Rate link to the paper's Ratings section where a contract takes ratings, or "Not checked"
  when the chain did not answer within 6 s, so a slow chain never holds the list
  (`lib/papers/ratings.ts` → `withRatings`).
- A node that does not answer says the list can't be loaded, with a link to try again; an
  answer that can't be read (a refused query, or a page the total covers with no readable
  row) says so, without the link. On the home page, the latest papers block says it can't
  load them in either case, and only that block
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).

### The paper page

The server reads where the paper stands (`components/paper/paper-loader.tsx`, the same
`readProgress` as `/api/papers/<cid>`) inside a `Suspense` boundary. Until the node answers,
a skeleton shows the breadcrumbs, the side panel's real title, groups and labels (as
paragraphs, so no heading comes before the paper's own `h1`), and the PDF's CID, with only the values pulsing: the chain of steps and the publish panel's labels
when the address has `?event=`, a published paper's shape (abstract, one row of steps) and
the verify panel's otherwise (`components/paper/labels.ts` holds the labels both use).
`components/paper/paper-progress.tsx` then follows the paper from that first view: unless it
is final, it asks `/api/papers/<cid>` every 5 s and stops on a final stage. It shows and asks
by the CID's canonical spelling, the one the signature covers, whatever spelling the address
has. `lib/publish/progress.ts` (`paperProgress`, pure) maps the
asset's state on the node, the run Inngest started for the event, and why that run stopped
to one stage:

```mermaid
stateDiagram-v2
  [*] --> reading: event sent
  reading --> saving: draft on the node
  saving --> minting: shared, mint started
  minting --> published: asset minted
  reading --> refused: the paper cannot be published (why)
  reading --> failed: the run stopped (why)
  saving --> failed
  minting --> failed
  reading --> following: no run a minute after the event
  following --> saving: the other run stores it
  following --> not_found: nothing stored after 45 minutes
  reading --> not_found: still listed as running, nothing stored, after an hour
  reading --> not_published: run ended, output unreadable, nothing stored
  published --> [*]
  refused --> [*]
  failed --> [*]
  not_found --> [*]
  not_published --> [*]
```

- A minted asset is `published` whatever the run says, so a second submitter of the same
  PDF sees it at once.
- `refused` shows why (`lib/publish/messages.ts` → `refusalMessage`): not a PDF, too large,
  unreadable, no title or no text (with a hint for PDFs whose pages are pictures), a paper
  outside the field (LabsTrail publishes life-science and health papers only, the field named
  as [ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md) names
  it), or a submission that failed its checks.
- `failed` shows why the run stopped (`failureMessage`): Base, the PDF, the DKG node or
  the mint not answering after every retry, OriginTrail's network not accepting the record
  yet (`network-refused`), or a problem on our side.
- `following`: the event started no run a minute after it was sent (its time is read from
  its ULID, `eventTime`). The publish function is a singleton per CID, so another run holds
  this PDF; the page follows the paper on the node and gives up (`not-found`) after
  `FOLLOW_MS`, a run's whole 45-minute budget.
- `not-found` also covers a run still listed as running an hour after its event with nothing on the node
  (`STALE_RUN_MS`: the run's budget, which counts from its start, plus a margin for a late
  start); Inngest has cancelled it by then.
- `unavailable` (the node or Inngest not answering) is shown and asked again.
- A published paper whose record the node did not answer for, or does not show yet after
  its run minted it (`recordProblem: "unavailable"`), is asked about again until the record
  loads; one whose record cannot be read says so
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).

Once published, the page leads with the paper: the record (title, sized by its length,
authors, DOI), then its abstract (`components/paper/abstract.tsx`: past 420 characters, cut
to five lines with a "Read more" toggle), then the publish steps as one row of done steps.
Beside it, a "Verify it yourself" panel (`components/paper/verify-panel.tsx`) shows the
signature checked when read, then two groups: "The submission" (the submitter, the
signature, its deadline and the context graph) and "The asset" (the agent address the asset
is minted to, which is our node and the UAL's author; the asset's ERC-721 token in
OriginTrail's `DKGKnowledgeAssets`, `lib/papers/explorer.ts` → `assetTokenUrl`; the UAL; and the
PDF's CID, linked through Pinata's public gateway, `ipfsUrl`, since ipfs.io no longer
serves files). Addresses and the token link to Basescan. "How to check this record" gives
the EIP-712 domain and type to check the signature with. A page that follows a paper to
Published asks the server to render it again (`router.refresh`), so the Ratings section
appears without a reload.

### The Ratings section

Under a published paper, the server reads its ratings inside their own `Suspense` boundary,
behind a skeleton with the real headings (`components/rating/ratings-section.tsx`, through
`getRatingService().listRatings`,
[`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)):

- A scored paper's section opens with one sentence that says its latest score ("<title>
  scores 72/100 for reproducibility readiness on LabsTrail.") with a link to `/method`, and
  holds that rating as a `Review` for search engines (below).

- Phase 1, reproducibility readiness, leads: the latest score recorded on chain with a link
  to its checks; "Rating in progress" with a link to follow it; "Can't be rated" when a request
  was cancelled as invalid; or "Not rated yet" with what a rating does. The words are the
  papers list's (`summariseRatings`).
- **Rate this paper**, or **Rate again** under a score with a line saying a new rating adds its
  own score ([ADR 0013](../../docs/adr/0013-several-ratings-per-paper.md))
  (`components/rating/rate-button.tsx`, the flow in
  `lib/rating/request-flow.ts`): connects the wallet or switches it to the rating chain, sends
  `requestPhase1(ual)` to the environment's current contract
  ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)), waits up to 90 s
  for the receipt, reads the request id from its `Phase1Requested` log and opens the rating's
  page, marked `?new=1` as just requested (`lib/rating/stage.ts` → `newRatingPath`). Locally, it first has the server announce the request (`announceLocalRating`), since no
  Alchemy Notify webhook watches Anvil
  ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)); when that fails, it says the
  request is on chain but its rating didn't start, and that the `pnpm dev` terminal says why
  (`rating-announce-unavailable`), with a link to the request's page. It says when the wallet
  already has 3 ratings waiting
  ([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)), when ratings are
  paused, when the contract refused a mined request, and when no receipt came in time. A paper
  that can't be rated has no button.
- The history lists every rating, newest first, each with its day, its outcome and a link to
  its page; then the three phases: reproducibility readiness (live), human review (next) and
  wet-lab replication (later)
  ([ADR 0012](../../docs/adr/0012-three-phases-settled-by-the-oracle.md)).
- A chain that does not answer says the ratings can't be loaded, with a link to try again;
  where no contract takes ratings, the section says so and reads nothing.

### The rating page

`components/rating/rating-loader.tsx` reads the rating (`readRating`) and the paper's title on
the server; `components/rating/rating-progress.tsx` then asks `/api/ratings/<id>` every 5 s
until the rating is scored or cancelled (`lib/rating/stage.ts`):

```mermaid
stateDiagram-v2
  [*] --> scoring: request on chain, no R-KA yet
  scoring --> saving: R-KA saved on the node
  saving --> minting: mint started
  minting --> recording: R-KA minted, the oracle records the score
  recording --> scored: fulfilled on chain
  scoring --> cancelled: invalid target, or past a day
  saving --> cancelled
  minting --> cancelled
  scored --> [*]
  cancelled --> [*]
```

- While pending, the page shows the steps as the publish page's chain (Scored, Saved
  off-chain, Minted on-chain, Recorded on-chain; `components/rating/rating-steps.ts`), what
  happens during the current one, and when the rating was requested; past 15 minutes
  (`lib/rating/elapsed.ts`), a note that it is taking longer than usual, most often because
  the scoring model is busy.
- Scored (`components/rating/rating-detail.tsx`): the contract's score, flagged when the R-KA
  records another ([ADR 0014](../../docs/adr/0014-contract-owns-scores-dkg-owns-content.md));
  the study type and the rationale; each check with its answer and quote, and for a check
  that lost its point what the scorer claimed and why it didn't count (`lib/rating/checks.ts`);
  whether the paper's text was shortened; the model and prompt version; and links to the R-KA
  and the contract (unlinked on Anvil).
- Cancelled: why, in plain words (`lib/rating/messages.ts` → `cancelMessage`): the paper can't
  be rated (outside the field, a PDF whose text can't be read, not one of LabsTrail's papers,
  or no usable answer from the scoring model), or the rating couldn't finish within a day.
- A rating no contract holds, one of another paper, or any under a paper that isn't
  published, is the not-found page. Opened with `?new=1`, the page follows a request no
  contract holds yet for 2 minutes (`FRESH_WAIT_MS`), headed "Checking on this rating", before
  it reads "No rating here": the wallet's receipt can come back a few seconds before the site's
  RPC shows the request (`whileFresh`). A chain that does not answer is asked again, and a rating
  it then shows of another paper reads "No rating here". A DKG node that does not answer leaves the rating showing,
  from the chain, under the paper's short address, with a note that the title and checks
  can't be shown ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).
  Where no contract takes ratings, the page says so.

To rate a paper locally through these pages, against a contract on Anvil, see
[`packages/workflows` → Running a rating locally](../../packages/workflows/README.md#running-a-rating-locally).

## Search engines and AI search

Production is open to every crawler, AI training crawlers included; staging, previews and
local runs keep them all out
([ADR 0040](../../docs/adr/0040-production-is-open-to-crawlers.md)). `lib/seo/` holds the
rules, pure and unit-tested; the pages and route files call them.

- **The site's address** is `siteUrl` (`lib/seo/site-metadata.ts`, from the workflows'
  `siteUrlOf`): production's domain, the branch's URL on staging, `http://localhost:3000`
  locally. The layout's metadata (`siteMetadata`) resolves every link against it, titles
  pages "<title> · LabsTrail" (the home page has its own title, `SITE.title`), gives each page
  its own path as canonical (`"./"`, which drops the query), sets a large Twitter card, and
  adds `noindex, nofollow` outside production. Each page sets its own description; the share
  blocks set no title or description, so Next fills them from the page's own.
- **`/robots.txt`** (`robotsFor`, `lib/seo/crawl.ts`): on production, every crawler may read
  everything but `/api/`, and the sitemap is named; elsewhere, `Disallow: /`.
  **`/sitemap.xml`** (`sitemapFor`): on production, the five site pages and every published
  paper with its mint date, read from `listPapers` 50 at a time; a node that does not answer
  leaves the site pages and logs `sitemap-papers-unavailable: <reason>` once. Elsewhere it
  lists nothing. Both render on request, so a build reads no settings and asks no node
  ([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).
- **A paper's metadata** (`paperMetadata`, `lib/seo/page-metadata.ts`) comes from the read its
  body shares (`readProgressOnce`, React's `cache`): once published, its own title, its
  abstract cut to 155 characters (or its title and authors' count) as description, the canonical
  `/papers/<canonical CID>` whatever the address's spelling and query, and an article share
  block with its authors and mint date. With nothing on the node and no publish run followed
  (no `?event=`, or a run given up), it calls `notFound()`: a 404 for crawlers that run no JavaScript, whose metadata blocks the response,
  and the not-found page with `noindex` for browsers. Any other stage is kept out of search
  results. **A rating's** (`ratingMetadata`) is titled by its score and its paper once
  fulfilled, described by its rationale, canonical with its request id in lowercase, and kept
  out of search results until then, or when it is another paper's.
- **Structured data** (`lib/seo/json-ld.ts`, written by `components/site/json-ld.tsx` with every
  `<` escaped, since a title comes from a PDF): the home page's `WebSite` and `Organization`
  (the GitHub repo, and its founder with a LinkedIn profile); a published paper's
  `ScholarlyArticle` (its DOI, DKG UAL and IPFS CID as identifiers, the PDF as its encoding,
  each author a `Person`, never the submitter's wallet, and LabsTrail as the publisher of this
  record, dated by its mint, never of the paper: `sdPublisher`, `sdDatePublished`) and its
  breadcrumb; every address in it uses the canonical CID and a lowercase request id; a
  fulfilled rating's `Review` of its paper, scored out of 100, on the paper page and, with
  its rationale and R-KA's UAL, on its own page with its breadcrumb. Never an
  `aggregateRating`.
- **Crawlers that run no JavaScript** (`isHtmlLimitedBot`, `lib/seo/bots.ts`: Next's own list
  plus GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User,
  PerplexityBot and Perplexity-User, also set as `htmlLimitedBots` in `next.config.ts`) get the
  paper and rating pages rendered in place, with no `Suspense` boundary, so the record, its
  ratings and the score's sentence are in the HTML rather than in a hidden streamed `<div>`
  (`docs/domain.md` → Next.js). Browsers keep the streamed page and its skeleton.
- **Share images** (`lib/seo/share-card.tsx`, drawn by `next/og` in the dark theme's colours):
  every page shares the site's card (`app/opengraph-image.tsx`: the mark, the name and
  `SITE.definition`) but a paper's: a paper's link shares its own (`app/papers/[cid]/opengraph-image.tsx`, read by
  `readPaperCard`: its title cut to 110 characters, its authors as "A, B and C" or "A, B et
  al.", and its latest score), or the site's card when it is not published or the node or the
  chain does not answer. A rating's link shares the site's card
  (`app/papers/[cid]/ratings/[requestId]/opengraph-image.tsx`), since the paper's card shows
  the paper's latest score, which need not be that rating's.
  They draw with Sora from `assets/fonts` (TTF, SIL Open Font License, `OFL.txt`), which
  `next/og` reads where it cannot read the site's WOFF2 fonts.
- A papers list the node did not answer for, or answered unreadably, holds a `noindex`.

## Speed and the wallet

- **The wallet loads only when it's used.** `components/wallet/wallet-runtime.ts` is the only
  module that imports AppKit and wagmi (`components/wallet/imports.test.ts` fails on any
  other), and `providers.tsx` reaches it through `import()`. A page carries none of AppKit,
  WalletConnect or Coinbase's SDK (about 1 MB) and calls none of their servers until the
  wallet loads: when the pointer, focus or a touch reaches a wallet button, or on a click on
  Connect, publish or Rate. Loading it fetches AppKit's settings from Reown, which a wallet
  action waits for up to 8 seconds, and sends Reown AppKit's start-up event (ADR 0041).
  Coinbase's two sign-ins are the runtime's own connectors, with their SDKs' analytics off.
  AppKit's vanilla set-up and wagmi's actions (`wagmi/actions`) on the adapter's config need
  no React provider.
- **A returning visitor** keeps their address in the header. AppKit stores
  `@appkit/connection_status` as `connected`; `WALLET_SESSION_SCRIPT` (`lib/wallet/session.ts`,
  in `<head>`) then marks `<html data-wallet="restoring">` before the first paint, so whatever
  offers to connect (`data-wallet-connect`) keeps its size and shows nothing (`globals.css`),
  and the wallet loads once the page is idle (`requestIdleCallback`, within 2 seconds).
- `useWallet()` gives a component the wallet's status (`lib/wallet/store.ts`: `idle`,
  `loading`, `restoring`, `connected`, `disconnected`, `failed`), its account and runtime, and
  `load` and `preload`. A load that fails leaves "Retry wallet" in the header, and the
  publish form and the Rate button say "The wallet couldn't load. Check your connection and
  try again."; a click tries again.
- `@labstrail/core` declares `sideEffects: false`, so a page using one of its helpers carries
  none of its schemas (Zod).
- `/papers` holds its results area at a minimum height, Sora shows only when it arrives in
  time (`display: "optional"`), and the hero rises without fading, so no page shifts and the
  hero's text can be the home page's largest paint.
- **Measuring:** run Lighthouse on `pnpm --filter @labstrail/web build` then `start`, in a fresh
  private window, never on `dev`: dev serves unminified code, and Lighthouse's simulated LCP
  counts every script requested before the first paint. On 2026-10-18 (mobile): every page
  92-97 (67-74 before), 230-360 KB sent (1.0-1.2 MB before), blocking time 20-70 ms, no
  layout shift.
- **Visits** are counted on production only, with Vercel Web Analytics
  (`components/site/site-analytics.tsx`, [ADR 0041](../../docs/adr/0041-production-counts-visits-without-cookies.md)):
  pages, referrers, countries, devices, without cookies. It is switched on in the Vercel
  project's Analytics tab.

## Code layout

- `app/`: the pages, the route handlers and the server actions.
- `lib/`: each flow's logic, pure or with its IO passed in, tested in unit tests, in the
  flow's folder: `publish` (the upload, the publish form's steps, a paper's progress, the
  messages and the limits), `papers` (the list, its rating summaries and explorer links) and
  `rating` (the request flow, the rating chain, a rating's stage, its checks, the time since
  the request and the messages), `seo` (the site's address and metadata, crawling rules,
  page metadata, structured data, the bot list and the share cards) and `wallet` (a stored
  session, the loader and the wallet's state). Only helpers several
  areas share sit at its root: `web-env`, `server`, `site` (the name, title, description,
  definition, repo and maintainer the metadata, structured data, footer and wallet window
  read), `theme`, `shorten`, `utils` and `empty-module`.
- `components/`, grouped by area: `site` (the shell every page shares: logo, header links,
  theme button, footer, breadcrumbs, the structured data's script), `wallet` (the wallet's provider, its button, and the runtime it loads on use),
  `home` (the hero's demo and the latest papers), `papers` (the papers list), `paper` (one
  paper's page and its step chain, which the rating page and the demo reuse), `rating` (the
  Ratings section, the Rate button and the rating page), `publish`, and `ui`
  (shadcn primitives, restyled with the app's tokens). Tests sit next to their component.
- `assets/fonts/`: Sora as TTF, for the share images.

## Design

The "Clinical" look: a clinical record with an on-chain proof, in Tailwind CSS v4 (`app/globals.css`):

- Two themes: light by default, dark once the visitor picks it with the sun and moon button
  in the header; the choice is kept in this browser (`localStorage`). `THEME_SCRIPT`
  (`lib/theme.ts`) sets `<html data-theme>` in `<head>` before the first paint, so no page
  flashes the other theme, and Tailwind's `dark:` variant follows that attribute. The
  button's name is the same in both themes and CSS picks its icon, so it is right before
  JavaScript runs. AppKit's wallet window follows the same theme. Every colour is a token
  defined for both themes: light accents are dark enough for AA text contrast, and dark is
  a deep blue-grey with solid panels one step lighter than the page. `app/globals.test.ts`
  reads both themes' tokens and holds text to WCAG AA (4.5:1 on the page for ink, muted,
  both accents and danger, accent text on its fill, white on `accent-deep`).
- The "Clinical" look: a cool off-white page (deep blue-grey in dark), a soft wash across
  the top of each page (blue from the top left, teal from the top right), one soft glow
  behind the hero. Raised panels
  with hairline borders hold figures, tools, tables and lists: the hero's demo, the
  UAL figure, the example asset, the papers table and its messages, the paper page's verify,
  publish and Ratings panels, the rating page's panel, the publish form and the footer's
  contracts. Elsewhere, coloured
  edges, timelines and hairline rules group the content, with one call to action per page.
- Two signal colours with one meaning each: blue for the off-chain record, teal for the
  on-chain asset. They blend only on the logo, the main action, live lines, and the line
  linking a save to its mint in the step chains (`StepChain`, which draws the line between
  two on-chain steps teal). Text links are ink with a blue underline
  (`link`); addresses in the papers list and the footer's contract links are muted and
  turn teal on hover. The header's wallet button is neutral, so each page's own call to
  action leads.
- Sora for text, Martian Mono for on-chain values (`next/font`), Phosphor icons. One radius
  scale: `rounded-2xl` panels, `rounded-xl` buttons and inputs, `rounded-lg` small
  controls, `rounded-md` flags.
- The hero's panel plays the example paper being published, its UAL coming out once minted,
  then the same paper being rated, its score (67, its real staging rating) coming out once
  recorded (`components/home/chain-demo.tsx`). Publish and Rate tabs pick one flow, which then
  loops on its own; both flows share one grid cell, so the panel keeps one height and the
  hero beside it never moves. The example is a real staging record whose signature checks
  out, the same as the example asset lower on the page. Beside "Publish a paper", a "Browse
  papers" link.
- Motion: the hero's flows loop and the step being worked on breathes; the home
  sections after the hero rise in as they enter the screen (`reveal`, a CSS scroll-driven
  animation, where the browser supports one). All of it stops for visitors who ask for
  reduced motion.
- Every page works from 360 px wide, one column on phones, and the page clips any overflow
  (`overflow-x: clip`, which keeps the sticky header working). The home hero fills the
  first screen, so the next section starts below the fold; below `md`, the hero's text
  fills the first screen and its panel starts just under the fold. The hero and the `body`
  size with `svh`, the screen's height with a phone's address bar shown, which stays the same
  while the bar hides, so the page stays still as it scrolls; `app/viewport.test.ts` refuses
  `dvh` anywhere in `app/`. On-chain values show in
  short form with a copy button.
- The product name is LabsTrail, for life-science and health papers; its name, title,
  description and one-sentence definition come from `lib/site.ts` (`SITE`). Its mark (`components/site/logo.tsx`, and `app/icon.svg`
  for the tab, in fixed colours that read on light and dark tabs) is a heartbeat whose last
  beat is a check, drawn from the record's blue into the proof's teal.
- Keyboard users get a skip link and one accent focus ring; the header underlines the
  current section's link in blue: Publish on `/publish`, Papers on the list and on every paper
  and rating page (`components/site/nav-link.tsx`). On phones the wallet button is a wallet icon (with a dot
  once connected) beside the theme button, so the header keeps one line; once connected it
  is named by the short address it shows, and AppKit's own window opens from it.
- What the DKG node answers loads behind a skeleton shaped like what replaces it, streamed
  in a `Suspense` boundary; what is known already (labels, the CID) shows at once. Crawlers
  that run no JavaScript get the paper and rating pages whole instead (above).
- The footer (`components/site/site-footer.tsx`) links to publishing, `/method` and `/about`,
  and lists the contracts on Base Sepolia, linked on
  Basescan: OriginTrail's `DKGKnowledgeAssets` and `KnowledgeAssetsLifecycle`
  (`ORIGINTRAIL_CONTRACTS` from `@labstrail/core`), and the RatingController this
  environment's pages use (`lib/rating/chain.ts`): locally the Anvil one, unlinked.

## Environment

`next.config.ts` loads env files from the repo root (`.env.local` and friends; see
[`.env.example`](../../.env.example)). Keep them there, not in `apps/web`: Next.js
would mix the two unpredictably when it reloads. Next.js only watches `apps/web`,
so restart `pnpm dev` after editing a root env file. Variables already set in the
environment (CI, the host) take precedence.

Its own settings are declared in `lib/web-env.ts` (`createWebEnv`), the first three required
unless `APP_ENV` is `local`:

| Variable | Value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis's REST address and token, for the limits: one database shared by every environment, each counter named after its `APP_ENV` (`labstrail:staging:upload-url`), since Upstash's free plan allows one ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). The token is secret |
| `REOWN_PROJECT_ID` | The Reown project id for the wallet window, from one project shared by every environment, read on the server and handed to the page, so nothing is inlined at build time. Without it the pages say the wallet is not set up |
| `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL` | Set by Vercel: production's domain and the branch's URL, the site's address for its canonical links, sitemap, structured data and share images (`siteUrl`); unset locally, where it is `http://localhost:3000` |
| `LOCAL_CHAIN_RPC_URL`, `LOCAL_RATING_CONTRACT` | Optional, read only when `APP_ENV=local`: Anvil's URL and the RatingController deployed there. With both, the pages read and request ratings on that contract and the wallet window offers Anvil; without either, the paper and rating pages say ratings aren't set up, the papers list shows no Rate link, and the wallet window offers only Base Sepolia ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)) |

The pages also need the workflows' settings (DKG, Pinata, chain, Gemini, Inngest;
[`packages/workflows`](../../packages/workflows/README.md#environment)). With
`APP_ENV=local`, `/api/inngest` and the upload page talk to the Inngest dev server.
`instrumentation.ts` checks the workflows' and the web app's settings when a deployed server
starts, so a bad one stops it there; it checks the rating settings too in production, which
refuses to start without its oracle key, and on staging when the key is set
([`packages/workflows`](../../packages/workflows/README.md#environment),
[ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)). It checks nothing when `APP_ENV` is `local`, and does
not run during `next build`. On Vercel, a server starts on a request after the deploy is
live, so a missing setting makes every route fail: set them in each Vercel environment
before its first deploy, and allow each deployed domain in the Reown project.

## Deploying

Vercel builds the site from one project (`labstrail`, Hobby): Root Directory `apps/web`, the
Next.js preset, the install and build commands it detects (pnpm from `packageManager`, Node
24.x from `engines`), and no `vercel.json`. Production tracks `main`; every other branch is a
preview, and `develop`'s, at its stable branch URL, is staging.

- **Deployment Protection** keeps previews private. Its Protection Bypass for Automation
  secret goes into Inngest's Vercel integration, which also sets `INNGEST_EVENT_KEY` and
  `INNGEST_SIGNING_KEY` and syncs the app on each deploy, and at the end of the staging
  webhook's URL ([`packages/workflows`](../../packages/workflows/README.md#the-alchemy-notify-webhook)).
- **Variables** (Settings → Environment Variables): `APP_ENV` (`production`, or `staging` for
  Preview), `DKG_CONTEXT_GRAPH` and `DKG_TOKEN` take one value per environment;
  `ORACLE_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and
  `ALCHEMY_WEBHOOK_SIGNING_KEY` go on Production and on Preview limited to the branch
  `develop`, so feature previews never rate or post; production refuses to start without
  the oracle key or the two Telegram settings
  ([ADR 0038](../../docs/adr/0038-alerts-go-to-one-telegram-chat.md)). Every other variable
  takes one value for both. System Environment Variables stay exposed: Inngest reads `VERCEL_GIT_COMMIT_REF`,
  and the notifications' links and the site's own address `VERCEL_BRANCH_URL` and
  `VERCEL_PROJECT_PRODUCTION_URL`.
- **Inngest's `develop` branch environment** has auto-archive off
  ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)).
- A deployed server checks its settings when it starts (above), so each variable is set
  before the environment's first deploy.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @labstrail/web dev` | Starts the dev server on http://localhost:3000 |
| `pnpm --filter @labstrail/web build` | Production build; needs `APP_ENV` (from the root `.env.local` locally) |
| `pnpm --filter @labstrail/web start` | Serves the production build |
| `pnpm --filter @labstrail/web inngest` | Starts the Inngest dev server (http://localhost:8288), pointed at `/api/inngest`; run it next to `dev` |
| `pnpm --filter @labstrail/web typecheck` | Generates Next's types (`next typegen`), then runs `tsc` |
| `pnpm --filter @labstrail/web test` | Runs its Vitest project (`vitest run`) |
