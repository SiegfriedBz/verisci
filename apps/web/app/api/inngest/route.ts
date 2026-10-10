import { functions, inngest } from "@verisci/agents";
import { serve } from "inngest/next";

/** Serves the agents' Inngest functions; the workflows themselves live in `@verisci/agents` (ADR 0003). */
/** A step may take up to Vercel Hobby's 300 s limit (`docs/domain.md` → Inngest and Vercel). */
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
