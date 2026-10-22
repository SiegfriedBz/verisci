import { getUploadService } from "@labstrail/workflows";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAPERS_PER_PAGE, pageHref, papersView } from "../../lib/papers/papers.ts";
import { ratingSummaries, withRatings } from "../../lib/papers/ratings.ts";
import { Pager } from "./pager.tsx";
import { PapersTable } from "./papers-table.tsx";

/**
 * One page of the papers list, read from the DKG when it renders, inside `/papers`'
 * `Suspense`: the count, the table with each paper's latest score from the chain, and the page
 * links, or why there is none. A page past
 * the last shows the not-found page; by then the response is streaming, so its status is
 * 200 with `noindex` (a malformed `?page=` is refused with a 404 before that). A list the
 * node did not answer for, or answered unreadably, is kept out of search results too.
 */
export async function PapersResults({ page }: { page: number }) {
  const view = papersView(
    await getUploadService().listPapers({ page, pageSize: PAPERS_PER_PAGE }),
    page,
  );

  switch (view.kind) {
    case "list": {
      const rows = await withRatings(view.papers, ratingSummaries());
      return (
        <div className="grid gap-6">
          <p className="text-sm text-muted">
            {view.lastPage > 1
              ? `${papersCount(view.total)} · page ${page} of ${view.lastPage}`
              : papersCount(view.total)}
          </p>
          <div className="glass rounded-2xl px-2 sm:px-4">
            <PapersTable papers={rows} />
          </div>
          <Pager page={page} lastPage={view.lastPage} />
        </div>
      );
    }
    case "empty":
      return (
        <p className="glass rounded-2xl p-5 leading-relaxed text-muted">
          No paper is published yet.{" "}
          <Link href="/publish" className="link">
            Publish the first one
          </Link>
        </p>
      );
    case "not-found":
      return notFound();
    case "unavailable":
      return (
        <>
          <meta name="robots" content="noindex" />
          <p role="alert" className="glass rounded-2xl p-5 leading-relaxed text-muted">
            The list can't be loaded right now: the DKG node didn't answer.{" "}
            <Link href={pageHref(page)} className="link">
              Try again
            </Link>
          </p>
        </>
      );
    case "unreadable":
      return (
        <>
          <meta name="robots" content="noindex" />
          <p role="alert" className="glass rounded-2xl p-5 leading-relaxed text-muted">
            The DKG node answered, but the list couldn't be read. Try again later.
          </p>
        </>
      );
  }
}

function papersCount(total: number): string {
  return total === 1 ? "1 paper" : `${total} papers`;
}
