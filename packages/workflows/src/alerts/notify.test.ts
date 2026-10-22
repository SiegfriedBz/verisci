import { describe, expect, it, vi } from "vitest";
import { createNotify, type NotifyOptions } from "./notify.ts";

const TOKEN = "123456:secret-bot-token";

function setup(overrides: Partial<NotifyOptions> = {}) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true }));
  const logger = { info: vi.fn(), warn: vi.fn() };
  const notify = createNotify({
    appEnv: "staging",
    botToken: TOKEN,
    chatId: "-1001234",
    fetch,
    timeoutMs: 10_000,
    logger,
    ...overrides,
  });
  return { notify, fetch, logger };
}

describe("createNotify", () => {
  it("posts one Telegram message in HTML, headed by the level and the environment", async () => {
    const { notify, fetch } = setup();

    await notify({ level: "alert", text: "oracle-no-funds: 0xabc cannot pay" });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234",
      text: "<b>🚨 Alert</b> · staging\noracle-no-funds: 0xabc cannot pay",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  it("shows activity as its headline, the paper's title in bold and a short link", async () => {
    const { notify, fetch } = setup({ appEnv: "production" });

    await notify({
      level: "activity",
      text: "📄 Published",
      title: "RNAi therapies",
      link: { label: "Open the paper", url: "https://labstrail.example/papers/bafy" },
    });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).text).toBe(
      '<b>📄 Published</b> · production\n<b>RNAi therapies</b>\n→ <a href="https://labstrail.example/papers/bafy">Open the paper</a>',
    );
  });

  it("leaves the link line out of activity with no link", async () => {
    const { notify, fetch } = setup();

    await notify({
      level: "activity",
      text: "⚠️ Rating cancelled: can't be rated",
      title: "A paper",
    });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).text).toBe(
      "<b>⚠️ Rating cancelled: can't be rated</b> · staging\n<b>A paper</b>",
    );
  });

  it("escapes what Telegram would read as HTML, in the text, the title and the link", async () => {
    const { notify, fetch } = setup();

    await notify({ level: "alert", text: "run failed: <timeout> & retried" });
    await notify({
      level: "activity",
      text: "⭐ Rated 80/100",
      title: "Mice <3 & men",
      link: { label: "Open the rating", url: 'https://x.example/?a=1&b="2"' },
    });

    const texts = fetch.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).text);
    expect(texts[0]).toBe("<b>🚨 Alert</b> · staging\nrun failed: &lt;timeout&gt; &amp; retried");
    expect(texts[1]).toBe(
      '<b>⭐ Rated 80/100</b> · staging\n<b>Mice &lt;3 &amp; men</b>\n→ <a href="https://x.example/?a=1&amp;b=&quot;2&quot;">Open the rating</a>',
    );
  });

  it("only logs the message when Telegram isn't set up", async () => {
    const { notify, fetch, logger } = setup({ botToken: undefined, chatId: undefined });

    await notify({ level: "alert", text: "rating-orphan: …/14" });
    await notify({
      level: "activity",
      text: "📄 Published",
      title: "RNAi therapies",
      link: { label: "Open the paper", url: "http://localhost:3000/papers/bafy" },
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("notify: [staging · alert] rating-orphan: …/14");
    expect(logger.info).toHaveBeenCalledWith(
      "notify: [staging · activity] 📄 Published: RNAi therapies http://localhost:3000/papers/bafy",
    );
  });

  it.each([
    ["an error status", async () => new Response("Unauthorized", { status: 401 }), "HTTP 401"],
    [
      "no answer",
      async () => {
        throw new Error("fetch failed");
      },
      "fetch failed",
    ],
  ])(
    "logs, never throws, when Telegram gives %s, and never logs the token",
    async (_, answer, detail) => {
      const { notify, logger } = setup({ fetch: vi.fn(answer) });

      await expect(notify({ level: "alert", text: "x" })).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(`notify-unavailable: telegram: ${detail}`);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
    },
  );

  it("replaces the token when the error names the URL it was sent to", async () => {
    const { notify, logger } = setup({
      fetch: vi.fn(async (url: string) => {
        throw new Error(`request to ${url} failed`);
      }),
    });

    await notify({ level: "alert", text: "x" });

    expect(logger.warn).toHaveBeenCalledWith(
      "notify-unavailable: telegram: request to https://api.telegram.org/bot<token>/sendMessage failed",
    );
  });
});
