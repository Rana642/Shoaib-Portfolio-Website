import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceFor, handle, newSession, type ActiveBooking, type BotConfig, type BotDeps, type BotInput, type BotMessage, type BotSession, type HotelApi } from "./engine";

const NOW = new Date("2026-11-17T05:00:00Z"); // 17 Nov 2026, 10:00 in Pakistan
const CONFIG: BotConfig = {
  hotelName: "Hotel Elegant Executive Suites",
  advance: { mode: "percent", value: 30 },
  holdMinutes: 120,
  paymentText: "Easypaisa 0300 0000000 (Hotel Elegant)", info: [],
};

const ROOMS = [
  { roomId: "r-king", name: "King Room", total: 17000, perNight: 8500, nights: 2, refundable: true, requiresAdvance: false, available: true },
  { roomId: "r-family", name: "Family Suite", total: 24000, perNight: 12000, nights: 2, refundable: true, requiresAdvance: false, available: true },
  { roomId: "r-pres", name: "Presidential Suite", total: 40000, perNight: 20000, nights: 2, refundable: true, requiresAdvance: false, available: false, reason: "Fully booked" },
];

const own = (over: Partial<ActiveBooking> = {}): ActiveBooking => ({
  bookingRef: "HE-AAA111", status: "pending", checkIn: "2026-12-05", checkOut: "2026-12-07", nights: 2, grandTotal: 17000,
  roomName: "King Room", source: "website", hasReceipt: false, matchedBy: "phone", ...over,
});

type Calls = { name: string; args: unknown[] }[];
function fakeApi(over: Partial<HotelApi> = {}, calls: Calls = []): HotelApi {
  const rec = <T,>(name: string, result: T) => async (...args: unknown[]) => { calls.push({ name, args }); void args; return result; };
  return {
    lookup: over.lookup ?? (rec("lookup", { ok: true as const, bookings: [] }) as HotelApi["lookup"]),
    quote: over.quote ?? (rec("quote", { ok: true as const, nights: 2, rooms: ROOMS }) as HotelApi["quote"]),
    create: over.create ?? (rec("create", { ok: true as const, bookingRef: "HE-NEW123", grandTotal: 17000, roomName: "King Room" }) as HotelApi["create"]),
    attachReceipt: over.attachReceipt ?? (rec("attachReceipt", { ok: true as const }) as HotelApi["attachReceipt"]),
    cancel: over.cancel ?? (rec("cancel", { ok: true as const }) as HotelApi["cancel"]),
  };
}
const deps = (api: HotelApi): BotDeps => ({ api, now: () => NOW, config: CONFIG });

const text = (t: string, extra: Partial<BotInput> = {}): BotInput => ({ kind: "text", text: t, phone: "923001234567", ...extra });
const button = (id: string, extra: Partial<BotInput> = {}): BotInput => ({ kind: "button", id, phone: "923001234567", ...extra });
const list = (id: string, extra: Partial<BotInput> = {}): BotInput => ({ kind: "list", id, phone: "923001234567", ...extra });
const media: BotInput = { kind: "media", phone: "923001234567", receiptLink: "https://adsbyshoaib.com/dashboard/whatsapp?chat=abc" };

const bodies = (m: BotMessage[]) => m.map((x) => x.body).join("\n");
const buttonIds = (m: BotMessage[]) => m.flatMap((x) => (x.type === "buttons" ? x.buttons.map((b) => b.id) : []));

