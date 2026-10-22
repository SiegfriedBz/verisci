// The scorer's reference set: open-access papers with the study type, the answer to each check
// and the score range a careful reader expects, written before the scorer first read them.
// `score-papers` compares the scorer's answers with them (packages/workflows README).
import { CHECK_ANSWERS, STUDY_TYPES, type StudyType } from "@labstrail/core";
import { z } from "zod";

const STUDY_TYPE_IDS = STUDY_TYPES.map((type) => type.id) as [StudyType, ...StudyType[]];
const score = z.int().min(0).max(100);
const common = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  doi: z.string().nullable(),
  url: z.url({ protocol: /^https$/ }),
  licence: z.string().min(1),
  why: z.string().min(1),
};
const paperSchema = z.discriminatedUnion("field", [
  z.object({
    ...common,
    field: z.literal("life-sciences"),
    studyType: z.enum(STUDY_TYPE_IDS),
    expectedScore: z.tuple([score, score]),
    expectedChecks: z.record(z.string(), z.enum(CHECK_ANSWERS)),
  }),
  z.object({
    ...common,
    field: z.literal("outside"),
    studyType: z.null(),
    expectedScore: z.null(),
    expectedChecks: z.null(),
  }),
]);

/** A paper of the reference set. */
export type ReferencePaper = z.infer<typeof paperSchema>;

/** The reference set from `reference-papers.json`'s content; throws when it does not match. */
export function readReferencePapers(json: unknown): ReferencePaper[] {
  return z.array(paperSchema).parse(json);
}
