import { functions, inngest } from "@verisci/agents";
import { serve } from "inngest/next";

/** Serves the agents' Inngest functions; the workflows themselves live in `@verisci/agents` (ADR 0003). */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
