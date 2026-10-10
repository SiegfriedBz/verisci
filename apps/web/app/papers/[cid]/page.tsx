import type { Metadata } from "next";
import { PaperProgress } from "../../../components/paper-progress.tsx";

export const metadata: Metadata = { title: "Paper · verisci" };

/** A paper's page: where its publish stands, from `?event=` (its run) and the DKG. */
export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const { cid } = await params;
  const { event } = await searchParams;
  return <PaperProgress cid={cid} eventId={typeof event === "string" ? event : undefined} />;
}
