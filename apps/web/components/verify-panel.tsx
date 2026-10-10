import { CheckCircle, Question, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { PublishedRecord } from "@verisci/agents";
import { addressUrl } from "../lib/explorer.ts";
import { CopyValue } from "./copy-value.tsx";

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
 * Everything anyone needs to check a published paper without trusting verisci: who
 * submitted it and their signature (checked when read), who minted it, the record's UAL
 * and the PDF's CID, with how to check them.
 */
export function VerifyPanel({
  record,
  ual,
  cid,
}: {
  record: PublishedRecord;
  ual: string;
  cid: string;
}) {
  const check = CHECK[record.signatureCheck];
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
        {record.publisher && (
          <CopyValue
            label="Minted by verisci's node"
            value={record.publisher}
            href={addressUrl(record.publisher)}
          />
        )}
        <CopyValue label="Record (UAL)" value={ual} head={22} />
        <CopyValue label="PDF (CID)" value={cid} href={`https://ipfs.io/ipfs/${cid}`} />
      </dl>
      <details className="group rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium marker:text-muted">
          How to check this record
        </summary>
        <ol className="mt-3 grid list-decimal gap-2 pl-5 leading-relaxed text-muted">
          <li>
            Ask any OriginTrail DKG node for the record by its UAL. It returns the title, authors,
            the PDF link, the submitter and their signature.
          </li>
          <li>
            Check the signature against the submitter's address. It's a standard EIP-712 signature
            over the PDF's CID, the graph and a deadline, so any wallet library can verify it.
          </li>
          <li>
            Download the PDF by its CID and hash it. The same bytes always give the same CID, so a
            changed file can't pass.
          </li>
          <li>
            The record's fingerprint is anchored on Base. The node's Basescan page lists the mint
            transactions, so you can see when it was recorded.
          </li>
        </ol>
      </details>
    </section>
  );
}
