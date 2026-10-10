import { Check, X } from "@phosphor-icons/react/dist/ssr";
import type { PaperStage } from "../lib/progress.ts";

/** Each step, and the layer it acts on: the record off-chain, or the asset on-chain. */
const STEPS: readonly { label: string; layer?: "off-chain" | "on-chain"; detail: string }[] = [
  { label: "Read", detail: "Title, authors and abstract taken from the PDF" },
  { label: "Saved", layer: "off-chain", detail: "The record is written to the knowledge graph" },
  {
    label: "Minted",
    layer: "on-chain",
    detail: "The asset is minted on Base, with its merkle root",
  },
  { label: "Published", detail: "Anyone can check who submitted it" },
];

/** Classes per layer: emerald for the off-chain record, cyan for the on-chain asset. */
const TONE = {
  "off-chain": {
    text: "text-accent",
    fill: "bg-accent",
    soft: "bg-accent-soft",
    border: "border-accent",
  },
  "on-chain": {
    text: "text-accent-2",
    fill: "bg-accent-2",
    soft: "bg-accent-2-soft",
    border: "border-accent-2",
  },
} as const;

/** How many steps are done, and which one is being worked on, at each stage. */
function position(stage: PaperStage["stage"]): { done: number; active: number | undefined } {
  switch (stage) {
    case "reading":
      return { done: 0, active: 0 };
    case "saving":
      return { done: 1, active: 1 };
    case "minting":
      return { done: 2, active: 2 };
    case "published":
      return { done: 4, active: undefined };
    default:
      return { done: 0, active: undefined };
  }
}

/**
 * A paper's publish steps as a vertical chain: done steps carry a check, the line into the
 * current step runs live and its node breathes, and a refused paper is marked at Read,
 * where every refusal happens.
 */
export function ProgressChain({ stage }: { stage: PaperStage["stage"] }) {
  const { done, active } = position(stage);
  return (
    <ol className="relative grid gap-6">
      {STEPS.map((step, index) => {
        const isDone = index < done;
        const isActive = index === active;
        const isStop = stage === "refused" && index === 0;
        const lineLive = index + 1 === active;
        const tone = TONE[step.layer ?? "off-chain"];
        const next = STEPS[index + 1];
        /** The line from the off-chain save into the on-chain mint shows the link between them. */
        const linkLine = step.layer === "off-chain" && next?.layer === "on-chain";
        return (
          <li key={step.label} className="relative grid grid-cols-[2rem_1fr] gap-4">
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-8 bottom-[-1.5rem] left-[15px] w-0.5 rounded-full ${
                  lineLive
                    ? "line-live"
                    : isDone
                      ? (linkLine ? "link-gradient" : "bg-accent")
                      : "bg-line-strong"
                }`}
              />
            )}
            <span
              className={`relative grid size-8 place-items-center rounded-full border transition-colors duration-500 ${
                isStop
                  ? "border-danger/50 bg-danger-soft text-danger"
                  : isDone
                    ? `border-transparent ${tone.fill} text-accent-ink`
                    : isActive
                      ? `step-active ${tone.border} ${tone.soft} ${tone.text}`
                      : "border-line-strong bg-page text-muted"
              }`}
            >
              {isStop ? (
                <X size={14} weight="bold" />
              ) : isDone ? (
                <Check size={14} weight="bold" />
              ) : (
                <span
                  className={`size-2 rounded-full ${isActive ? tone.fill : "bg-line-strong"}`}
                />
              )}
            </span>
            <div className="pt-0.5">
              <p
                className={`font-medium transition-colors duration-500 ${isDone || isActive ? "text-ink" : "text-muted"}`}
              >
                {step.label}
                {step.layer && <span className={tone.text}> {step.layer}</span>}
                {isActive && <span className="sr-only"> (in progress)</span>}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
