import { todayInKarachi } from "./letters";
import { formatDate } from "./format";

/** The signer name recorded when Shoaib confirms a proposal/agreement
 *  himself (call, WhatsApp, in person) instead of the client's own link. */
export const OFFLINE_SIGNER = "Confirmed by Shoaib (offline)";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A picked day as a timestamp: now if it's today in Pakistan, otherwise
 *  midday Pakistan time that day, so no timezone can move it a day. */
export function dayToTimestamp(date: string): string {
  return date === todayInKarachi() ? new Date().toISOString() : `${date}T12:00:00+05:00`;
}

/** A record's timestamp as its day in Pakistan (YYYY-MM-DD). */
export function timestampToDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(iso));
}

/** How a signing/acceptance moment reads under a document: just the day
 *  for an offline confirmation (Shoaib picks a date, not a time), the full
 *  Pakistan time for a client's own online signature. */
export function signedOnLabel(iso: string, offline: boolean): string {
  if (offline) return formatDate(timestampToDay(iso));
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

/** True when this signature was Shoaib's offline confirmation — the only
 *  kind whose date can be changed afterwards (a client's own online
 *  signature, with its IP, stays exactly as recorded). */
export function isOfflineSignature(record: { signer_name: string | null; signer_ip: string | null }) {
  return record.signer_name === OFFLINE_SIGNER && !record.signer_ip;
}
