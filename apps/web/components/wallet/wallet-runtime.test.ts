import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const wagmiConfig = { id: "wagmi-config" };

let ready: Promise<void> = Promise.resolve();
const open = vi.fn(async () => {});
const setThemeMode = vi.fn();
const createAppKit = vi.fn((_options: Record<string, unknown>) => ({
  ready: () => ready,
  open,
  setThemeMode,
}));
const getAccount = vi.fn(() => ({
  address: undefined as string | undefined,
  chainId: undefined as number | undefined,
  isConnected: false,
}));
const unwatch = vi.fn();
const watchAccount = vi.fn((_config: unknown, _options: { onChange: () => void }) => unwatch);
const switchChain = vi.fn(async () => ({}));
const signTypedData = vi.fn(async () => "0x5167");
const writeContract = vi.fn(async () => "0xabc1");
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success", logs: [] }));

vi.mock("@reown/appkit", () => ({ createAppKit }));
vi.mock("@reown/appkit/networks", () => ({
  baseSepolia: { id: 84532 },
  foundry: {
    id: 31337,
    name: "Foundry",
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  },
}));
const adapterOptions = vi.fn();
vi.mock("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    wagmiConfig = wagmiConfig;
    constructor(options: unknown) {
      adapterOptions(options);
    }
  },
}));
const baseAccount = vi.fn((parameters: unknown) => ({ connector: "baseAccount", parameters }));
const coinbaseWallet = vi.fn((parameters: unknown) => ({
  connector: "coinbaseWallet",
  parameters,
}));
vi.mock("wagmi/connectors", () => ({ baseAccount, coinbaseWallet }));
vi.mock("wagmi/actions", () => ({
  getAccount,
  watchAccount,
  switchChain,
  signTypedData,
  writeContract,
  waitForTransactionReceipt,
}));

const { createWalletRuntime, walletNetworks } = await import("./wallet-runtime.ts");

const SETTINGS = { projectId: "test-project", theme: "dark" as const };

describe("createWalletRuntime", () => {
  beforeEach(() => {
    ready = Promise.resolve();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves only once AppKit is ready, its stored session restored", async () => {
    let finish: () => void = () => {};
    ready = new Promise((resolve) => {
      finish = resolve;
    });
    let resolved = false;

    const runtime = createWalletRuntime(SETTINGS).then((value) => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    finish();

    await runtime;
    expect(resolved).toBe(true);
  });

  it("goes on after 8 seconds when AppKit's set-up hangs, since its window can open", async () => {
    vi.useFakeTimers();
    ready = new Promise(() => {});
    let resolved = false;

    const runtime = createWalletRuntime(SETTINGS).then((value) => {
      resolved = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(runtime).resolves.toBeDefined();
  });

  it("still resolves when AppKit's set-up fails part-way, since its window can open", async () => {
    ready = Promise.reject(new Error("remote config unavailable"));

    await expect(createWalletRuntime(SETTINGS)).resolves.toBeDefined();
  });

  it("sets AppKit up in the page's theme, with its analytics off and Base Sepolia first", async () => {
    await createWalletRuntime(SETTINGS);

    const options = createAppKit.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      projectId: "test-project",
      themeMode: "dark",
      features: { analytics: false },
      defaultNetwork: { id: 84532 },
      networks: [{ id: 84532 }],
    });
  });

  it("offers Coinbase's two sign-ins with their SDKs' analytics off, and no copies of AppKit's", async () => {
    await createWalletRuntime(SETTINGS);

    expect(baseAccount).toHaveBeenCalledWith({ preference: { telemetry: false } });
    expect(coinbaseWallet).toHaveBeenCalledWith({
      preference: { options: "all", telemetry: false },
    });
    expect(adapterOptions).toHaveBeenCalledWith({
      projectId: "test-project",
      networks: [{ id: 84532 }],
      connectors: [baseAccount.mock.results[0]?.value, coinbaseWallet.mock.results[0]?.value],
    });
    expect(createAppKit.mock.calls[0]?.[0]).toMatchObject({ enableCoinbase: false });
  });

  it("reads the connected account, and none when the wallet isn't connected", async () => {
    const runtime = await createWalletRuntime(SETTINGS);

    expect(runtime.account()).toBeUndefined();
    getAccount.mockReturnValueOnce({ address: ADDRESS, chainId: 84532, isConnected: true });
    expect(runtime.account()).toEqual({ address: ADDRESS, chainId: 84532 });
  });

  it("tells a listener when the account changes, until it unsubscribes", async () => {
    const runtime = await createWalletRuntime(SETTINGS);
    const listener = vi.fn();

    const unsubscribe = runtime.subscribe(listener);
    watchAccount.mock.calls[0]?.[1].onChange();
    unsubscribe();

    expect(watchAccount.mock.calls[0]?.[0]).toBe(wagmiConfig);
    expect(listener).toHaveBeenCalledOnce();
    expect(unwatch).toHaveBeenCalledOnce();
  });

  it("opens the window, switches chain, signs, sends and waits through wagmi's config", async () => {
    const runtime = await createWalletRuntime(SETTINGS);
    const typedData = {
      domain: { name: "labstrail", version: "1", chainId: 84532 },
      types: { Submission: [{ name: "cid", type: "string" }] },
      primaryType: "Submission",
      message: { cid: "bafy" },
      account: ADDRESS,
    } as const;

    await runtime.open();
    await runtime.switchChain(84532);
    expect(await runtime.signTypedData(typedData)).toBe("0x5167");
    const request = {
      address: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90",
      abi: [],
      functionName: "requestPhase1",
      args: ["did:dkg:x"],
      chainId: 84532,
    } as never;
    expect(await runtime.writeContract(request)).toBe("0xabc1");
    await runtime.waitForReceipt("0xabc1", 84532, 90_000);
    runtime.setThemeMode("light");

    expect(open).toHaveBeenCalledOnce();
    expect(switchChain).toHaveBeenCalledWith(wagmiConfig, { chainId: 84532 });
    expect(signTypedData).toHaveBeenCalledWith(wagmiConfig, typedData);
    expect(writeContract).toHaveBeenCalledWith(wagmiConfig, request);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(wagmiConfig, {
      hash: "0xabc1",
      chainId: 84532,
      timeout: 90_000,
    });
    expect(setThemeMode).toHaveBeenCalledWith("light");
  });
});

describe("walletNetworks", () => {
  it("offers Base Sepolia only when deployed", () => {
    expect(walletNetworks(undefined)).toEqual([{ id: 84532 }]);
  });

  it("adds Anvil on its local URL locally, for ratings", () => {
    const [, anvil] = walletNetworks("http://127.0.0.1:8546");

    expect(anvil).toMatchObject({
      id: 31337,
      name: "Anvil",
      rpcUrls: { default: { http: ["http://127.0.0.1:8546"] } },
    });
  });
});
