import { db } from "./db";

/**
 * Reserves the next number for the year, e.g. INV-2026-001. The counter
 * lives in Postgres so two documents created at once can't collide. Numbers
 * are consumed even if the insert later fails — a gap is far less dangerous
 * on financial records than a duplicate.
 *
 * Deliberately a plain internal helper, NOT a server action: it's called by
 * both authed document actions and the public proposal-acceptance flow, so
 * it can't require auth — but every export of a "use server" file is a
 * callable endpoint, and exposing numbering would let anyone burn the
 * sequence. Keep this file free of "use server".
 */
export async function generateNumber(kind: string, prefix: string): Promise<string | null> {
  const year = new Date().getFullYear();
  const { data, error } = await db.rpc("next_document_number", {
    p_doc_type: kind,
    p_year: year,
  });
  if (error || data == null) return null;
  return `${prefix}-${year}-${String(data).padStart(3, "0")}`;
}
