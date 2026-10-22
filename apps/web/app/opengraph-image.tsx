import { ImageResponse } from "next/og";
import { shareAssets } from "../lib/seo/share-assets.ts";
import { SHARE_SIZE, ShareCard } from "../lib/seo/share-card.tsx";
import { SITE } from "../lib/site.ts";

export const alt = SITE.definition;
export const size = SHARE_SIZE;
export const contentType = "image/png";

/** The image every page shares, unless its segment has its own: LabsTrail's name and definition. */
export default async function Image() {
  const { fonts, logo } = await shareAssets();
  return new ImageResponse(<ShareCard logo={logo} />, { ...size, fonts });
}
