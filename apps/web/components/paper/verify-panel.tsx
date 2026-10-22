import {
  knowledgeAssetToken,
  parseUal,
  SUBMISSION_DOMAIN,
  submissionTypedData,
} from "@labstrail/core";
import type { PublishedRecord } from "@labstrail/workflows";
import { CheckCircle, Question, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { addressUrl, assetTokenUrl, ipfsUrl } from "../../lib/papers/explorer.ts";
import { CopyValue } from "./copy-value.tsx";
import { VERIFY_GROUPS, VERIFY_INTRO, VERIFY_LABELS, VERIFY_TITLE } from "./labels.ts";

/** The signature's EIP-712 domain and type, as `@labstrail/core`'s `submissionTypedData` builds them. */
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
 * Everything anyone needs to check a published paper without trusting LabsTrail, in two
 * groups: the submission (who submitted it, their signature, checked when read, its deadline
 * and the context graph it was signed for), then the asset (who minted it, its ERC-721
 * token, the record's UAL and the PDF's CID), with how to check them.
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
  /** LabsTrail's context graph id, canonical: the asset's graph, and part of what was signed. */
  contextGraph: string;
}) {
  const check = CHECK[record.signatureCheck];
  const parsed = parseUal(ual);
  const token = parsed.ok ? knowledgeAssetToken(parsed.ual) : undefined;
  return (
    <section className="glass grid gap-6 rounded-2xl p-5 sm:p-6" aria-labelledby="verify-title">
      <div className="grid gap-1">
        <h2 id="verify-title" className="text-lg font-semibold">
          {VERIFY_TITLE}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{VERIFY_INTRO}</p>
      </div>
      <p
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${check.tone}`}
      >
        <check.icon size={18} weight="fill" className="shrink-0" />
        {check.text}
      </p>
      <VerifyGroup group="submission">
        <CopyValue
          label={VERIFY_LABELS.submitter}
          value={record.submitter}
          href={addressUrl(record.submitter)}
        />
        <CopyValue label={VERIFY_LABELS.signature} value={record.signature} />
        <CopyValue label={VERIFY_LABELS.deadline} value={record.deadline} />
        <CopyValue label={VERIFY_LABELS.contextGraph} value={contextGraph} head={22} />
      </VerifyGroup>
      <VerifyGroup group="asset">
        {record.publisher && (
          <CopyValue
            label={VERIFY_LABELS.publisher}
            value={record.publisher}
            href={addressUrl(record.publisher)}
          />
        )}
        {token && (
          <CopyValue
            label={VERIFY_LABELS.token}
            value={token.tokenId.toString()}
            href={assetTokenUrl(ual)}
          />
        )}
        <CopyValue label={VERIFY_LABELS.ual} value={ual} head={22} />
        <CopyValue label={VERIFY_LABELS.pdf} value={cid} href={ipfsUrl(cid)} />
      </VerifyGroup>
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
            DKGKnowledgeAssets contract, minted to LabsTrail's node, and its page shows when. The
            merkle root of the asset's statements is anchored with it, so any node can check that
            the content still matches.
          </li>
        </ol>
      </details>
    </section>
  );
}

/** Each group's edge: the submission lives in the off-chain record, the asset is minted on-chain. */
const GROUP_EDGE = { submission: "border-accent/50", asset: "border-accent-2/50" } as const;

/**
 * One of `VerifyPanel`'s groups: its heading, then its fields as a list of terms. The
 * skeleton (`PaperSkeleton`) uses it too, so both show the same groups; there its title is a
 * paragraph (`heading={false}`), so no heading comes before the paper's `h1`.
 */
export function VerifyGroup({
  group,
  heading = true,
  children,
}: {
  group: keyof typeof VERIFY_GROUPS;
  /** Title the group with an `h3`, or a paragraph. */
  heading?: boolean;
  children: ReactNode;
}) {
  const id = `verify-${group}`;
  const Title = heading ? "h3" : "p";
  return (
    // biome-ignore lint/a11y/useSemanticElements: read-only values, not form controls; a fieldset's legend sits outside its grid
    <div role="group" aria-labelledby={id} className="grid gap-4">
      <Title id={id} className="text-sm font-semibold">
        {VERIFY_GROUPS[group]}
      </Title>
      <dl className={`grid gap-5 border-l-2 pl-4 ${GROUP_EDGE[group]}`}>{children}</dl>
    </div>
  );
}
