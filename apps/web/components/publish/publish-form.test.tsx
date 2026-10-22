import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UserRejectedRequestError } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const runtime = {
  open: vi.fn(async () => {}),
  account: vi.fn(() => ({ address: ADDRESS, chainId: 1 as number | undefined })),
  switchChain: vi.fn(async (_chainId: number) => {}),
  signTypedData: vi.fn(async (_request: unknown) => "0x5167" as `0x${string}`),
};
const load = vi.fn(async () => runtime);
const preload = vi.fn();
let wallet: Record<string, unknown> = { status: "idle" };
let walletReady = true;
vi.mock("../wallet/providers.tsx", () => ({
  useWalletReady: () => walletReady,
  useWallet: () => ({ load, preload, ...wallet }),
}));
vi.mock("../../app/actions.ts", () => ({ requestUpload: vi.fn(), submitPaper: vi.fn() }));
type Sign = (typedData: Record<string, unknown>) => Promise<unknown>;
const publishFile = vi.fn(
  async (_file: File, _deps: { sign: Sign }) => new Promise<never>(() => {}),
);
vi.mock("../../lib/publish/publish-flow.ts", () => ({ publishFile, uploadToSignedUrl: vi.fn() }));

const { PublishForm } = await import("./publish-form.tsx");

const SETTINGS = {
  contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
  maxBytes: 20 * 1024 * 1024,
  signatureLifetimeS: 600,
};

const TYPED_DATA = {
  domain: { name: "labstrail", version: "1", chainId: 84532 },
  types: { Submission: [{ name: "cid", type: "string" }] },
  primaryType: "Submission",
  message: { cid: "bafy" },
};

/** Drops a PDF in the connected form and returns the `sign` the form gave `publishFile`. */
async function signOfChosenFile(): Promise<Sign> {
  const { container } = render(<PublishForm {...SETTINGS} />);
  const input = container.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("no file input");
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(["%PDF-1.7"], "paper.pdf", { type: "application/pdf" })] },
    });
  });
  const deps = publishFile.mock.calls[0]?.[1];
  if (!deps) throw new Error("publishFile was not called");
  return deps.sign;
}

describe("PublishForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    wallet = { status: "idle" };
    walletReady = true;
  });

  it("says publishing is off, with no Connect, when the wallet isn't set up on this server", () => {
    walletReady = false;
    render(<PublishForm {...SETTINGS} />);

    expect(screen.getByText(/Wallet connection isn't set up on this server yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("before the wallet loads, asks to connect, and a click loads it and opens AppKit's window", async () => {
    render(<PublishForm {...SETTINGS} />);

    expect(screen.getByText("Connect a wallet to publish.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    });
    expect(load).toHaveBeenCalledOnce();
    expect(runtime.open).toHaveBeenCalledOnce();
  });

  it("preloads the wallet when the pointer or focus reaches Connect", () => {
    render(<PublishForm {...SETTINGS} />);
    const button = screen.getByRole("button", { name: "Connect wallet" });

    fireEvent.pointerEnter(button);
    fireEvent.focus(button);

    expect(preload).toHaveBeenCalledTimes(2);
  });

  it("marks its Connect panel for the page's pre-paint look", () => {
    const { container } = render(<PublishForm {...SETTINGS} />);

    expect(container.querySelector('[data-wallet-connect="panel"]')).not.toBeNull();
  });

  it("shows a skeleton of the drop zone while a stored session is restored", () => {
    wallet = { status: "restoring" };
    render(<PublishForm {...SETTINGS} />);

    expect(screen.getByRole("status", { name: "Loading your wallet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
  });

  it("says the wallet couldn't load, and a click on Connect tries again", async () => {
    wallet = { status: "failed" };
    render(<PublishForm {...SETTINGS} />);

    expect(
      screen.getByText("The wallet couldn't load. Check your connection and try again."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it("once connected, switches to Base Sepolia first, then signs as the connected address", async () => {
    wallet = { status: "connected", account: { address: ADDRESS, chainId: 1 }, runtime };
    const sign = await signOfChosenFile();

    expect(await sign(TYPED_DATA)).toEqual({ ok: true, address: ADDRESS, signature: "0x5167" });
    expect(runtime.switchChain).toHaveBeenCalledWith(84532);
    expect(runtime.signTypedData).toHaveBeenCalledWith({ ...TYPED_DATA, account: ADDRESS });
  });

  it("signs without switching when the wallet is already on Base Sepolia", async () => {
    runtime.account.mockReturnValue({ address: ADDRESS, chainId: 84532 });
    wallet = { status: "connected", account: { address: ADDRESS, chainId: 84532 }, runtime };
    const sign = await signOfChosenFile();

    await sign(TYPED_DATA);
    expect(runtime.switchChain).not.toHaveBeenCalled();
    runtime.account.mockReturnValue({ address: ADDRESS, chainId: 1 });
  });

  it("reads a signature declined in the wallet as declined, not as an error", async () => {
    runtime.signTypedData.mockRejectedValueOnce(
      new UserRejectedRequestError(new Error("User rejected the request.")),
    );
    wallet = { status: "connected", account: { address: ADDRESS, chainId: 84532 }, runtime };
    const sign = await signOfChosenFile();

    expect(await sign(TYPED_DATA)).toEqual({ ok: false });
  });
});
