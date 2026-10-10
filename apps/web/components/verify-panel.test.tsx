import { cleanup, render, screen } from "@testing-library/react";
import type { PublishedRecord } from "@verisci/workflows";
import { afterEach, describe, expect, it } from "vitest";
import { VerifyPanel } from "./verify-panel.tsx";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const RECORD: PublishedRecord = {
  title: "Screening VP1",
  authors: ["Di Liu"],
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
};

describe("VerifyPanel", () => {
  afterEach(cleanup);

  it("shows the EIP-712 type exactly as it is hashed", () => {
    render(
      <VerifyPanel record={RECORD} ual={UAL} cid={CID} contextGraph="0xd701/verisci-staging" />,
    );

    const type = screen.getByText(/^Submission\(/).textContent ?? "";
    expect(type).toBe("Submission(string cid,string contextGraph,uint256 deadline)");
  });

  it("links the paper's ERC-721 token on Basescan", () => {
    render(
      <VerifyPanel record={RECORD} ual={UAL} cid={CID} contextGraph="0xd701/verisci-staging" />,
    );

    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(
      links.some((href) => href?.includes("/nft/0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0/")),
    ).toBe(true);
  });
});
