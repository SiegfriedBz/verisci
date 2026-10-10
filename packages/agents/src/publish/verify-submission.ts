import { canonicalContextGraph, submissionTypedData, targetKaName } from "@verisci/core";
import {
  type Address,
  type Hex,
  isAddressEqual,
  type PublicClient,
  recoverTypedDataAddress,
} from "viem";
import { z } from "zod";

/** A submission whose signature checked out, as recorded in its Target KA. */
export interface VerifiedSubmission {
  /** Canonical CIDv1 base32. */
  readonly cid: string;
  readonly contextGraph: string;
  /** Unix seconds, as a decimal string (events carry JSON, which has no bigint). */
  readonly deadline: string;
  /** Lowercase. */
  readonly submitter: string;
  readonly signature: string;
}

/** Why a submission is refused; none of them changes on a retry. */
export type SubmissionRefusal =
  | "malformed"
  | "bad-cid"
  | "wrong-graph"
  | "expired"
  | "bad-signature";

/** The result of {@link verifySubmission}: `unreachable` (the chain could not be asked) is worth a retry. */
export type VerifyResult =
  | { readonly ok: true; readonly submission: VerifiedSubmission }
  | { readonly ok: false; readonly reason: SubmissionRefusal | "unreachable" };

/** What {@link verifySubmission} checks against. */
export interface VerifyOptions {
  /** This environment's context graph id: a signature for another one is refused. */
  readonly contextGraph: string;
  /** Asks the chain about smart-contract wallets (ERC-1271, ERC-6492). */
  readonly client: Pick<PublicClient, "verifyTypedData" | "getBlockNumber">;
  /** The current time in milliseconds. */
  readonly now: () => number;
}

/** The longest a signature may stay valid, in seconds: an upload page asks for minutes. */
const MAX_SIGNATURE_LIFETIME_S = 86_400n;

const eventData = z.object({
  cid: z.string(),
  contextGraph: z.string(),
  deadline: z.string().regex(/^\d{1,78}$/),
  submitter: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]*$/),
});

/**
 * Checks a `verisci/paper.submitted` event's data: the CID is canonical CIDv1 base32, the
 * context graph is this environment's, the deadline is ahead of `now` by at most a day
 * (further ahead is `malformed`), and the submitter
 * signed `{ cid, contextGraph, deadline }` under verisci's EIP-712 domain (ADR 0010).
 *
 * An EOA signature is checked locally; any other is asked of the chain, so smart-contract
 * wallets verify too. Never throws for an expected failure.
 */
export async function verifySubmission(
  data: unknown,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const parsed = eventData.safeParse(data);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  const { cid, contextGraph, deadline, submitter, signature } = parsed.data;

  const name = targetKaName(cid);
  if (!name.ok || name.name !== `verisci-tka-${cid}`) return { ok: false, reason: "bad-cid" };
  const graph = canonicalContextGraph(contextGraph);
  if (graph !== canonicalContextGraph(options.contextGraph))
    return { ok: false, reason: "wrong-graph" };
  const nowS = BigInt(options.now()) / 1000n;
  if (BigInt(deadline) <= nowS) return { ok: false, reason: "expired" };
  if (BigInt(deadline) > nowS + MAX_SIGNATURE_LIFETIME_S) return { ok: false, reason: "malformed" };

  const typedData = submissionTypedData({ cid, contextGraph: graph, deadline: BigInt(deadline) });
  // Lowercase has no checksum to fail, so viem accepts any casing of a valid address.
  const address = submitter.toLowerCase() as Address;
  const verified =
    (await signedBy(address, typedData, signature as Hex)) ||
    (await askChain(options.client, address, typedData, signature as Hex));
  if (verified === "unreachable") return { ok: false, reason: "unreachable" };
  if (!verified) return { ok: false, reason: "bad-signature" };

  return {
    ok: true,
    submission: {
      cid,
      contextGraph: graph,
      deadline,
      submitter: address,
      signature: signature.toLowerCase(),
    },
  };
}

type TypedData = ReturnType<typeof submissionTypedData>;

async function signedBy(address: Address, typedData: TypedData, signature: Hex): Promise<boolean> {
  try {
    return isAddressEqual(address, await recoverTypedDataAddress({ ...typedData, signature }));
  } catch {
    return false;
  }
}

async function askChain(
  client: VerifyOptions["client"],
  address: Address,
  typedData: TypedData,
  signature: Hex,
): Promise<boolean | "unreachable"> {
  try {
    if (await client.verifyTypedData({ ...typedData, address, signature })) return true;
  } catch {
    // An error thrown before or during the call: the chain's answer below tells which.
  }
  // viem reads a failed call as an invalid signature: tell an outage from a refusal.
  try {
    await client.getBlockNumber({ cacheTime: 0 });
    return false;
  } catch {
    return "unreachable";
  }
}
