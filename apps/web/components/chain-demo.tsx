"use client";

import { useEffect, useState } from "react";
import type { PaperStage } from "../lib/progress.ts";
import { ProgressChain } from "./progress-chain.tsx";

const LOOP: PaperStage["stage"][] = ["reading", "saving", "minting", "published"];
const STEP_MS = 1800;

/**
 * The publish chain playing on a loop, for the home page: it shows what happens to a paper.
 * Still at "minting" for visitors who ask for reduced motion.
 */
export function ChainDemo() {
  const [index, setIndex] = useState(2);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % LOOP.length), STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return <ProgressChain stage={LOOP[index] ?? "minting"} />;
}
