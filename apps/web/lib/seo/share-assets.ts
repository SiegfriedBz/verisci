import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** What the share images draw with: Sora's two weights, and LabsTrail's mark as a data URL. */
export interface ShareAssets {
  readonly fonts: {
    name: string;
    data: Buffer;
    weight: 400 | 600;
    style: "normal";
  }[];
  readonly logo: string;
}

let assets: Promise<ShareAssets> | undefined;

/**
 * The share images' fonts and mark, read once: Sora (`assets/fonts`, SIL Open Font License,
 * as TTF, which `next/og` reads where the site's web fonts are WOFF2) and `app/icon.svg`.
 * Paths are from the app's root, as Next traces them into the deployment.
 */
export function shareAssets(): Promise<ShareAssets> {
  assets ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Sora-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Sora-SemiBold.ttf")),
    readFile(join(process.cwd(), "app/icon.svg"), "base64"),
  ]).then(([regular, semibold, icon]) => ({
    fonts: [
      { name: "Sora", data: regular, weight: 400, style: "normal" },
      { name: "Sora", data: semibold, weight: 600, style: "normal" },
    ],
    logo: `data:image/svg+xml;base64,${icon}`,
  }));
  return assets;
}