describe("a full booking", () => {
  it("goes from hello to a reserved room waiting for the receipt", async () => {
    const calls: Calls = [];
    const d = deps(fakeApi({}, calls));
    let s: BotSession | null = null;
    let out = await handle(s, text("Hi"), d);
    assert.equal(out.session.step, "menu");
    assert.deepEqual(buttonIds(out.messages), ["book", "rates", "staff"]);
    s = out.session;

    out = await handle(s, button("book"), d);
    assert.equal(out.session.step, "ask_checkin");
    s = out.session;

    out = await handle(s, text("5 Dec"), d);
    assert.equal(out.session.step, "ask_nights");
    assert.equal(out.session.data.checkIn, "2026-12-05");
    s = out.session;

    out = await handle(s, button("n_2"), d);
    assert.equal(out.session.step, "ask_guests");
    assert.equal(out.session.data.nights, 2);
    s = out.session;

    out = await handle(s, list("g_2_0"), d);
    assert.equal(out.session.step, "pick_room");
    const quoteCall = calls.find((c) => c.name === "quote")!;
    assert.deepEqual(quoteCall.args[0], { checkIn: "2026-12-05", checkOut: "2026-12-07", adults: 2, children: 0 });
    const roomList = out.messages[0];
    assert.equal(roomList.type, "list");
    if (roomList.type === "list") {
      assert.deepEqual(roomList.rows.map((r) => r.title), ["King Room", "Family Suite"]); // the sold-out one is not offered, cheapest first
      assert.match(roomList.rows[0].description ?? "", /Rs 17,000/);
    }
    s = out.session;

    out = await handle(s, list("r_0", { profileName: "Ali Raza" }), d);
    assert.equal(out.session.step, "ask_name");
    assert.deepEqual(buttonIds(out.messages), ["use_name"]);
    s = out.session;

    out = await handle(s, button("use_name", { profileName: "Ali Raza" }), d);
    assert.equal(out.session.step, "confirm");
    assert.match(bodies(out.messages), /Advance to confirm: Rs 5,100/); // 30% of 17,000, rounded up to 100
    assert.match(bodies(out.messages), /Name: Ali Raza/);
    s = out.session;

    out = await handle(s, button("confirm", { ref: { src: "FB", code: "EFC1" } }), d);
    assert.equal(out.session.step, "await_receipt");
    assert.equal(out.session.data.bookingRef, "HE-NEW123");
    assert.ok(out.session.holdUntil && new Date(out.session.holdUntil).getTime() === NOW.getTime() + 120 * 60_000);
    assert.match(bodies(out.messages), /HE-NEW123/);
    assert.match(bodies(out.messages), /Easypaisa/);
    assert.equal(out.created?.bookingRef, "HE-NEW123");
    assert.ok(out.staffAlert);
    const createArgs = calls.find((c) => c.name === "create")!.args[0] as Record<string, unknown>;
    assert.equal(createArgs.roomId, "r-king");
    assert.equal(createArgs.checkOut, "2026-12-07");
    assert.equal(createArgs.guestName, "Ali Raza");
    assert.equal(createArgs.guestPhone, "923001234567");
    assert.equal(createArgs.allowAdditional, false);
    assert.deepEqual(createArgs.ref, { src: "FB", code: "EFC1" });
    s = out.session;

    out = await handle(s, media, d);
    assert.equal(out.session.step, "done");
    const att = calls.find((c) => c.name === "attachReceipt")!;
    assert.deepEqual(att.args, ["HE-NEW123", "923001234567", "https://adsbyshoaib.com/dashboard/whatsapp?chat=abc"]);
    assert.match(out.staffAlert ?? "", /HE-NEW123/);
  });

  it("a first message that is already a booking request goes straight to the date", async () => {
    const out = await handle(null, text("I want to book a room for my family"), deps(fakeApi()));
    assert.equal(out.session.step, "ask_checkin");
  });
});

