import { CheckCircle, Question, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { PublishedRecord } from "@verisci/agents";
import {
  knowledgeAssetToken,
  parseUal,
  SUBMISSION_DOMAIN,
  submissionTypedData,
} from "@verisci/core";
import { addressUrl, assetTokenUrl, ipfsUrl } from "../lib/explorer.ts";
import { CopyValue } from "./copy-value.tsx";

/** The signature's EIP-712 domain and type, as `@verisci/core`'s `submissionTypedData` builds them. */
const EIP712_DOMAIN = `{ name: "${SUBMISSION_DOMAIN.name}", version: "${SUBMISSION_DOMAIN.version}", chainId: ${SUBMISSION_DOMAIN.chainId} }`;
/** The type as EIP-712 encodes it (no spaces after commas), from the fields that are signed. */
const EIP712_TYPE = `Submission(${submissionTypedData({ cid: "", contextGraph: "", deadline: 0n })
  .types.Submission.map((field) => `${field.type} ${field.name}`)
  .join(",")})`;

const CHECK = {
  valid: {
    icon: CheckCircle,
    text: "The signature matches the submitter",
    tone: "bg-accent-soft text-accent",
  },
  invalid: {
    icon: XCircle,
    text: "The signature does not match the submitter",
    tone: "bg-danger-soft text-danger",
  },
  unknown: {
    icon: Question,
    text: "We couldn't check the signature right now",
    tone: "bg-surface-strong text-muted",
  },
} as const;

/**
 * Everything anyone needs to check a published paper without trusting VeriSci: who
 * submitted it and their signature (checked when read), who minted it, its ERC-721 token, the
 * record's UAL
 * and the PDF's CID, with how to check them.
 */
export function VerifyPanel({
  record,
  ual,
  cid,
  contextGraph,
}: {
  record: PublishedRecord;
  ual: string;
  cid: string;
  /** VeriSci's context graph id, canonical: the asset's graph, and part of what was signed. */
  contextGraph: string;
}) {
  const check = CHECK[record.signatureCheck];
  const parsed = parseUal(ual);
  const token = parsed.ok ? knowledgeAssetToken(parsed.ual) : undefined;
  return (
    <section className="glass grid gap-6 rounded-2xl p-5 sm:p-6" aria-labelledby="verify-title">
      <div className="grid gap-1">
        <h2 id="verify-title" className="text-lg font-semibold">
          Verify it yourself
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          These values are public. You can check each one without trusting us.
        </p>
      </div>
      <p
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${check.tone}`}
      >
        <check.icon size={18} weight="fill" className="shrink-0" />
        {check.text}
      </p>
      <dl className="grid gap-5">
        <CopyValue
          label="Submitted by"
          value={record.submitter}
          href={addressUrl(record.submitter)}
        />
        <CopyValue label="Submitter's signature" value={record.signature} />
        <CopyValue label="Signed deadline (Unix seconds)" value={record.deadline} />
        <CopyValue label="Context graph" value={contextGraph} head={22} />
        {record.publisher && (
          <CopyValue
            label="Minted to VeriSci's node"
            value={record.publisher}
            href={addressUrl(record.publisher)}
          />
        )}
        {token && (
          <CopyValue
            label="Asset token (ERC-721, OriginTrail's DKGKnowledgeAssets)"
            value={token.tokenId.toString()}
            href={assetTokenUrl(ual)}
          />
        )}
        <CopyValue label="Knowledge Asset (UAL)" value={ual} head={22} />
        <CopyValue label="PDF (CID)" value={cid} href={ipfsUrl(cid)} />
      </dl>
      <details className="group rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium marker:text-muted">
          How to check this record
        </summary>
        <ol className="mt-3 grid list-decimal gap-2 pl-5 leading-relaxed text-muted">
          <li>
            Subscribe a DKG node to the context graph above and fetch the asset by its UAL: a UAL
            alone does not name its graph. The node returns the title, authors, PDF link, submitter,
            signature and deadline.
          </li>
          <li>
            Check the signature. It's EIP-712 typed data with the domain{" "}
            <code className="font-mono text-xs text-ink">{EIP712_DOMAIN}</code> and the type{" "}
            <code className="font-mono text-xs text-ink">{EIP712_TYPE}</code>. Any EIP-712 library
            recovers the signer to compare with the submitter; a smart-contract wallet is checked on
            chain with ERC-1271.
          </li>
          <li>
            Download the PDF by its CID. An IPFS client checks every block against its hash, so a
            changed file can't come back under this CID. To recompute the CID from a local copy, use
            Pinata's v1 import settings: CIDv1, raw leaves, 256 KiB chunks.
          </li>
          <li>
            Open the asset token on Basescan. It's an ERC-721 token in OriginTrail's
            DKGKnowledgeAssets contract, minted to VeriSci's node, and its page shows when. The
            merkle root of the asset's statements is anchored with it, so any node can check that
            the content still matches.
          </li>
        </ol>
      </details>
    </section>
  );
}
