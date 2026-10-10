import { Check, Circle, X } from "@phosphor-icons/react/dist/ssr";
import type { PaperStage } from "../lib/progress.ts";

const STEPS = [
  { label: "Read", detail: "Title, authors and abstract taken from the PDF" },
  { label: "Saved", detail: "The record is written to the knowledge graph" },
  { label: "Minted", detail: "The record is anchored on Base" },
  { label: "Published", detail: "Anyone can look it up and check who submitted it" },
] as const;

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
 * A paper's publish steps as a vertical chain: done steps carry a check, the current one
 * breathes, and a refused paper is marked at Read, where every refusal happens.
 */
export function ProgressChain({ stage }: { stage: PaperStage["stage"] }) {
  const { done, active } = position(stage);
  return (
    <ol className="relative grid gap-5">
      {STEPS.map((step, index) => {
        const isDone = index < done;
        const isActive = index === active;
        const isStop = stage === "refused" && index === 0;
        return (
          <li key={step.label} className="relative grid grid-cols-[2rem_1fr] gap-3">
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-8 bottom-[-1.25rem] left-4 w-px ${isDone ? "bg-accent" : "bg-line"}`}
              />
            )}
            <span
              className={`relative grid size-8 place-items-center rounded-full border ${
                isStop
                  ? "border-danger bg-danger-soft text-danger"
                  : isDone
                    ? "border-accent bg-accent text-accent-ink"
                    : isActive
                      ? "step-active border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface text-muted"
              }`}
            >
              {isStop ? (
                <X size={14} weight="bold" />
              ) : isDone ? (
                <Check size={14} weight="bold" />
              ) : (
                <Circle size={8} weight={isActive ? "fill" : "regular"} />
              )}
            </span>
            <div className="pt-1">
              <p className={`font-medium ${isDone || isActive ? "text-ink" : "text-muted"}`}>
                {step.label}
                {isActive && <span className="sr-only"> (in progress)</span>}
              </p>
              <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