describe("a guest who already has a booking is not booked twice", () => {
  it("shows the booking instead of the menu and offers the receipt", async () => {
    const api = fakeApi({ lookup: async () => ({ ok: true, bookings: [own()] }) });
    const out = await handle(null, text("Hello"), deps(api));
    assert.equal(out.session.step, "existing");
    assert.match(bodies(out.messages), /HE-AAA111/);
    assert.deepEqual(buttonIds(out.messages), ["receipt", "extra", "staff"]);
    assert.ok(!buttonIds(out.messages).includes("book"));
  });

  it("looks the booking up by the ref the website put in its WhatsApp message", async () => {
    const calls: Calls = [];
    const api = fakeApi({}, calls);
    await handle(null, text("📋 *Booking Ref:* HE-CAMHUD\nRoom: King Room"), deps(api));
    assert.deepEqual(calls.find((c) => c.name === "lookup")!.args, ["923001234567", "HE-CAMHUD"]);
  });

  it("a ref quoted from another number shows only ref, dates and status", async () => {
    const api = fakeApi({ lookup: async () => ({ ok: true, bookings: [own({ matchedBy: "ref" })] }) });
    const out = await handle(null, text("HE-AAA111"), deps(api));
    const body = bodies(out.messages);
    assert.match(body, /HE-AAA111/);
    assert.doesNotMatch(body, /Rs 17,000/);
    assert.doesNotMatch(body, /King Room/);
  });

  it("'Send receipt' asks for the photo, and the photo is attached to that booking", async () => {
    const calls: Calls = [];
    const api = fakeApi({ lookup: async () => ({ ok: true, bookings: [own()] }) }, calls);
    let out = await handle(null, text("Hi"), deps(api));
    out = await handle(out.session, button("receipt"), deps(api));
    assert.equal(out.session.step, "await_receipt");
    assert.equal(out.session.data.bookingRef, "HE-AAA111");
    out = await handle(out.session, media, deps(api));
    assert.deepEqual(calls.find((c) => c.name === "attachReceipt")!.args.slice(0, 2), ["HE-AAA111", "923001234567"]);
  });

  it("'Another room' is the only way to a second booking, and it is sent to the hotel as additional", async () => {
    const calls: Calls = [];
    const api = fakeApi({ lookup: async () => ({ ok: true, bookings: [own()] }) }, calls);
    const d = deps(api);
    let out = await handle(null, text("Hi"), d);
    out = await handle(out.session, button("extra"), d);
    assert.equal(out.session.step, "ask_checkin");
    out = await handle(out.session, text("tomorrow"), d);
    out = await handle(out.session, button("n_1"), d);
    out = await handle(out.session, list("g_2_0"), d);
    out = await handle(out.session, list("r_0"), d);
    out = await handle(out.session, text("Sara Khan"), d);
    out = await handle(out.session, button("confirm"), d);
    assert.equal((calls.find((c) => c.name === "create")!.args[0] as { allowAdditional: boolean }).allowAdditional, true);
  });

  it("if the hotel says duplicate at the last moment, no second booking is made and the existing one is shown", async () => {
    const api = fakeApi({ create: async () => ({ ok: false, error: "duplicate", existing: [own()] }) });
    const d = deps(api);
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    out = await handle(out.session, list("r_0"), d);
    out = await handle(out.session, text("Ali Raza"), d);
    out = await handle(out.session, button("confirm"), d);
    assert.equal(out.session.step, "existing");
    assert.match(bodies(out.messages), /already have a booking/);
    assert.equal(out.created, undefined);
  });

  it("if the hotel can't be reached for the lookup, the guest still gets the menu (the hotel refuses duplicates itself)", async () => {
    const api = fakeApi({ lookup: async () => ({ ok: false, error: "down" }) });
    const out = await handle(null, text("hi"), deps(api));
    assert.equal(out.session.step, "menu");
  });
});

