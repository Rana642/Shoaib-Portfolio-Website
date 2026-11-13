// What the inbox's sendText / deliverTemplate use instead of calling Meta, when
// WHATSAPP_VIA_SOCIALLY_SNAP is "test" or "live". Returns the same two shapes they already do:
// { wamid } for a real send, { error } for anything else, including a dry run.
//
// A dry run is reported through the error channel on purpose: callers store a message and mark
// the chat replied only on { wamid }, so nothing from a test can ever look like a real message.

import { clientFromEnv, DRY_RUN_MESSAGE, sociallySnapMode, templateMessage, textMessage, type Env, type Failure } from "./client";

export type ViaResult = { wamid: string } | { error: string };

/** What staff read. The API's own messages are already plain; the rest need a sentence. */
export function failureText(failure: Failure): string {
  if (failure.mayHaveSent) {
    return "Socially Snap didn't confirm this message, and it may have gone out anyway. Check the chat before sending it again.";
  }
  if (failure.code === "rate_limited") {
    return `${failure.message}${failure.retryAfterSeconds ? ` Try again in ${failure.retryAfterSeconds} s.` : ""}`;
  }
  return failure.message;
}

async function send(message: Record<string, unknown>, env: Env, fetchImpl?: typeof fetch): Promise<ViaResult> {
  const client = clientFromEnv(env, fetchImpl);
  if ("failure" in client) return { error: failureText(client.failure) };
  const sent = await client.sendMessage(message);
  if (!sent.ok) return { error: failureText(sent.failure) };
  // In test mode every success is a dry run, however the answer is marked; and anything marked
  // as one is a dry run in any mode.
  if (sociallySnapMode(env) === "test" || sent.test || sent.wamid.startsWith("wamid.test_")) return { error: DRY_RUN_MESSAGE };
  return { wamid: sent.wamid };
}

export const sendTextViaSociallySnap = (to: string, text: string, from: string, env: Env = process.env, fetchImpl?: typeof fetch) =>
  send(textMessage(to, text, from), env, fetchImpl);

export const sendTemplateViaSociallySnap = (to: string, name: string, language: string, values: string[], from: string, env: Env = process.env, fetchImpl?: typeof fetch) =>
  send(templateMessage(to, name, language, values, from), env, fetchImpl);
