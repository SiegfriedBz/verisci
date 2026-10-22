import { canonicalCid } from "@labstrail/core";
import { getUploadService } from "@labstrail/workflows";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaperLoader } from "../../../components/paper/paper-loader.tsx";
import { PaperSkeleton } from "../../../components/paper/paper-skeleton.tsx";
import { readProgressOnce } from "../../../lib/publish/upload-actions.ts";
import { isHtmlLimitedBot } from "../../../lib/seo/bots.ts";
import { paperMetadata } from "../../../lib/seo/page-metadata.ts";

interface PaperPageProps {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ event?: string | string[]; already?: string | string[] }>;
}

const eventOf = (event: string | string[] | undefined) =>
  typeof event === "string" ? event : undefined;

/**
 * The paper's metadata, from the read its body shares (`readProgressOnce`): its own title and
 * description once published, kept out of search results until then, and a 404 when the node
 * has no such paper (`paperMetadata`, ADR 0040).
 */
export async function generateMetadata({
  params,
  searchParams,
}: PaperPageProps): Promise<Metadata> {
  const { cid } = await params;
  const eventId = eventOf((await searchParams).event);
  const metadata = paperMetadata(cid, await readProgressOnce(cid, eventId, getUploadService()));
  if (metadata === "not-found") notFound();
  return metadata;
}

/**
 * A paper's page: where its publish stands, from `?event=` (its run) and the DKG. An address
 * that is no CID is a 404 before anything streams. The server reads the paper in a `Suspense`
 * boundary, showing a skeleton of the page until the node answers; the page then follows the
 * paper from that first view. A crawler that runs no JavaScript gets the page rendered in
 * place instead, so the record is in its HTML (`isHtmlLimitedBot`).
 */
export default async function PaperPage({ params, searchParams }: PaperPageProps) {
  const { cid } = await params;
  if (canonicalCid(cid) === undefined) notFound();
  await connection();
  const { event, already } = await searchParams;
  const eventId = eventOf(event);
  const blocking = isHtmlLimitedBot((await headers()).get("user-agent"));
  const loader = (
    <PaperLoader cid={cid} eventId={eventId} resubmitted={already === "1"} blocking={blocking} />
  );
  if (blocking) return loader;
  return (
    <Suspense
      key={`${cid}:${eventId ?? ""}`}
      fallback={<PaperSkeleton cid={cid} following={eventId !== undefined} />}
    >
      {loader}
    </Suspense>
  );
}