describe("when something is wrong", () => {
  it("no room for the dates: offers other dates or staff, nothing is created", async () => {
    const api = fakeApi({ quote: async () => ({ ok: true, nights: 2, rooms: ROOMS.map((r) => ({ ...r, available: false })) }) });
    const d = deps(api);
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    assert.equal(out.session.step, "ask_checkin");
    assert.deepEqual(buttonIds(out.messages), ["dates", "staff"]);
  });

  it("three bad dates in a row hand the chat to staff", async () => {
    const d = deps(fakeApi());
    let out = await handle(null, button("book"), d);
    for (let i = 0; i < 2; i++) {
      out = await handle(out.session, text("blah"), d);
      assert.equal(out.handoff, undefined);
    }
    out = await handle(out.session, text("still blah"), d);
    assert.equal(out.handoff, true);
    assert.equal(out.session.step, "handoff");
  });

  it("a past date is refused", async () => {
    const d = deps(fakeApi());
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("2026-11-10"), d);
    assert.equal(out.session.step, "ask_checkin");
    assert.match(bodies(out.messages), /did not understand that date/);
  });

  it("'talk to staff' works at any step, then the bot stays quiet until 'menu'", async () => {
    const d = deps(fakeApi());
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, text("I want to talk to the reception"), d);
    assert.equal(out.handoff, true);
    const quiet = await handle(out.session, text("hello? anyone?"), d);
    assert.deepEqual(quiet.messages, []);
    const back = await handle(out.session, text("menu"), d);
    assert.equal(back.session.step, "menu");
    assert.ok(back.messages.length > 0);
  });

  it("a hotel error on the booking is explained and the guest can retry or call staff", async () => {
    const api = fakeApi({ create: async () => ({ ok: false, error: "Sorry, this room is fully booked on 2026-12-06." }) });
    const d = deps(api);
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    out = await handle(out.session, list("r_0"), d);
    out = await handle(out.session, text("Ali Raza"), d);
    out = await handle(out.session, button("confirm"), d);
    assert.equal(out.session.step, "confirm");
    assert.deepEqual(buttonIds(out.messages), ["confirm", "staff"]);
    assert.equal(out.created, undefined);
  });

  it("while waiting for the receipt a text reminds the guest, and 'Cancel booking' releases the room", async () => {
    const calls: Calls = [];
    const d = deps(fakeApi({}, calls));
    const waiting: BotSession = { step: "await_receipt", data: { bookingRef: "HE-NEW123" }, strikes: 0 };
    let out = await handle(waiting, text("ok will pay soon"), d);
    assert.equal(out.session.step, "await_receipt");
    assert.deepEqual(buttonIds(out.messages), ["staff", "cancel_booking"]);
    out = await handle(waiting, button("cancel_booking"), d);
    assert.equal(out.session.step, "done");
    assert.deepEqual(calls.find((c) => c.name === "cancel")!.args, ["HE-NEW123", "923001234567"]);
  });

  it("a receipt that can't be saved is not claimed as received", async () => {
    const api = fakeApi({ attachReceipt: async () => ({ ok: false, error: "x" }) });
    const waiting: BotSession = { step: "await_receipt", data: { bookingRef: "HE-NEW123" }, strikes: 0 };
    const out = await handle(waiting, media, deps(api));
    assert.equal(out.session.step, "await_receipt");
    assert.match(bodies(out.messages), /could not save/);
    assert.equal(out.staffAlert, undefined);
  });
});

describe("rates and the advance", () => {
  it("rates show every room's price per night", async () => {
    const calls: Calls = [];
    const out = await handle(newSession(), button("rates"), deps(fakeApi({}, calls)));
    assert.match(bodies(out.messages), /King Room: Rs 8,500 per night/);
    assert.deepEqual((calls.find((c) => c.name === "quote")!.args[0] as { checkIn: string }).checkIn, "2026-11-18");
  });

  it("advance is a percent or the first night, rounded up, never more than the total", () => {
    assert.equal(advanceFor(CONFIG, 17000, 2), 5100);
    assert.equal(advanceFor({ ...CONFIG, advance: { mode: "first_night", value: 0 } }, 17000, 2), 8500);
    assert.equal(advanceFor({ ...CONFIG, advance: { mode: "percent", value: 100 } }, 17000, 2), 17000);
    assert.equal(advanceFor({ ...CONFIG, advance: { mode: "percent", value: 150 } }, 1000, 1), 1000);
  });
});

