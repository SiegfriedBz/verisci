import { getUploadService } from "@verisci/agents";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PaperProgress } from "../../../components/paper-progress.tsx";

export const metadata: Metadata = { title: "Paper · VeriSci" };

/** A paper's page: where its publish stands, from `?event=` (its run) and the DKG. */
export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ event?: string | string[]; already?: string | string[] }>;
}) {
  await connection();
  const { cid } = await params;
  const { event, already } = await searchParams;
  return (
    <PaperProgress
      cid={cid}
      contextGraph={getUploadService().contextGraph}
      eventId={typeof event === "string" ? event : undefined}
      resubmitted={already === "1"}
    />
  );
}
