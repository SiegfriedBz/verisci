import { getUploadService, type PaperListResult } from "@labstrail/workflows";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { LATEST_PAPERS } from "../../lib/papers/papers.ts";
import { ratingSummaries, withRatings } from "../../lib/papers/ratings.ts";
import { PapersTable } from "../papers/papers-table.tsx";

/**
 * The home page's five newest papers, read from the DKG on each request with their latest
 * scores from the chain, and a link to the
 * whole list. When the list cannot be read, only this block says so: the rest of the home
 * page still renders, so a setup error is logged here rather than thrown.
 */
export async function LatestPapers() {
  let result: PaperListResult;
  try {
    result = await getUploadService().listPapers({ page: 1, pageSize: LATEST_PAPERS });
  } catch (error) {
    console.error("latest papers:", error);
    result = { ok: false, reason: "unavailable" };
  }

  if (!result.ok) {
    return (
      <p role="alert" className="glass rounded-2xl p-5 text-sm leading-relaxed text-muted">
        The latest papers can't be loaded right now. Refresh the page to try again.
      </p>
    );
  }
  if (result.papers.length === 0) {
    return (
      <p className="glass rounded-2xl p-5 text-sm leading-relaxed text-muted">
        No paper is published yet.{" "}
        <Link href="/publish" className="link">
          Publish the first one
        </Link>
      </p>
    );
  }
  const rows = await withRatings(result.papers, ratingSummaries());
  return (
    <div className="grid gap-4">
      <div className="glass rounded-2xl px-2 sm:px-4">
        <PapersTable papers={rows} label="Latest published papers" />
      </div>
      <Link href="/papers" className="link inline-flex w-fit items-center gap-1.5 text-sm">
        {result.total > 1 ? `All ${result.total} papers` : "All papers"}
        <ArrowRight aria-hidden size={14} weight="bold" />
      </Link>
    </div>
  );
}
