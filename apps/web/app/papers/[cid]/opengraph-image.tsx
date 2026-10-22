import { getRatingService, getUploadService } from "@labstrail/workflows";
import { ImageResponse } from "next/og";
import { readProgress } from "../../../lib/publish/upload-actions.ts";
import { ratingChainConfig } from "../../../lib/rating/chain.ts";
import { shareAssets } from "../../../lib/seo/share-assets.ts";
import { readPaperCard, SHARE_SIZE, ShareCard } from "../../../lib/seo/share-card.tsx";
import { createWebEnv } from "../../../lib/web-env.ts";

export const alt =
  "A paper on LabsTrail, with its title, its authors and its reproducibility readiness score";
export const size = SHARE_SIZE;
export const contentType = "image/png";

/**
 * The image a paper's link shares: its title, authors and latest score, or the site's card
 * when it is not published or the node or the chain did not answer (`readPaperCard`), never
 * an error. Its ratings keep the site's card (`ratings/[requestId]/opengraph-image.tsx`).
 */
export default async function Image({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const [{ fonts, logo }, paper] = await Promise.all([
    shareAssets(),
    readPaperCard(cid, {
      readView: (id) => readProgress(id, undefined, getUploadService()),
      listRatings: async (ual) =>
        ratingChainConfig(createWebEnv()) ? getRatingService().listRatings(ual) : undefined,
      logger: console,
    }),
  ]);
  return new ImageResponse(<ShareCard logo={logo} paper={paper} />, { ...size, fonts });
}
