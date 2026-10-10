import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found · VeriSci" };

/** Any address with no page: where to go instead. */
export default function NotFound() {
  return (
    <section className="enter grid max-w-[52ch] gap-5 py-10">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">This page doesn't exist</h1>
      <p className="leading-relaxed text-muted">
        The link may be mistyped. A paper's page lives at its PDF's CID, which you get after
        publishing it.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 font-medium transition hover:border-line-strong active:scale-[0.98]"
        >
          Home
        </Link>
        <Link
          href="/publish"
          className="signal-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-accent-ink transition hover:brightness-110 active:scale-[0.98]"
        >
          Publish a paper
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </section>
  );
}
