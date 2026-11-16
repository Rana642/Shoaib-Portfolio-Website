import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyToStored, contactKey, csvCell, fromWebsite, fromWhatsApp, mergeCandidates, numberKeyOf, phoneKey } from "./contacts-merge";
import { validateTemplate, type TemplateInput } from "../whatsapp/template-shared";
import { pickActive } from "./active-project-pick";

describe("phoneKey and contactKey", () => {
  it("makes every way of writing a Pakistani number the same key", () => {
    for (const raw of ["0317-333 0998", "+92 317 3330998", "923173330998", "03173330998"]) assert.equal(phoneKey(raw), "923173330998", raw);
  });

  it("refuses too-short numbers and falls back to e-mail, then name", () => {
    assert.equal(phoneKey("12345"), null);
    assert.equal(contactKey("12", " Guest@Mail.com "), "e:guest@mail.com");
    assert.equal(contactKey(null, null, " Ali "), "n:ali");
    assert.equal(contactKey(null, null, null), null);
  });
});

describe("mergeCandidates", () => {
  const web = fromWebsite([
    { key: "x", name: "Ali Khan", phone: "0317 333 0998", email: "ali@x.com", bookings: 2, inquiries: 1, totalSpent: 15000, lastActivity: "2026-11-01T10:00:00Z" },
    { key: "y", name: "Sara", phone: null, email: null, bookings: 0, inquiries: 0, totalSpent: 0, lastActivity: "2026-10-01T10:00:00Z" },
  ]);
  const wa = fromWhatsApp([
    { wa_id: "923173330998", name: "Ali (WA)", created_at: "2026-09-01T08:00:00Z", last_message_at: "2026-11-13T09:00:00Z" },
    { wa_id: "923009998877", name: null, created_at: "2026-11-02T08:00:00Z", last_message_at: null },
  ]);

  it("joins a person found on the website and on WhatsApp into one contact", () => {
    const all = mergeCandidates([...web, ...wa]);
    const ali = all.find((c) => c.key === "923173330998");
    assert.ok(ali);
    assert.deepEqual([...ali.sources].sort(), ["website_booking", "website_inquiry", "whatsapp"]);
    assert.equal(ali.name, "Ali Khan", "the website, listed first, names him");
    assert.equal(ali.email, "ali@x.com");
    assert.equal(ali.phone, "0317 333 0998");
    assert.equal(ali.bookings, 2);
    assert.equal(ali.chats, 1);
    assert.equal(ali.firstSeen, "2026-09-01T08:00:00Z");
    assert.equal(ali.lastActivity, "2026-11-13T09:00:00Z");
  });

  it("keeps a WhatsApp-only guest, with a +number and the chat date as last activity", () => {
    const g = mergeCandidates(wa).find((c) => c.key === "923009998877");
    assert.equal(g?.phone, "+923009998877");
    assert.equal(g?.lastActivity, "2026-11-02T08:00:00Z");
  });

  it("calls a website row with no bookings an inquiry, and drops rows with nothing to key on", () => {
    assert.deepEqual(web.map((c) => c.sources), [["website_booking", "website_inquiry"], ["website_inquiry"]]);
    assert.equal(fromWebsite([{ key: "z", name: "", phone: null, email: null, bookings: 0, inquiries: 0, totalSpent: 0, lastActivity: "x" }]).length, 0);
    assert.equal(fromWhatsApp([{ wa_id: "x", name: null, created_at: "t", last_message_at: null }]).length, 0);
  });
});

describe("applyToStored", () => {
  const cand = mergeCandidates(fromWhatsApp([{ wa_id: "923001112233", name: "WA Name", created_at: "t", last_message_at: "t" }]))[0]!;

  it("never loses a source and does not forget what was typed by hand", () => {
    const stored = { contact_key: cand.key, name: "Typed Name", phone: "0300 111 2233", email: "t@t.com", sources: ["manual", "website_booking"] };
    const out = applyToStored(cand, stored);
    assert.equal(out.name, "Typed Name");
    assert.equal(out.email, "t@t.com");
    assert.deepEqual([...out.sources].sort(), ["manual", "website_booking", "whatsapp"]);
  });

  it("lets a synced name win for a contact nobody typed, but fills gaps from what is stored", () => {
    const out = applyToStored({ ...cand, name: null }, { contact_key: cand.key, name: "Old", phone: null, email: null, sources: ["whatsapp"] });
    assert.equal(out.name, "Old");
    assert.equal(applyToStored(cand, { contact_key: cand.key, name: "Old", phone: null, email: null, sources: ["whatsapp"] }).name, "WA Name");
  });

  it("returns the candidate unchanged when nothing is stored yet", () => {
    assert.equal(applyToStored(cand, undefined), cand);
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and new lines", () => {
    assert.equal(csvCell('He said "hi", then left'), '"He said ""hi"", then left"');
    assert.equal(csvCell("a\nb"), '"a\nb"');
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(12), "12");
  });

  it("defuses spreadsheet formulas but leaves phone numbers alone", () => {
    assert.equal(csvCell("=HYPERLINK(\"http://x\")").startsWith("\"'="), true);
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(csvCell("+92 317 3330998"), "+92 317 3330998");
    assert.equal(csvCell("-5"), "-5");
  });
});

describe("pickActive", () => {
  const projects = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  it("uses the chosen business only if it is the person's own, else the first", () => {
    assert.equal(pickActive(projects, "b")?.id, "b");
    assert.equal(pickActive(projects, "someone-elses")?.id, "a");
    assert.equal(pickActive(projects, undefined)?.id, "a");
  });
  it("is null for a person with no business", () => {
    assert.equal(pickActive([], "a"), null);
  });
});

describe("numberKeyOf", () => {
  it("turns any way of typing a number into the stored key, and ignores words", () => {
    assert.equal(numberKeyOf("0317 333 0998"), "923173330998");
    assert.equal(numberKeyOf("+92 317 3330998"), "923173330998");
    assert.equal(numberKeyOf("317"), null, "too short to be a number");
    assert.equal(numberKeyOf("ali 0317"), null, "a name with digits is a name search");
  });
});

describe("validateTemplate (category and language)", () => {
  const ok: TemplateInput = { name: "winter_offer", category: "MARKETING", language: "en", header: "", body: "Hello, our winter offer is on.", footer: "", examples: [], quickReplies: [], urlButton: null };
  it("accepts Utility and Marketing with a normal language code", () => {
    assert.equal(validateTemplate(ok), null);
    assert.equal(validateTemplate({ ...ok, category: "UTILITY", language: "en_US" }), null);
  });
  it("refuses another category or a made-up language, which the portal sends from the browser", () => {
    assert.ok(validateTemplate({ ...ok, category: "AUTHENTICATION" as never }));
    assert.ok(validateTemplate({ ...ok, language: "english; drop" }));
  });
});
