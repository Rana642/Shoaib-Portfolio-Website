// Shared by server and client components (a "use client" module can't export plain values to the server).

/**
 * WhatsApp works for any business, not just hotels: a number linked to a
 * project with a hotel booking source gets the hotel words (room, check-in,
 * nights); every other business gets general sales words. Same stored
 * fields either way (room → item, check_in → date, nights → quantity).
 */
export type BusinessKind = "hotel" | "general";
export const DEAL_WORDS = {
  hotel: {
    section: "Booking",
    mark: "Mark as booked",
    done: "Booking",
    item: "Room",
    date: "Check-in",
    qty: "Nights",
    ref: "Hotel booking ref",
    refTitle: "If this booking is also entered in the hotel's admin, its ref — so it's counted once",
    won: "Booked",
    lost: "Not booked",
  },
  general: {
    section: "Sale",
    mark: "Mark as won",
    done: "Sale",
    item: "Product / service",
    date: "Date",
    qty: "Quantity",
    ref: "Order ref",
    refTitle: "Its ref in your own system — so it's counted once",
    won: "Won",
    lost: "Lost",
  },
} as const;

/** What a guest may answer to the opt-in question ("Reply YES to get offers"). Exact answers only, so a "yes" to something else isn't taken as consent. */
export const OPT_IN_YES = ["YES", "Y", "HAAN", "HAN", "HANJI", "HAN JI", "YES PLEASE"];
/** A guest's one-word answer: trimmed, upper case, trailing dots, marks and spaces dropped ("Stop!" → "STOP"). */
export function answerWord(body: string | null | undefined): string {
  return (body ?? "").trim().toUpperCase().replace(/[.!?\s]+$/, "");
}
export function isOptInYes(body: string | null | undefined): boolean {
  return OPT_IN_YES.includes(answerWord(body));
}

const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "STOP ALL", "OPT OUT", "OPTOUT"];
/** A guest's own opt-out. Matched as loosely as the YES, so a guest can't opt in more easily than out. */
export function isStopWord(body: string | null | undefined): boolean {
  return STOP_WORDS.includes(answerWord(body));
}
export function isStartWord(body: string | null | undefined): boolean {
  return answerWord(body) === "START";
}

/** The opt-in question must say how to agree (YES) and how to stop (STOP); null when it does. */
export function optInTextProblem(text: string): string | null {
  return /\byes\b/i.test(text) && /\bstop\b/i.test(text) ? null : "The opt-in question must tell guests to reply YES to agree and that they can send STOP to stop.";
}

/** Is this stored message (its raw payload) the opt-in question we sent? */
export function isOptInPrompt(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && (raw as { kind?: unknown }).kind === "optin_prompt";
}
