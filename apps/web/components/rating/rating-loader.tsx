import { getRatingService, getUploadService } from "@labstrail/workflows";
import { notFound } from "next/navigation";
import { readProgressOnce } from "../../lib/publish/upload-actions.ts";
import { ratingChainConfig } from "../../lib/rating/chain.ts";
import { readRatingOnce, whileFresh } from "../../lib/rating/stage.ts";
import { ratingPageJsonLd } from "../../lib/seo/json-ld.ts";
import { siteUrl } from "../../lib/seo/site-metadata.ts";
import { shorten } from "../../lib/shorten.ts";
import { createWebEnv } from "../../lib/web-env.ts";
import { JsonLd } from "../site/json-ld.tsx";
import { RatingProgress } from "./rating-progress.tsx";

/**
 * Reads a rating and its paper's title on the server, inside the rating page's `Suspense`,
 * and hands them to `RatingProgress`, which follows the rating from there. A rating no
 * contract holds, one of another paper, or any under a paper not published, is the not-found
 * page; a chain that did not answer is followed until it does, and `RatingProgress` checks the
 * rating's paper then. On a page opened right after the request (`fresh`), a rating no
 * contract holds yet is followed too, as the chain may not show it for a few seconds. When the DKG node does not answer, the rating still shows, from
 * the chain, under the paper's short address, and the page says why (ADR 0021). Where no
 * contract takes ratings, the page says so and reads nothing. A fulfilled rating holds its
 * `Review` and breadcrumb for search engines (ADR 0040). The reads are the ones the page's
 * metadata made (`readRatingOnce`, `readProgressOnce`).
 */
export async function RatingLoader({
  cid,
  requestId,
  fresh = false,
}: {
  cid: string;
  requestId: string;
  /** The page was opened right after the request (`?new=1`). */
  fresh?: boolean;
}) {
  const env = createWebEnv();
  const config = ratingChainConfig(env);
  if (!config) {
    return (
      <p className="text-muted">
        Ratings aren't set up here: no rating contract is deployed for this environment.
      </p>
    );
  }
  const [read, paper] = await Promise.all([
    readRatingOnce(requestId, getRatingService()),
    readProgressOnce(cid, undefined, getUploadService()),
  ]);
  const view = whileFresh(read, fresh);
  if (!view.ok && view.reason === "not-found") notFound();
  const nodeDown = paper.stage === "unavailable";
  const ual = paper.stage === "published" ? paper.ual : undefined;
  if (!nodeDown && ual === undefined) notFound();
  if (!nodeDown && view.ok && view.rating.targetUal !== ual) notFound();
  const title = paper.stage === "published" && paper.record ? paper.record.title : shorten(cid);
  const fulfilled = view.ok && view.rating.status === "fulfilled" ? view : undefined;
  return (
    <>
      {fulfilled?.rating.score !== undefined && (
        <JsonLd
          data={ratingPageJsonLd(
            siteUrl(env),
            cid,
            {
              requestId: requestId.toLowerCase(),
              score: fulfilled.rating.score,
              ...(fulfilled.record ? { rationale: fulfilled.record.rationale } : {}),
              ...(fulfilled.rating.rKaUal ? { rKaUal: fulfilled.rating.rKaUal } : {}),
            },
            title,
          )}
        />
      )}
      <RatingProgress
        cid={cid}
        title={title}
        ual={ual}
        requestId={requestId.toLowerCase()}
        initial={view}
        local={config.local}
        nodeDown={nodeDown}
        fresh={fresh}
      />
    </>
  );
}
