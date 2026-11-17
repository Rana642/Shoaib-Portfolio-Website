// The WhatsApp booking bot's conversation: what to say next, given where the guest is and what they just sent.
// Pure logic. The hotel (rooms, prices, booking) and the clock come in through `deps`, so the whole flow can be tested
// without a database or WhatsApp. Sending messages, saving the session and calling staff live in runner.ts.
//
// Guest flow:  menu → check-in date → nights → guests → pick a room (live price) → name → confirm → payment details →
// receipt photo → staff confirm. A guest who already has a booking (e.g. from the website) is shown it instead of the menu,
// so nobody is booked twice. "Talk to staff" is always available.

import { addDays, parseDate, parseGuests, parseName, parseNights, roundUp100, todayKarachi } from "./parse";

export type BotMessage =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { type: "list"; body: string; button: string; rows: { id: string; title: string; description?: string }[] };

export type Step = "existing" | "menu" | "ask_checkin" | "ask_nights" | "ask_guests" | "pick_room" | "ask_name" | "confirm" | "await_receipt" | "done" | "handoff";

export type RoomOption = { roomId: string; name: string; total: number; perNight: number; nights: number; refundable: boolean; requiresAdvance: boolean };
export type ActiveBooking = {
  bookingRef: string; status: string; checkIn: string; checkOut: string; nights: number; grandTotal: number;
  roomName: string | null; source: string | null; hasReceipt: boolean; matchedBy: "phone" | "ref";
};

export type BookingData = {
  checkIn?: string; nights?: number; adults?: number; children?: number;
  rooms?: RoomOption[]; roomId?: string; roomName?: string; total?: number;
  guestName?: string; bookingRef?: string; extra?: boolean; existing?: ActiveBooking[];
};

export type BotSession = { step: Step; data: BookingData; strikes: number; holdUntil?: string | null };
export const newSession = (): BotSession => ({ step: "menu", data: {}, strikes: 0 });

export type ApiFail = { ok: false; error: string; existing?: ActiveBooking[] };
export type HotelApi = {
  lookup(phone: string, ref?: string): Promise<{ ok: true; bookings: ActiveBooking[] } | ApiFail>;
  quote(i: { checkIn: string; checkOut: string; adults: number; children: number }): Promise<
    { ok: true; nights: number; rooms: (RoomOption & { available: boolean; reason?: string })[] } | ApiFail
  >;
  create(i: {
    roomId: string; checkIn: string; checkOut: string; adults: number; children: number; guestName: string; guestPhone: string;
    ref: { src: string; code: string | null } | null; allowAdditional: boolean;
  }): Promise<{ ok: true; bookingRef: string; grandTotal: number | null; roomName: string | null } | ApiFail>;
  attachReceipt(ref: string, phone: string, url: string): Promise<{ ok: true } | ApiFail>;
  cancel(ref: string, phone: string): Promise<{ ok: true } | ApiFail>;
};

export type BotConfig = {
  hotelName: string;
  advance: { mode: "percent" | "first_night"; value: number };
  holdMinutes: number;
  /** How to pay the advance (account numbers etc.), written by the hotel. */
  paymentText: string;
};

export type BotInput = {
  kind: "text" | "button" | "list" | "media" | "other";
  id?: string;
  text?: string;
  phone: string;
  profileName?: string | null;
  ref?: { src: string; code: string | null } | null;
  /** Where staff can see the chat (saved with the booking next to the receipt). */
  receiptLink?: string;
};

export type BotOutput = {
  session: BotSession;
  messages: BotMessage[];
  /** Hand the chat to staff (marks it Intervened). */
  handoff?: boolean;
  /** Tell staff something needs them now. */
  staffAlert?: string;
  /** A booking was just created (the runner records it on the chat). */
  created?: { bookingRef: string; total: number | null; roomName: string | null; checkIn: string; nights: number };
};

export type BotDeps = { api: HotelApi; now: () => Date; config: BotConfig };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const text = (body: string): BotMessage => ({ type: "text", body });
const buttons = (body: string, b: [string, string][]): BotMessage => ({ type: "buttons", body, buttons: b.map(([id, title]) => ({ id, title: clip(title, 20) })) });

