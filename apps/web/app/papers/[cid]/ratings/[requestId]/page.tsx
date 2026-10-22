import { getRatingService, getUploadService } from "@labstrail/workflows";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RatingLoader } from "../../../../../components/rating/rating-loader.tsx";
import { RatingPageSkeleton } from "../../../../../components/rating/rating-page-skeleton.tsx";
import { readProgressOnce } from "../../../../../lib/publish/upload-actions.ts";
import { ratingChainConfig } from "../../../../../lib/rating/chain.ts";
import { isRequestId, readRatingOnce } from "../../../../../lib/rating/stage.ts";
import { isHtmlLimitedBot } from "../../../../../lib/seo/bots.ts";
import { ratingMetadata } from "../../../../../lib/seo/page-metadata.ts";
import { createWebEnv } from "../../../../../lib/web-env.ts";

/**
 * The rating's metadata, from the reads its body shares (`readRatingOnce`, `readProgressOnce`):
 * its score and its paper's title once fulfilled, kept out of search results until then
 * (`ratingMetadata`, ADR 0040). An id that is not a request id reads nothing, nor does a page
 * where no contract takes ratings, which says so in its body (`RatingLoader`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ cid: string; requestId: string }>;
}): Promise<Metadata> {
  const { cid, requestId } = await params;
  if (!isRequestId(requestId) || !ratingChainConfig(createWebEnv())) {
    return { title: "Rating", robots: { index: false } };
  }
  const [rating, paper] = await Promise.all([
    readRatingOnce(requestId, getRatingService()),
    readProgressOnce(cid, undefined, getUploadService()),
  ]);
  return ratingMetadata(cid, requestId, rating, paper);
}

/**
 * One rating's page: its score with every check, answer and quote behind it, or where it stands
 * while it runs. An id that is not a request id is a 404 before anything streams; the rating is
 * read in a `Suspense` boundary, with a skeleton until the chain and the node answer, except for
 * a crawler that runs no JavaScript, which gets it rendered in place (`isHtmlLimitedBot`).
 * `?new=1`, which the Rate button adds, marks a request just made, which the chain may not show
 * yet.
 */
export default async function RatingPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string; requestId: string }>;
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  await connection();
  const { cid, requestId } = await params;
  if (!isRequestId(requestId)) notFound();
  const fresh = (await searchParams).new === "1";
  const loader = <RatingLoader cid={cid} requestId={requestId} fresh={fresh} />;
  if (isHtmlLimitedBot((await headers()).get("user-agent"))) return loader;
  return (
    <Suspense key={requestId} fallback={<RatingPageSkeleton />}>
      {loader}
    </Suspense>
  );
}
