"use client";

import { FilePdf, UploadSimple, Warning } from "@phosphor-icons/react";
import { useAppKit } from "@reown/appkit/react";
import { useRouter } from "next/navigation";
import { type DragEvent, useId, useState } from "react";
import { BaseError, UserRejectedRequestError } from "viem";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { requestUpload, submitPaper } from "../app/actions.ts";
import { type PublishProblem, publishProblemMessage } from "../lib/messages.ts";
import { type Phase, publishFile, uploadToSignedUrl } from "../lib/publish-flow.ts";
import { useWalletReady } from "./providers.tsx";

const BASE_SEPOLIA = 84532;

/** What the server tells the form: the graph to sign for and the limits to check early. */
export interface PublishSettings {
  readonly contextGraph: string;
  readonly maxBytes: number;
  readonly signatureLifetimeS: number;
}

const PHASE_TEXT: Record<Phase, string> = {
  uploading: "Uploading your PDF",
  signing: "Confirm the signature in your wallet",
  submitting: "Checking your submission",
};

/** The publish form, or a note when the wallet window is not set up on this server. */
export function PublishForm(settings: PublishSettings) {
  if (!useWalletReady()) {
    return (
      <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
        Wallet connection isn't set up on this server yet, so papers can't be published here.
      </p>
    );
  }
  return <PublishFlow {...settings} />;
}

function PublishFlow({ contextGraph, maxBytes, signatureLifetimeS }: PublishSettings) {
  const router = useRouter();
  const inputId = useId();
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [phase, setPhase] = useState<Phase | undefined>();
  const [problem, setProblem] = useState<PublishProblem | undefined>();
  const [file, setFile] = useState<File | undefined>();
  const [dragging, setDragging] = useState(false);
  const busy = phase !== undefined;

  const publish = async (chosen: File) => {
    setFile(chosen);
    setProblem(undefined);
    const result = await publishFile(chosen, {
      contextGraph,
      maxBytes,
      signatureLifetimeS,
      now: Date.now,
      requestUpload: () => requestUpload(),
      upload: (url, pdf) => uploadToSignedUrl(url, pdf),
      sign: async (typedData) => {
        if (!address) return { ok: false };
        try {
          if (chainId !== BASE_SEPOLIA) await switchChainAsync({ chainId: BASE_SEPOLIA });
          const signature = await signTypedDataAsync({ ...typedData, account: address });
          return { ok: true, address, signature };
        } catch (error) {
          if (
            error instanceof BaseError &&
            error.walk((cause) => cause instanceof UserRejectedRequestError)
          ) {
            return { ok: false };
          }
          throw error;
        }
      },
      submit: (submission) => submitPaper(submission),
      onPhase: setPhase,
    });
    if (result.ok) {
      router.push(`/papers/${result.cid}?event=${result.eventId}`);
      return;
    }
    setPhase(undefined);
    setProblem(result.problem);
  };

  const choose = (chosen: File | undefined) => {
    if (chosen && !busy) void publish(chosen);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  if (!isConnected) {
    return (
      <div className="grid gap-4 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-muted">Connect a wallet to publish.</p>
        <button
          type="button"
          onClick={() => void open()}
          className="w-fit rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-ink transition active:scale-[0.98]"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-busy={busy}
        className={`grid min-h-64 cursor-pointer place-items-center rounded-xl border-2 border-dashed p-6 text-center transition sm:p-10 ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-muted"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        {phase && file ? (
          <div className="grid justify-items-center gap-3">
            <FilePdf size={36} className="text-accent" />
            <p className="max-w-full truncate font-medium">{file.name}</p>
            <p className="step-active rounded-xl bg-accent-soft px-3 py-1 text-sm text-accent">
              {PHASE_TEXT[phase]}
            </p>
          </div>
        ) : (
          <div className="grid justify-items-center gap-3">
            <UploadSimple size={36} className="text-muted" />
            <p className="font-medium">Drop your paper here, or tap to choose a PDF</p>
            <p className="text-sm text-muted">One PDF, up to 30 MB</p>
          </div>
        )}
        <input
          id={inputId}
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {problem && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <Warning size={18} className="mt-px shrink-0" />
          {publishProblemMessage(problem)}
        </p>
      )}
    </div>
  );
}