/**
 * If buttons or lists don't work on a number (or the guest just types), what they type still means the same thing.
 * Returns the id the matching button would have had.
 */
function idFromText(step: Step, said: string, s: BotSession): string | undefined {
  const t = said.toLowerCase().trim();
  if (!t) return undefined;
  switch (step) {
    case "menu": return /\b(rate|rates|price|prices|rent|kitna|kiraya|tariff)\b/.test(t) && !/\bbook/.test(t) ? "rates" : undefined;
    case "existing": return /\b(receipt|screenshot|payment)\b/.test(t) ? "receipt" : /\bstatus\b/.test(t) ? "status" : /\b(another|extra|new|second|one more)\b/.test(t) ? "extra" : undefined;
    case "confirm": return /^(yes|y|confirm|confirmed|ok|okay|haan|han|ji|sure|done)\b/.test(t) ? "confirm" : /^(no|cancel|nahi|nhi)\b/.test(t) ? "cancel" : /\b(change|date|dates)\b/.test(t) ? "dates" : undefined;
    case "pick_room": {
      const i = (s.data.rooms ?? []).findIndex((r) => t.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(t));
      return i >= 0 ? `r_${i}` : undefined;
    }
    case "await_receipt": return /\bcancel\b/.test(t) ? "cancel_booking" : undefined;
    case "ask_name": return undefined;
    default: return /\b(other dates|change date|different date)\b/.test(t) ? "dates" : undefined;
  }
}

const STAFF_WORDS = /\b(staff|human|agent|reception|manager|call me|talk to (someone|a person)|insaan)\b/i;
const MENU_WORDS = /^(menu|start|restart|hi|hello|hey|salam|salaam|assalam[a-z ]*|aoa|a\.?o\.?a|hlo|helo)\W*$/i;
const BOOK_WORDS = /\b(book|booking|reserve|reservation|room|kamra|kamre|rooms)\b/i;

export const advanceFor = (cfg: BotConfig, total: number, nights: number) => {
  const raw = cfg.advance.mode === "first_night" ? total / Math.max(1, nights) : (total * cfg.advance.value) / 100;
  return Math.min(total, roundUp100(raw));
};

const statusWord = (s: string) => ({ pending: "waiting for payment confirmation", confirmed: "confirmed", checked_in: "checked in" })[s] ?? s;

function describeExisting(list: ActiveBooking[]): string {
  return list
    .map((b) =>
      b.matchedBy === "ref"
        ? `Booking ${b.bookingRef}: ${day(b.checkIn)} to ${day(b.checkOut)}, ${statusWord(b.status)}.`
        : `Booking ${b.bookingRef}${b.roomName ? ` (${b.roomName})` : ""}: ${day(b.checkIn)} to ${day(b.checkOut)}, ${b.nights} night${b.nights > 1 ? "s" : ""}, ${rs(b.grandTotal)}. Status: ${statusWord(b.status)}${b.status === "pending" ? (b.hasReceipt ? " (we have your receipt)" : "") : ""}.`
    )
    .join("\n");
}

function menu(cfg: BotConfig): BotMessage {
  return buttons(`Welcome to ${cfg.hotelName}! How can I help you?`, [["book", "Book a room"], ["rates", "Rates & rooms"], ["staff", "Talk to staff"]]);
}

const strike = (s: BotSession, ok: boolean): BotSession => ({ ...s, strikes: ok ? 0 : s.strikes + 1 });
const handoffOutput = (s: BotSession, why: string): BotOutput => ({
  session: { ...s, step: "handoff", strikes: 0 },
  messages: [text("Our team will reply to you here shortly. Thank you for your patience.")],
  handoff: true,
  staffAlert: why,
});

