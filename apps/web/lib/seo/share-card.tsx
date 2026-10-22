import {
  describeFailure,
  type PublishedRecord,
  type RatingListResult,
  summariseRatings,
} from "@labstrail/workflows";
import type { PaperView } from "../publish/upload-actions.ts";
import { SITE } from "../site.ts";
import { clip } from "./clip.ts";

/** The size social sites show a shared link's image at. */
export const SHARE_SIZE = { width: 1200, height: 630 } as const;

/** What a paper's card shows: its title, its authors in one line, and its latest score. */
export interface PaperCard {
  readonly title: string;
  /** Empty when the record names no author. */
  readonly authors: string;
  /** The latest phase-1 score, out of 100; absent when the paper has none. */
  readonly score?: string;
}

/** The longest title a card shows, about three lines at its size. */
const TITLE_LENGTH = 110;

/** The dark theme's tokens (`app/globals.css`), the colours `app/icon.svg` is drawn in. */
const COLORS = {
  page: "#0e131a",
  ink: "#e5ebf3",
  muted: "#97a3b6",
  accent: "#7eaaff",
  accent2: "#4cd0c4",
} as const;

/**
 * A paper's card text: its title cut at a word to 110 characters, its authors as "A, B and C"
 * (three or fewer) or "A, B et al.", and its score when it has one.
 */
export function paperCard(record: PublishedRecord, score: number | undefined): PaperCard {
  return {
    title: clip(record.title, TITLE_LENGTH),
    authors: authorLine(record.authors),
    ...(score === undefined ? {} : { score: String(score) }),
  };
}

/**
 * The card a paper's link shares: a published paper with its record, its score
 * from its latest fulfilled rating (none while unrated, or where no contract takes ratings:
 * `ratings` undefined). `undefined`, for the site's card, when the paper is not published,
 * its record was not given, or the chain did not answer for its ratings.
 */
export function paperCardFor(
  view: PaperView,
  ratings: RatingListResult | undefined,
): PaperCard | undefined {
  if (view.stage !== "published" || !view.record) return undefined;
  if (ratings === undefined) return paperCard(view.record, undefined);
  if (!ratings.ok) return undefined;
  const summary = summariseRatings(ratings.ratings);
  return paperCard(view.record, summary.kind === "scored" ? summary.score : undefined);
}

/** What {@link readPaperCard} reads with. */
export interface PaperCardReads {
  /** The paper's stage and record (`readProgress`). */
  readView(cid: string): Promise<PaperView>;
  /** Its ratings, or `undefined` where no contract takes ratings. */
  listRatings(ual: string): Promise<RatingListResult | undefined>;
  logger: Pick<Console, "warn">;
}

/**
 * A paper's card from the node and the chain ({@link paperCardFor}), or `undefined` for the
 * site's card. A read that throws is logged (`share-card-unavailable: <reason>`), never shown:
 * a shared link always gets an image.
 */
export async function readPaperCard(
  cid: string,
  reads: PaperCardReads,
): Promise<PaperCard | undefined> {
  try {
    const view = await reads.readView(cid);
    if (view.stage !== "published") return undefined;
    return paperCardFor(view, await reads.listRatings(view.ual));
  } catch (error) {
    reads.logger.warn(`share-card-unavailable: ${describeFailure(error)}`);
    return undefined;
  }
}

/**
 * The image a shared link shows, for `next/og`'s `ImageResponse` (inline styles, flex
 * layout): LabsTrail's mark and name, then the site's definition, or a paper's title, authors
 * and score, over the brand's blue-to-teal line. `logo` is `app/icon.svg` as a data URL.
 */
export function ShareCard({ logo, paper }: { logo: string; paper?: PaperCard | undefined }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px 72px",
        backgroundColor: COLORS.page,
        backgroundImage: `radial-gradient(circle at 100% 0%, rgba(76, 208, 196, 0.16), transparent 45%), radial-gradient(circle at 0% 100%, rgba(126, 170, 255, 0.14), transparent 50%)`,
        color: COLORS.ink,
        fontFamily: "Sora",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* biome-ignore lint/performance/noImgElement: next/og draws plain img elements, not next/image */}
        <img src={logo} width={60} height={60} alt="" />
        <div style={{ display: "flex", fontSize: 38, fontWeight: 600 }}>
          <span>Veri</span>
          <span style={{ color: COLORS.accent }}>Sci</span>
        </div>
      </div>
      {paper ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 50, fontWeight: 600, lineHeight: 1.18 }}>
            {paper.title}
          </div>
          {paper.authors && (
            <div style={{ display: "flex", fontSize: 28, color: COLORS.muted }}>
              {paper.authors}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 46, fontWeight: 600, lineHeight: 1.22 }}>
          {SITE.definition}
        </div>
      )}
      {paper?.score ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 84, fontWeight: 600, color: COLORS.accent2, lineHeight: 1 }}>
            {paper.score}
          </span>
          <span style={{ fontSize: 30, color: COLORS.muted }}>/100 reproducibility readiness</span>
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 28, color: COLORS.muted }}>
          {paper
            ? "Published on the OriginTrail DKG, anchored on Base"
            : "A machine reproducibility score now, transparent human review next"}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 10,
          backgroundImage: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accent2})`,
        }}
      />
    </div>
  );
}

/** Up to three authors as "A, B and C"; more as "A, B et al."; none as an empty line. */
function authorLine(authors: readonly string[]): string {
  if (authors.length > 3) return `${authors[0]}, ${authors[1]} et al.`;
  if (authors.length <= 1) return authors[0] ?? "";
  return `${authors.slice(0, -1).join(", ")} and ${authors.at(-1)}`;
}
