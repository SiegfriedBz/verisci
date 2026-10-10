"use client";

import { Warning } from "@phosphor-icons/react";

/** A page that failed to render: says so plainly and offers to try again. */
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="enter grid max-w-[52ch] gap-5 py-10">
      <Warning size={28} className="text-danger" />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">This page didn't load</h1>
      <p className="leading-relaxed text-muted">
        Something on our side failed. Nothing you published is lost: records live on the DKG, not on
        this site.
      </p>
      <button
        type="button"
        onClick={retry}
        className="w-fit rounded-xl border border-line px-4 py-2.5 font-medium transition hover:border-line-strong active:scale-[0.98]"
      >
        Try again
      </button>
    </section>
  );
}