/** Start (or restart) a conversation: look up an existing booking first, so nobody is booked twice. */
async function start(input: BotInput, deps: BotDeps, refInText?: string): Promise<BotOutput> {
  const found = await deps.api.lookup(input.phone, refInText);
  const list = found.ok ? found.bookings : [];
  if (list.length) {
    const own = list.some((b) => b.matchedBy === "phone");
    const opts: [string, string][] = own
      ? [list.some((b) => b.status === "pending" && !b.hasReceipt) ? ["receipt", "Send receipt"] : ["status", "Booking status"], ["extra", "Another room"], ["staff", "Talk to staff"]]
      : [["staff", "Talk to staff"], ["extra", "New booking"]];
    return {
      session: { step: "existing", data: { existing: list }, strikes: 0 },
      messages: [buttons(`Hello! I can see your booking:\n${describeExisting(list)}\n\nWhat would you like to do?`, opts)],
    };
  }
  // Someone whose first words are already a booking request is asked for the date straight away.
  if (input.kind === "text" && BOOK_WORDS.test(input.text ?? "") && !MENU_WORDS.test((input.text ?? "").trim())) return askCheckin({ step: "menu", data: {}, strikes: 0 });
  return { session: { step: "menu", data: {}, strikes: 0 }, messages: [menu(deps.config)] };
}

const askCheckin = (s: BotSession): BotOutput => ({
  session: { ...s, step: "ask_checkin", strikes: 0 },
  messages: [text("What is your check-in date? You can write it like 5 Dec, 05/12 or tomorrow.")],
});

async function ratesInfo(s: BotSession, deps: BotDeps): Promise<BotOutput> {
  const checkIn = addDays(todayKarachi(deps.now()), 1);
  const q = await deps.api.quote({ checkIn, checkOut: addDays(checkIn, 1), adults: 2, children: 0 });
  if (!q.ok) return { session: s, messages: [buttons("I couldn't load the rates just now. Would you like to book, or talk to our staff?", [["book", "Book a room"], ["staff", "Talk to staff"]])] };
  const lines = q.rooms.map((r) => `• ${r.name}: ${rs(r.perNight)} per night`).join("\n");
  return {
    session: { ...s, step: "menu", strikes: 0 },
    messages: [buttons(`Our rooms (price per night for 2 guests, taxes included):\n${lines}\n\nPrices can change with dates and offers. Shall I check your dates?`, [["book", "Book a room"], ["staff", "Talk to staff"]])],
  };
}

async function runQuote(s: BotSession, deps: BotDeps): Promise<BotOutput> {
  const d = s.data;
  const checkOut = addDays(d.checkIn!, d.nights!);
  const q = await deps.api.quote({ checkIn: d.checkIn!, checkOut, adults: d.adults!, children: d.children ?? 0 });
  if (!q.ok) {
    return { session: { ...s, step: "ask_checkin" }, messages: [buttons(`Sorry, I couldn't check the rooms right now (${clip(q.error, 80)}).`, [["staff", "Talk to staff"], ["dates", "Try again"]])] };
  }
  const open = q.rooms.filter((r) => r.available).sort((a, b) => a.total - b.total).slice(0, 10);
  if (!open.length) {
    return { session: { ...s, step: "ask_checkin", strikes: 0 }, messages: [buttons(`Sorry, we have no room for ${day(d.checkIn!)} to ${day(checkOut)} for ${d.adults} guest${d.adults! > 1 ? "s" : ""}. Would you like other dates?`, [["dates", "Other dates"], ["staff", "Talk to staff"]])] };
  }
  const rooms: RoomOption[] = open.map(({ roomId, name, total, perNight, nights, refundable, requiresAdvance }) => ({ roomId, name, total, perNight, nights, refundable, requiresAdvance }));
  return {
    session: { ...s, step: "pick_room", strikes: 0, data: { ...d, rooms } },
    messages: [{
      type: "list",
      body: `Available for ${day(d.checkIn!)} to ${day(checkOut)} (${d.nights} night${d.nights! > 1 ? "s" : ""}). Please choose a room:`,
      button: "Choose a room",
      rows: rooms.map((r, i) => ({ id: `r_${i}`, title: clip(r.name, 24), description: `${rs(r.total)} total, taxes included` })),
    }],
  };
}

