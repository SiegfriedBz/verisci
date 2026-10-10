import { getUploadService } from "@verisci/workflows";
import { readProgress } from "../../../../lib/upload-actions.ts";

/**
 * Where a paper stands, as JSON (`PaperView`), for its page to poll: a read, so a route
 * rather than a server action, which Next.js runs one at a time. `?event=` names the
 * Inngest event its run started from.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cid: string }> },
): Promise<Response> {
  const { cid } = await params;
  const eventId = new URL(request.url).searchParams.get("event") ?? undefined;
  const stage = await readProgress(cid, eventId, getUploadService());
  return Response.json(stage, { headers: { "cache-control": "no-store" } });
}
