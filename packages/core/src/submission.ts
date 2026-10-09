import { BASE_SEPOLIA_CHAIN_ID } from "./chains.ts";

/** What a submitter signs to publish a PDF (ADR 0010). */
export interface SubmissionMessage {
  /** The PDF's CID, canonical CIDv1 base32 (as in its Target KA name). */
  readonly cid: string;
  /** The full context graph id the paper is published to, so a signature serves one environment. */
  readonly contextGraph: string;
  /** Unix seconds after which the signature is refused. */
  readonly deadline: bigint;
}

/**
 * verisci's EIP-712 domain: no `verifyingContract`, since a submission calls no contract
 * (ADR 0010).
 */
export const SUBMISSION_DOMAIN = {
  name: "verisci",
  version: "1",
  chainId: BASE_SEPOLIA_CHAIN_ID,
} as const;

const SUBMISSION_TYPES = {
  Submission: [
    { name: "cid", type: "string" },
    { name: "contextGraph", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * The EIP-712 typed data a submitter signs for `message`, in the shape viem's
 * `signTypedData` and `verifyTypedData` take.
 */
export function submissionTypedData(message: SubmissionMessage) {
  return {
    domain: SUBMISSION_DOMAIN,
    types: SUBMISSION_TYPES,
    primaryType: "Submission",
    message: { cid: message.cid, contextGraph: message.contextGraph, deadline: message.deadline },
  } as const;
}
