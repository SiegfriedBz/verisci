import { getUploadService, PUBLISH_SETTINGS, UPLOAD_SETTINGS } from "@verisci/agents";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PublishForm } from "../../components/publish-form.tsx";

export const metadata: Metadata = { title: "Publish a paper · verisci" };

/** The publish page: the graph to sign for comes from the server's settings (ADR 0005). */
export default async function PublishPage() {
  await connection();
  const { contextGraph } = getUploadService();
  return (
    <div className="grid items-start gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
      <div className="grid content-start gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Publish a paper</h1>
        <p className="max-w-[48ch] text-muted">
          You'll sign one message with your wallet. It costs nothing and sends no transaction. The
          signature shows on the record, so anyone can check you submitted it.
        </p>
      </div>
      <PublishForm
        contextGraph={contextGraph}
        maxBytes={PUBLISH_SETTINGS.maxPdfBytes}
        signatureLifetimeS={UPLOAD_SETTINGS.signatureLifetimeS}
      />
    </div>
  );
}
