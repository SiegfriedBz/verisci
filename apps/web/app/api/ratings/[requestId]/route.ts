import { getRatingService } from "@labstrail/workflows";
import { ratingChainConfig } from "../../../../lib/rating/chain.ts";
import { isRequestId } from "../../../../lib/rating/stage.ts";
import { createWebEnv } from "../../../../lib/web-env.ts";

/**
 * One rating, as JSON (`RatingView`), for its page to poll: a read, so a route rather than a
 * server action, which Next.js runs one at a time. An id that is not `0x` + 64 hex digits, or
 * any id where no contract takes ratings, is not-found, with nothing read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<Response> {
  const { requestId } = await params;
  const view =
    isRequestId(requestId) && ratingChainConfig(createWebEnv())
      ? await getRatingService().readRating(requestId)
      : ({ ok: false, reason: "not-found" } as const);
  return Response.json(view, { headers: { "cache-control": "no-store" } });
}
