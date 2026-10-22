import { getWebhookIntake } from "@labstrail/workflows";

/**
 * Alchemy Notify's webhook (ADR 0017): hands the raw body and its `X-Alchemy-Signature` to the
 * workflows' intake, which checks them and sends a rating event per request log, and answers its
 * status with an empty body: 200 ends the delivery, 503 has Alchemy Notify deliver again. Where
 * no signing key is set, as on a feature preview, it is 404; locally, with a key, it takes the
 * Anvil contract's logs, for the `post-webhook` dev script (`getWebhookIntake`).
 */
export async function POST(request: Request): Promise<Response> {
  const status = await getWebhookIntake().receive(
    await request.text(),
    request.headers.get("x-alchemy-signature"),
  );
  return new Response(null, { status });
}
