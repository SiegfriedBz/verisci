import { getUploadService } from "@labstrail/workflows";
import { Suspense } from "react";
import { readProgressOnce } from "../../lib/publish/upload-actions.ts";
import { paperJsonLd } from "../../lib/seo/json-ld.ts";
import { siteUrl } from "../../lib/seo/site-metadata.ts";
import { createWebEnv } from "../../lib/web-env.ts";
import { RatingsSection } from "../rating/ratings-section.tsx";
import { RatingsSkeleton } from "../rating/ratings-skeleton.tsx";
import { JsonLd } from "../site/json-ld.tsx";
import { PaperProgress } from "./paper-progress.tsx";

/**
 * Reads where a paper stands on the server, inside its page's `Suspense`, and hands that
 * first view to `PaperProgress`, which follows it from there: a published paper's record
 * arrives as HTML, with nothing left to ask, and with its structured data (a
 * `ScholarlyArticle` and its breadcrumb, ADR 0040). Below a published paper, its ratings
 * stream in their own `Suspense`, read from the chain; `blocking` renders them in place, for
 * a crawler that runs no JavaScript. The read is the one the page's metadata made
 * (`readProgressOnce`).
 */
export async function PaperLoader({
  cid,
  eventId,
  resubmitted,
  blocking = false,
}: {
  cid: string;
  /** The Inngest event its run started from, from `?event=`. */
  eventId: string | undefined;
  /** The visitor just submitted a paper that was already published. */
  resubmitted: boolean;
  /** Render the ratings in place rather than streaming them (`isHtmlLimitedBot`). */
  blocking?: boolean;
}) {
  const service = getUploadService();
  const initial = await readProgressOnce(cid, eventId, service);
  const published = initial.stage === "published" ? initial : undefined;
  const ratings = published && (
    <RatingsSection ual={published.ual} cid={cid} title={published.record?.title} />
  );
  return (
    <div className="grid gap-10">
      {published?.record && (
        <JsonLd data={paperJsonLd(siteUrl(createWebEnv()), cid, published.ual, published.record)} />
      )}
      <PaperProgress
        cid={cid}
        contextGraph={service.contextGraph}
        eventId={eventId}
        initial={initial}
        resubmitted={resubmitted}
      />
      {ratings &&
        (blocking ? ratings : <Suspense fallback={<RatingsSkeleton />}>{ratings}</Suspense>)}
    </div>
  );
}
