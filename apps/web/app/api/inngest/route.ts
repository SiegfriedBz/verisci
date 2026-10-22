import { functions, inngest } from "@labstrail/workflows";
import { serve } from "inngest/next";

/** A step may take up to Vercel Hobby's 300 s limit (`docs/domain.md` → Inngest and Vercel). */
export const maxDuration = 300;

/** Serves the Inngest functions, defined in `@labstrail/workflows` (ADR 0003). */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
