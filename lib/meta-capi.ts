import { createHash } from "node:crypto";

const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
const accessToken = process.env.META_CONVERSION_API_TOKEN || "";

export const isMetaCapiConfigured = Boolean(pixelId && accessToken);

type CapiEventName = "Lead" | "Contact" | "CompleteRegistration";

function hashPii(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Fires a server-side Meta Conversions API event. No-ops until Shoaib adds
 * NEXT_PUBLIC_META_PIXEL_ID + META_CONVERSION_API_TOKEN — a real, expected
 * state pending his Meta Business Manager setup. Never throws: analytics
 * failures must not break the request that triggered them.
 */
export async function sendMetaCapiEvent(event: {
  eventName: CapiEventName;
  eventSourceUrl: string;
  email?: string;
}): Promise<void> {
  if (!isMetaCapiConfigured) return;

  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              event_name: event.eventName,
              event_time: Math.floor(Date.now() / 1000),
              action_source: "website",
              event_source_url: event.eventSourceUrl,
              user_data: event.email ? { em: [hashPii(event.email)] } : {},
            },
          ],
        }),
      }
    );
  } catch (error) {
    console.error("[meta-capi] failed to send event:", error);
  }
}
