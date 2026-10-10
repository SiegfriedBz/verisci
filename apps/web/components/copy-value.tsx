"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

/** The first and last characters of a long on-chain value, joined by an ellipsis. */
export function shorten(value: string, head = 14, tail = 8): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** A labelled on-chain value in short form, with a button that copies it in full. */
export function CopyValue({
  label,
  value,
  head,
}: {
  label: string;
  value: string;
  /** How many leading characters the short form keeps. */
  head?: number;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 truncate font-mono text-sm" title={value}>
          {shorten(value, head)}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:text-ink active:scale-[0.96]"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </dd>
    </div>
  );
}
