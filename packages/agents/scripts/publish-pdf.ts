// Dev only: pins a PDF on Pinata's public network, signs it with a throwaway key and sends
// `verisci/paper.submitted` to the local Inngest dev server. The upload page replaces it.
//
//   pnpm --filter @verisci/agents publish-pdf <file.pdf>
//
// Reads PINATA_JWT and the DKG settings from the root .env.local (packages/agents README).
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { submissionTypedData, targetKaName } from "@verisci/core";
import { createDkgEnv } from "@verisci/dkg";
import { defineEnv } from "@verisci/env";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { inngest } from "../src/inngest.ts";
import { PAPER_SUBMITTED } from "../src/publish/publish-paper.ts";

/** Pinata's v3 upload; `cid_version` is pinned so one PDF always gets one CID (docs/domain.md → IPFS). */
const PINATA_UPLOAD = "https://uploads.pinata.cloud/v3/files";
const SIGNATURE_LIFETIME_S = 3600n;

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm --filter @verisci/agents publish-pdf <file.pdf>");
  process.exit(1);
}

const env = defineEnv({
  extends: [createDkgEnv()],
  server: { PINATA_JWT: z.string().min(1) },
  runtimeEnv: process.env,
});

const form = new FormData();
form.append("file", new Blob([await readFile(file)], { type: "application/pdf" }), basename(file));
form.append("network", "public");
form.append("cid_version", "v1");
form.append("name", basename(file));
const upload = await fetch(PINATA_UPLOAD, {
  method: "POST",
  headers: { authorization: `Bearer ${env.PINATA_JWT}` },
  body: form,
});
if (!upload.ok) {
  console.error(`Pinata refused the upload: ${upload.status} ${await upload.text()}`);
  process.exit(1);
}
const pinned = z.object({ data: z.object({ cid: z.string() }) }).parse(await upload.json());

const name = targetKaName(pinned.data.cid);
if (!name.ok) {
  console.error(`Pinata returned a CID verisci cannot name: ${pinned.data.cid}`);
  process.exit(1);
}
const cid = name.name.replace(/^verisci-tka-/, "");

const submitter = privateKeyToAccount(generatePrivateKey());
const deadline = BigInt(Math.floor(Date.now() / 1000)) + SIGNATURE_LIFETIME_S;
const signature = await submitter.signTypedData(
  submissionTypedData({ cid, contextGraph: env.DKG_CONTEXT_GRAPH, deadline }),
);

const eventId = `paper:${cid}:${submitter.address.toLowerCase()}`;
await inngest.send({
  id: eventId,
  name: PAPER_SUBMITTED,
  data: {
    cid,
    contextGraph: env.DKG_CONTEXT_GRAPH,
    deadline: deadline.toString(),
    submitter: submitter.address,
    signature,
  },
});

console.log(`Pinned        ${pinned.data.cid}`);
console.log(`Target KA     ${name.name}`);
console.log(`Submitter     ${submitter.address} (throwaway key)`);
console.log(`Event sent    ${eventId}`);
console.log("Watch the run at http://localhost:8288");