function summary(s: BotSession, deps: BotDeps): BotOutput {
  const d = s.data;
  const advance = advanceFor(deps.config, d.total!, d.nights!);
  const checkOut = addDays(d.checkIn!, d.nights!);
  return {
    session: { ...s, step: "confirm", strikes: 0 },
    messages: [buttons(
      `Please check your booking:\n\n${d.roomName}\n${day(d.checkIn!)} to ${day(checkOut)} (${d.nights} night${d.nights! > 1 ? "s" : ""})\n${d.adults} adult${d.adults! > 1 ? "s" : ""}${d.children ? `, ${d.children} child${d.children > 1 ? "ren" : ""}` : ""}\nName: ${d.guestName}\nTotal: ${rs(d.total!)} (taxes included)\nAdvance to confirm: ${rs(advance)}`,
      [["confirm", "Confirm booking"], ["dates", "Change dates"], ["cancel", "Cancel"]]
    )],
  };
}

async function createBooking(s: BotSession, input: BotInput, deps: BotDeps): Promise<BotOutput> {
  const d = s.data;
  const checkOut = addDays(d.checkIn!, d.nights!);
  const r = await deps.api.create({
    roomId: d.roomId!, checkIn: d.checkIn!, checkOut, adults: d.adults!, children: d.children ?? 0,
    guestName: d.guestName!, guestPhone: input.phone, ref: input.ref ?? null, allowAdditional: d.extra === true,
  });
  if (!r.ok) {
    if (r.error === "duplicate" && r.existing?.length) {
      return {
        session: { step: "existing", data: { existing: r.existing }, strikes: 0 },
        messages: [buttons(`You already have a booking for these dates:\n${describeExisting(r.existing)}\n\nI have not made a second one.`, [["receipt", "Send receipt"], ["extra", "Another room"], ["staff", "Talk to staff"]])],
      };
    }
    return { session: { ...s, strikes: s.strikes + 1 }, messages: [buttons(`Sorry, I couldn't complete the booking: ${clip(r.error, 120)}. Please try again or talk to our staff.`, [["confirm", "Try again"], ["staff", "Talk to staff"]])] };
  }
  const total = r.grandTotal ?? d.total ?? 0;
  const advance = advanceFor(deps.config, total, d.nights!);
  const holdUntil = new Date(deps.now().getTime() + deps.config.holdMinutes * 60_000).toISOString();
  return {
    session: { step: "await_receipt", data: { ...d, bookingRef: r.bookingRef }, strikes: 0, holdUntil },
    messages: [
      text(`Your room is reserved. Booking ref: ${r.bookingRef}\n\nTo confirm it, please pay the advance of ${rs(advance)} within ${deps.config.holdMinutes} minutes:\n\n${deps.config.paymentText}\n\nThen send the payment receipt photo here.`),
    ],
    staffAlert: `New WhatsApp booking ${r.bookingRef}, waiting for the advance.`,
    created: { bookingRef: r.bookingRef, total: r.grandTotal, roomName: r.roomName ?? d.roomName ?? null, checkIn: d.checkIn!, nights: d.nights! },
  };
}