describe("typed answers work like button taps (for numbers where buttons don't show)", () => {
  it("'confirm', a room name and 'receipt' do what the buttons do", async () => {
    const calls: Calls = [];
    const api = fakeApi({}, calls);
    const d = deps(api);
    let out = await handle(null, text("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, text("2"), d);
    out = await handle(out.session, text("2 adults"), d);
    assert.equal(out.session.step, "pick_room");
    out = await handle(out.session, text("family suite"), d);
    assert.equal(out.session.step, "ask_name");
    assert.equal(out.session.data.roomId, "r-family");
    out = await handle(out.session, text("Ali Raza"), d);
    out = await handle(out.session, text("yes"), d);
    assert.equal(out.session.step, "await_receipt");
    assert.equal(calls.filter((c) => c.name === "create").length, 1);
  });

  it("'what are your rates' shows the rates, 'cancel' ends the booking question", async () => {
    const d = deps(fakeApi());
    let out = await handle(newSession(), text("what are your rates"), d);
    assert.match(bodies(out.messages), /per night/);
    const confirming: BotSession = { step: "confirm", data: { checkIn: "2026-12-05", nights: 2, adults: 2, roomName: "King Room", total: 17000, guestName: "Ali" }, strikes: 0 };
    out = await handle(confirming, text("cancel"), d);
    assert.equal(out.session.step, "done");
  });
});

const INFO = [
  { title: "Location & contact", body: "77A, A Block Gulgasht Colony, Multan. Phone 0317 3330998." },
  { title: "Check-in & check-out", body: "Check-in 24 hours. Check-out 12:00 noon." },
];
const withInfo = (api: HotelApi, over: Partial<BotConfig> = {}): BotDeps => ({ api, now: () => NOW, config: { ...CONFIG, info: INFO, ...over } });

describe("Rates & info (each hotel's own topics)", () => {
  it("the menu button opens this hotel's topics, and a topic is answered with its own words", async () => {
    const d = withInfo(fakeApi());
    let out = await handle(newSession(), button("rates"), d);
    assert.equal(out.session.step, "info");
    const l = out.messages[0];
    assert.equal(l.type, "list");
    if (l.type === "list") assert.deepEqual(l.rows.map((r) => r.title), ["Rooms & rates", "Location & contact", "Check-in & check-out"]);
    out = await handle(out.session, list("i_0"), d);
    assert.match(bodies(out.messages), /77A, A Block/);
    assert.deepEqual(buttonIds(out.messages), ["book", "rates", "staff"]);
    assert.equal(out.session.step, "info");
  });

  it("'Rooms & rates' shows the live rates and offers more info", async () => {
    const d = withInfo(fakeApi());
    let out = await handle(newSession(), button("rates"), d);
    out = await handle(out.session, list("info_rooms"), d);
    assert.match(bodies(out.messages), /King Room: Rs 8,500 per night/);
    assert.ok(buttonIds(out.messages).includes("rates"));
  });

  it("a typed question finds its topic, and a booking word starts the booking", async () => {
    const d = withInfo(fakeApi());
    let out = await handle(newSession(), button("rates"), d);
    const typed = await handle(out.session, text("what is the location?"), d);
    assert.match(bodies(typed.messages), /Gulgasht/);
    const checkin = await handle(out.session, text("what time is check in"), d);
    assert.match(bodies(checkin.messages), /24 hours/);
    out = await handle(out.session, text("I want to book"), d);
    assert.equal(out.session.step, "ask_checkin");
  });

  it("with no topics written, the button goes straight to the rates", async () => {
    const out = await handle(newSession(), button("rates"), deps(fakeApi()));
    assert.match(bodies(out.messages), /per night/);
    assert.equal(out.session.step, "menu");
  });

  it("topics are never mixed between hotels: each bot only knows its own config", async () => {
    const silver = withInfo(fakeApi(), { hotelName: "Hotel Silver Sand Multan", info: [{ title: "Location & contact", body: "514 Akbar Road, Railway Colony, Multan." }] });
    let out = await handle(newSession(), button("rates"), silver);
    out = await handle(out.session, list("i_0"), silver);
    assert.match(bodies(out.messages), /Akbar Road/);
    assert.doesNotMatch(bodies(out.messages), /Gulgasht/);
  });
});

describe("what a guest pays depends on the hotel and the offer", () => {
  const DEAL_ROOMS = [{ ...ROOMS[0], requiresAdvance: true }, ROOMS[1]];
  const bookRoom = async (d: BotDeps, roomIdx: number) => {
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    out = await handle(out.session, list(`r_${roomIdx}`), d);
    out = await handle(out.session, text("Ali Raza"), d);
    return out;
  };

  it("a deal that needs advance payment is paid IN FULL, not 30%", async () => {
    const calls: Calls = [];
    const d = deps(fakeApi({ quote: async () => ({ ok: true, nights: 2, rooms: DEAL_ROOMS }) }, calls));
    let out = await bookRoom(d, 0);
    assert.match(bodies(out.messages), /Payment in advance: Rs 17,000 \(this offer is paid in full in advance\)/);
    out = await handle(out.session, button("confirm"), d);
    assert.equal(out.session.step, "await_receipt");
    assert.match(bodies(out.messages), /the full amount of Rs 17,000/);
  });

  it("a regular rate takes the configured advance", async () => {
    const d = deps(fakeApi({ quote: async () => ({ ok: true, nights: 2, rooms: DEAL_ROOMS }) }));
    const out = await bookRoom(d, 1);
    assert.match(bodies(out.messages), /Advance to confirm: Rs 7,200/); // 30% of 24,000
  });

  it("a pay-at-the-hotel hotel (Silver Sand) asks for no payment and holds no room for a receipt", async () => {
    const d: BotDeps = { api: fakeApi(), now: () => NOW, config: { ...CONFIG, advance: { mode: "none", value: 0 }, paymentText: "" } };
    let out = await bookRoom(d, 0);
    assert.match(bodies(out.messages), /Payment: at the hotel/);
    assert.doesNotMatch(bodies(out.messages), /dvance to confirm/);
    out = await handle(out.session, button("confirm"), d);
    assert.equal(out.session.step, "done");
    assert.equal(out.session.holdUntil, undefined);
    assert.match(bodies(out.messages), /pay at the hotel/);
    assert.doesNotMatch(bodies(out.messages), /receipt/);
    assert.equal(out.created?.bookingRef, "HE-NEW123");
    assert.equal(out.handoff, undefined);
  });

  it("pay-at-the-hotel: an existing pending booking offers status, not a receipt", async () => {
    const d: BotDeps = { api: fakeApi({ lookup: async () => ({ ok: true, bookings: [own()] }) }), now: () => NOW, config: { ...CONFIG, advance: { mode: "none", value: 0 }, paymentText: "" } };
    const out = await handle(null, text("hi"), d);
    assert.deepEqual(buttonIds(out.messages), ["status", "extra", "staff"]);
  });

  it("an advance hotel with no payment details written hands the payment to staff instead of sending an empty message", async () => {
    const d: BotDeps = { api: fakeApi(), now: () => NOW, config: { ...CONFIG, paymentText: "" } };
    let out = await bookRoom(d, 0);
    out = await handle(out.session, button("confirm"), d);
    assert.equal(out.handoff, true);
    assert.match(bodies(out.messages), /send you the payment details/);
    assert.doesNotMatch(bodies(out.messages), /undefined|\n\n\n/);
  });
});

describe("tax is shown like the hotel's website (price before tax, tax, total)", () => {
  // Elegant: 26% GST & city tax on top. King Room 6,000 a night, 2 nights.
  const TAXED = [
    { roomId: "r-king", name: "King Room", total: 15120, perNight: 7560, nights: 2, refundable: true, requiresAdvance: false, available: true, preTax: 12000 },
    { roomId: "r-fam", name: "Family Suite", total: 28224, perNight: 14112, nights: 2, refundable: true, requiresAdvance: false, available: true, preTax: 22400 },
  ];
  const api = () => fakeApi({ quote: async () => ({ ok: true, nights: 2, rooms: TAXED }) });

  it("the room list says rate + tax = total", async () => {
    const d = deps(api());
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    const l = out.messages[0];
    assert.equal(l.type, "list");
    if (l.type === "list") assert.equal(l.rows[0].description, "Rs 12,000 + Rs 3,120 tax = Rs 15,120");
  });

  it("the summary lists the room, the tax with its percent, and the total", async () => {
    const d = deps(api());
    let out = await handle(null, button("book"), d);
    out = await handle(out.session, text("5 dec"), d);
    out = await handle(out.session, button("n_2"), d);
    out = await handle(out.session, list("g_2_0"), d);
    out = await handle(out.session, list("r_0"), d);
    out = await handle(out.session, text("Ali Raza"), d);
    assert.match(bodies(out.messages), /Room: Rs 12,000\nTax \(26%\): Rs 3,120\nTotal: Rs 15,120/);
  });

  it("the rates show the price per night before tax with the tax percent", async () => {
    const out = await handle(newSession(), button("rates"), deps(api()));
    assert.match(bodies(out.messages), /King Room: Rs 6,000 per night \+ 26% tax/);
    assert.match(bodies(out.messages), /before tax/);
  });

  it("a hotel that sends no pre-tax price keeps the tax-included wording", async () => {
    const out = await handle(newSession(), button("rates"), deps(fakeApi()));
    assert.match(bodies(out.messages), /taxes included/);
  });
});
