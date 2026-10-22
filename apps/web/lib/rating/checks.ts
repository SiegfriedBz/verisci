import {
  CHECKS,
  type CheckAnswer,
  type CheckResult,
  STUDY_TYPES,
  type StudyType,
} from "@labstrail/core";

/** One check as the rating page shows it. */
export interface CheckRow {
  readonly id: string;
  /** What the check asks, as a sentence about the paper. */
  readonly question: string;
  readonly answer: CheckAnswer;
  /** The paper's own words that show it. */
  readonly quote?: string;
  /** For a check that lost its point: what the scorer claimed, and why it didn't count. */
  readonly lost?: { readonly claimed: CheckAnswer; readonly quote?: string; readonly why: string };
}

/** The R-KA's checks as rows, in checklist order (ADR 0018). */
export function checkRows(checks: readonly CheckResult[]): CheckRow[] {
  return checks.map((check) => ({
    id: check.id,
    question: `The paper ${CHECKS[check.id]}`,
    answer: check.answer,
    ...(check.quote === undefined ? {} : { quote: check.quote }),
    ...(check.claimed === undefined
      ? {}
      : {
          lost: {
            claimed: check.claimed.answer,
            ...(check.claimed.quote === undefined ? {} : { quote: check.claimed.quote }),
            why: lostReason(check.claimed),
          },
        }),
  }));
}

/** Why a claimed answer counted as missing (`scoreChecks`). */
function lostReason(claimed: NonNullable<CheckResult["claimed"]>): string {
  if (claimed.answer === "not-applicable") {
    return "The scorer said this doesn't apply, but it always applies, so the check counts as missing.";
  }
  return claimed.quote === undefined
    ? "The scorer gave no passage from the paper to show it, so the check counts as missing."
    : "The scorer quoted a passage that isn't in the paper's text, so the check counts as missing.";
}

/** An answer in plain words. */
export function answerLabel(answer: CheckAnswer): string {
  switch (answer) {
    case "shown":
      return "Shown";
    case "partly":
      return "Partly shown";
    case "missing":
      return "Missing";
    case "not-applicable":
      return "Doesn't apply";
  }
}

/** The kind of study the scorer read the paper as, and the checklist it held it to. */
export function studyTypeLine(studyType: StudyType | undefined): string | undefined {
  const type = STUDY_TYPES.find((entry) => entry.id === studyType);
  return type && `Read as ${type.label}, against ${type.source}.`;
}
