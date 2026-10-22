import { createHmac, timingSafeEqual } from "node:crypto";
import { defineEnv, sharedEnv } from "@labstrail/env";
import type { Hex } from "viem";
import { z } from "zod";
import { inngest } from "../inngest.ts";
import { environmentContracts } from "../rating/contracts.ts";
import { type RatingRequested, ratingRequestedEvent } from "../rating/events.ts";
import { webhookSchema } from "../workflows-env.ts";

/** What the webhook route answers Alchemy Notify: 2xx ends the delivery, 5xx has it delivered again. */
export type WebhookStatus = 200 | 400 | 401 | 404 | 503;

/** One `labstrail/rating.requested` event, as {@link createWebhookIntake} sends it. */
export interface RatingEvent {
  readonly name: string;
  readonly id: string;
  readonly data: RatingRequested;
}

/** The IO {@link createWebhookIntake} uses; tests pass fakes. */
export interface WebhookIo {
  /** The environment's Alchemy Notify signing key; without it the route answers 404. Secret. */
  readonly signingKey: string | undefined;
  /** The environment's contracts, lowercase: current and past (ADR 0023), or locally Anvil's. */
  readonly contracts: readonly string[];
  /** Sends the events to Inngest at once; throws when Inngest refuses them. */
  send(events: readonly RatingEvent[]): Promise<void>;
  readonly logger: { warn(message: string): void };
}

/** The Alchemy Notify webhook's intake, for `apps/web`'s `/api/webhooks/alchemy`. */
export interface WebhookIntake {
  /** Checks, reads and forwards one delivery: `rawBody` exactly as received. */
  receive(rawBody: string, signature: string | null): Promise<WebhookStatus>;
}

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);

/**
 * The part of a Custom Webhook (GraphQL) delivery the intake reads: the block's logs, with the
 * fields our registered query asks for (`packages/workflows` README → The Alchemy Notify
 * webhook). Other fields Alchemy Notify adds are ignored.
 */
const payloadSchema = z.object({
  type: z.literal("GRAPHQL"),
  event: z.object({
    data: z.object({
      block: z.object({
        logs: z.array(
          z.object({
            data: hex,
            topics: z.array(hex),
            account: z.object({ address: z.string() }),
            removed: z.boolean().optional(),
          }),
        ),
      }),
    }),
  }),
});

/**
 * Builds the webhook intake (ADR 0017): it checks the `X-Alchemy-Signature` HMAC-SHA256 over the
 * raw body in constant time before parsing (401 when absent or wrong), reads the payload (400,
 * logged `webhook-unreadable`, when it is not one), and sends one `labstrail/rating.requested`
 * event per `Phase1Requested` log of an environment contract, with the id `rating:<requestId>`
 * a repeated delivery shares. A log marked `removed`, of another contract or of another event
 * sends nothing. After a reorg, Alchemy Notify delivers the new block; the run's read of the
 * request on chain stops one the reorg dropped before the run started, and the oracle
 * function's read one dropped later (ADR 0017). Inngest refusing the events answers 503
 * (logged `webhook-unavailable`), so Alchemy Notify delivers again. Without a signing key it
 * answers 404 and reads nothing.
 */
export function createWebhookIntake(io: WebhookIo): WebhookIntake {
  return {
    async receive(rawBody, signature) {
      if (!io.signingKey) return 404;
      if (!signedBy(io.signingKey, rawBody, signature)) return 401;
      let payload: z.infer<typeof payloadSchema>;
      try {
        const parsed = payloadSchema.safeParse(JSON.parse(rawBody));
        if (!parsed.success) {
          io.logger.warn(`webhook-unreadable: ${parsed.error.issues[0]?.path.join(".") || "body"}`);
          return 400;
        }
        payload = parsed.data;
      } catch {
        io.logger.warn("webhook-unreadable: not JSON");
        return 400;
      }
      const events = new Map<string, RatingEvent>();
      for (const log of payload.event.data.block.logs) {
        if (log.removed || !io.contracts.includes(log.account.address.toLowerCase())) continue;
        const event = ratingRequestedEvent({
          address: log.account.address,
          topics: log.topics as Hex[],
          data: log.data as Hex,
        });
        if (event && !events.has(event.id)) events.set(event.id, event);
      }
      if (events.size === 0) return 200;
      try {
        await io.send([...events.values()]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        io.logger.warn(`webhook-unavailable: inngest: ${detail}`);
        return 503;
      }
      return 200;
    },
  };
}

/** True when `signature` is the hex HMAC-SHA256 of `rawBody` under `key`, compared in constant time. */
function signedBy(key: string, rawBody: string, signature: string | null): boolean {
  if (!signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

let intake: WebhookIntake | undefined;

/**
 * The webhook intake, built on first use from `process.env`: the signing key
 * (`ALCHEMY_WEBHOOK_SIGNING_KEY`), the environment's contracts and the Inngest client. Deployed,
 * every contract of the environment; locally, where no webhook watches Anvil, the Anvil
 * contract (`LOCAL_RATING_CONTRACT`, ADR 0036), so `post-webhook` can check the route by hand.
 * Only the local contract's setting is checked here; a deployed server checks the key at start
 * with the workflows' settings (ADR 0004).
 */
export function getWebhookIntake(): WebhookIntake {
  if (intake) return intake;
  const env = defineEnv({
    extends: [sharedEnv],
    server: webhookSchema(sharedEnv.APP_ENV),
    runtimeEnv: process.env,
  });
  const anvil = env.LOCAL_RATING_CONTRACT;
  intake = createWebhookIntake({
    signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY,
    contracts:
      env.APP_ENV !== "local"
        ? environmentContracts(env.APP_ENV, undefined)
        : anvil
          ? [anvil.toLowerCase()]
          : [],
    send: async (events) => {
      await inngest.send(events.map((event) => ({ ...event, data: { ...event.data } })));
    },
    logger: console,
  });
  return intake;
}