/** One step of the conversation. Never throws on bad guest input; hotel API failures become polite messages. */
export async function handle(session: BotSession | null, input: BotInput, deps: BotDeps): Promise<BotOutput> {
  const s: BotSession = session ?? newSession();
  const said = (input.text ?? "").trim();
  const id = input.id ?? (input.kind === "text" ? idFromText(s.step, said, s) : undefined);
  const wantsStaff = id === "staff" || (input.kind === "text" && STAFF_WORDS.test(said));

  // Staff took over: the bot stays quiet until the guest asks for the menu.
  if (s.step === "handoff") {
    if (id === "menu" || (input.kind === "text" && /^menu\W*$/i.test(said))) return start(input, deps);
    return { session: s, messages: [] };
  }
  if (wantsStaff) return handoffOutput(s, s.step === "await_receipt" ? `Guest of booking ${s.data.bookingRef} asked for staff.` : "Guest asked to talk to staff.");

  // A new conversation, or the guest greets again after finishing.
  // (A button or list tap with no saved session is an answer to an older menu: it is handled as the menu step.)
  if ((!session && input.kind !== "button" && input.kind !== "list") || s.step === "done" || (input.kind === "text" && MENU_WORDS.test(said) && (s.step === "menu" || s.step === "existing"))) {
    const refInText = (input.text ?? "").match(/\b(HE-[A-Z0-9]{4,12})\b/i)?.[1];
    // A first message that is already a booking request goes straight to the questions, unless a booking exists.
    return start(input, deps, refInText);
  }

  switch (s.step) {
    case "existing": {
      if (id === "receipt") {
        const own = (s.data.existing ?? []).find((b) => b.matchedBy === "phone" && b.status === "pending");
        if (!own) return { session: s, messages: [text("I could not find an unpaid booking for this number. Please talk to our staff.")] };
        return { session: { step: "await_receipt", data: { bookingRef: own.bookingRef, checkIn: own.checkIn, nights: own.nights }, strikes: 0, holdUntil: s.holdUntil ?? null }, messages: [text(`Please send the payment receipt photo for booking ${own.bookingRef} here.`)] };
      }
      if (id === "status") return { session: s, messages: [buttons(describeExisting(s.data.existing ?? []), [["extra", "Another room"], ["staff", "Talk to staff"]])] };
      if (id === "extra") return askCheckin({ ...s, data: { extra: true } });
      const st = strike(s, false);
      if (st.strikes >= 3) return handoffOutput(st, "Guest is stuck on the existing-booking question.");
      return { session: st, messages: [buttons(`${describeExisting(s.data.existing ?? [])}\n\nPlease choose an option.`, [["status", "Booking status"], ["extra", "Another room"], ["staff", "Talk to staff"]])] };
    }

    case "menu": {
      if (id === "book" || (input.kind === "text" && BOOK_WORDS.test(said))) return askCheckin(s);
      if (id === "rates") return ratesInfo(s, deps);
      const st = strike(s, false);
      if (st.strikes >= 2) return { session: { ...st, strikes: 0 }, messages: [buttons("I can help you book a room, share our rates, or connect you with our staff.", [["book", "Book a room"], ["rates", "Rates & rooms"], ["staff", "Talk to staff"]])] };
      return { session: st, messages: [menu(deps.config)] };
    }

    case "ask_checkin": {
      if (id === "dates") return askCheckin(s);
      const date = input.kind === "text" ? parseDate(said, deps.now()) : null;
      if (!date) {
        const st = strike(s, false);
        if (st.strikes >= 3) return handoffOutput(st, "Guest could not give a check-in date.");
        return { session: st, messages: [text("Sorry, I did not understand that date. Please write the check-in date like 5 Dec or 05/12 (it must be today or later).")] };
      }
      return {
        session: { ...s, step: "ask_nights", strikes: 0, data: { ...s.data, checkIn: date } },
        messages: [buttons(`Check-in ${day(date)}. How many nights will you stay?`, [["n_1", "1 night"], ["n_2", "2 nights"], ["n_3", "3 nights"]]), text("For a longer stay, just type the number of nights.")],
      };
    }

    case "ask_nights": {
      if (id === "dates") return askCheckin(s);
      const n = id?.match(/^n_(\d+)$/) ? Number(id.slice(2)) : input.kind === "text" ? parseNights(said) : null;
      if (!n) {
        const st = strike(s, false);
        if (st.strikes >= 3) return handoffOutput(st, "Guest could not give the number of nights.");
        return { session: st, messages: [text("Please tell me the number of nights as a number, for example 2.")] };
      }
      return {
        session: { ...s, step: "ask_guests", strikes: 0, data: { ...s.data, nights: n } },
        messages: [{
          type: "list",
          body: `${n} night${n > 1 ? "s" : ""}. How many guests will stay?`,
          button: "Choose guests",
          rows: [
            { id: "g_1_0", title: "1 adult" }, { id: "g_2_0", title: "2 adults" }, { id: "g_3_0", title: "3 adults" }, { id: "g_4_0", title: "4 adults" },
            { id: "g_2_1", title: "2 adults + 1 child" }, { id: "g_2_2", title: "2 adults + 2 children" },
          ],
        }, text("Or type it, like 3 adults 2 children.")],
      };
    }

    case "ask_guests": {
      if (id === "dates") return askCheckin(s);
      const g = parseGuests({ id, text: input.kind === "text" ? said : undefined });
      if (!g) {
        const st = strike(s, false);
        if (st.strikes >= 3) return handoffOutput(st, "Guest could not give the number of guests.");
        return { session: st, messages: [text("Please tell me how many guests, for example 2 adults or 2 adults 1 child.")] };
      }
      return runQuote({ ...s, data: { ...s.data, adults: g.adults, children: g.children } }, deps);
    }

    case "pick_room": {
      const idx = id?.match(/^r_(\d+)$/) ? Number(id.slice(2)) : -1;
      const room = s.data.rooms?.[idx];
      if (!room) {
        const st = strike(s, false);
        if (st.strikes >= 3) return handoffOutput(st, "Guest could not choose a room.");
        return { session: st, messages: [text("Please choose one of the rooms from the list (tap Choose a room).")] };
      }
      const data = { ...s.data, roomId: room.roomId, roomName: room.name, total: room.total };
      const ask = input.profileName && parseName(input.profileName);
      return {
        session: { ...s, step: "ask_name", strikes: 0, data },
        messages: ask
          ? [buttons(`${room.name}, ${rs(room.total)}. What name should the booking be in?`, [["use_name", `Use ${clip(ask, 14)}`]]), text("Or type the guest's full name.")]
          : [text(`${room.name}, ${rs(room.total)}. Please type the guest's full name for the booking.`)],
      };
    }

    case "ask_name": {
      const name = id === "use_name" ? (input.profileName ? parseName(input.profileName) : null) : input.kind === "text" ? parseName(said) : null;
      if (!name) {
        const st = strike(s, false);
        if (st.strikes >= 3) return handoffOutput(st, "Guest could not give a name.");
        return { session: st, messages: [text("Please type the guest's full name (letters only).")] };
      }
      return summary({ ...s, data: { ...s.data, guestName: name } }, deps);
    }

    case "confirm": {
      if (id === "dates") return askCheckin({ ...s, data: { ...s.data, rooms: undefined } });
      if (id === "cancel") return { session: { step: "done", data: {}, strikes: 0 }, messages: [text("No problem, nothing has been booked. Message us any time to book.")] };
      if (id === "confirm") return createBooking(s, input, deps);
      const st = strike(s, false);
      if (st.strikes >= 3) return handoffOutput(st, "Guest did not confirm the booking.");
      return { session: st, messages: [buttons("Please tap Confirm booking to reserve the room, or choose another option.", [["confirm", "Confirm booking"], ["dates", "Change dates"], ["cancel", "Cancel"]])] };
    }

    case "await_receipt": {
      const ref = s.data.bookingRef!;
      if (id === "cancel_booking") {
        const r = await deps.api.cancel(ref, input.phone);
        return { session: { step: "done", data: {}, strikes: 0 }, messages: [text(r.ok ? `Booking ${ref} has been released. Message us any time to book again.` : "I could not release the booking just now. Our staff will help you.")], staffAlert: r.ok ? undefined : `Guest tried to cancel ${ref} but it failed.` };
      }
      if (input.kind === "media") {
        const r = await deps.api.attachReceipt(ref, input.phone, input.receiptLink ?? "https://adsbyshoaib.com");
        if (!r.ok) return { session: s, messages: [text("I could not save the receipt just now. Please send it once more, or talk to our staff.")] };
        return {
          session: { step: "done", data: { bookingRef: ref }, strikes: 0 },
          messages: [text(`Thank you! We have your receipt for booking ${ref}. Our team will confirm it shortly and message you here.`)],
          staffAlert: `Receipt received for booking ${ref}. Please verify the payment and confirm.`,
        };
      }
      return { session: s, messages: [buttons(`Booking ${ref} is waiting for the advance payment. Please send the payment receipt photo here.`, [["staff", "Talk to staff"], ["cancel_booking", "Cancel booking"]])] };
    }
  }
  return { session: s, messages: [] };
}
