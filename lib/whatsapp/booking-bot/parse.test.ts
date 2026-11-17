import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, findBookingRef, nightsBetween, parseDate, parseGuests, parseName, parseNights, roundUp100, todayKarachi } from "./parse";

// 17 Nov 2026, 10:00 in Pakistan (05:00 UTC)
const NOW = new Date("2026-11-17T05:00:00Z");

describe("parseDate", () => {
  it("understands today, tomorrow and the day after", () => {
    assert.equal(parseDate("today", NOW), "2026-11-17");
    assert.equal(parseDate("Aaj", NOW), "2026-11-17");
    assert.equal(parseDate("tomorrow", NOW), "2026-11-18");
    assert.equal(parseDate("kal", NOW), "2026-11-18");
    assert.equal(parseDate("parso", NOW), "2026-11-19");
    assert.equal(parseDate("day after tomorrow", NOW), "2026-11-19");
  });

  it("reads day and month in the ways people write them", () => {
    for (const t of ["5 dec", "5th December", "5 Dec 2026", "dec 5", "05/12", "5-12", "5/12/2026", "2026-12-05", "check in 5th dec please"]) {
      assert.equal(parseDate(t, NOW), "2026-12-05", t);
    }
  });

  it("a date that already passed this year means next year", () => {
    assert.equal(parseDate("5 jan", NOW), "2027-01-05");
    assert.equal(parseDate("1 nov", NOW), "2027-11-01");
  });

  it("refuses what is not a usable date", () => {
    for (const t of ["", "hello", "31 feb", "32/1", "2026-11-10", "5 dec 2030", "yes", "13/13"]) assert.equal(parseDate(t, NOW), null, t);
  });

  it("uses Pakistan time for today (just after midnight there is already the next day)", () => {
    const lateUtc = new Date("2026-11-17T20:30:00Z"); // 01:30 on 18 Nov in Pakistan
    assert.equal(todayKarachi(lateUtc), "2026-11-18");
    assert.equal(parseDate("today", lateUtc), "2026-11-18");
  });
});

describe("dates helpers", () => {
  it("adds days and counts nights across a month end", () => {
    assert.equal(addDays("2026-11-29", 3), "2026-12-02");
    assert.equal(nightsBetween("2026-11-29", "2026-12-02"), 3);
  });
});

describe("parseNights", () => {
  it("takes 1 to 30", () => {
    assert.equal(parseNights("3"), 3);
    assert.equal(parseNights("4 nights"), 4);
    assert.equal(parseNights("for 12 nights"), 12);
  });
  it("refuses 0, more than 30 and no number", () => {
    for (const t of ["0", "31", "many", ""]) assert.equal(parseNights(t), null, t);
  });
});

describe("parseGuests", () => {
  it("reads the list ids", () => {
    assert.deepEqual(parseGuests({ id: "g_2_0" }), { adults: 2, children: 0 });
    assert.deepEqual(parseGuests({ id: "g_2_2" }), { adults: 2, children: 2 });
    assert.equal(parseGuests({ id: "g_9_0" }), null);
  });
  it("reads typed answers", () => {
    assert.deepEqual(parseGuests({ text: "2 adults 1 child" }), { adults: 2, children: 1 });
    assert.deepEqual(parseGuests({ text: "3 persons" }), { adults: 3, children: 0 });
    assert.deepEqual(parseGuests({ text: "4" }), { adults: 4, children: 0 });
    assert.deepEqual(parseGuests({ text: "2 bande 2 bache" }), { adults: 2, children: 2 });
    assert.deepEqual(parseGuests({ text: "1 child" }), { adults: 1, children: 1 });
  });
  it("refuses nonsense and absurd sizes", () => {
    for (const t of ["", "hello", "0", "20", "9 adults"]) assert.equal(parseGuests({ text: t }), null, t);
  });
});

describe("parseName", () => {
  it("takes a plain name, also in Urdu script", () => {
    assert.equal(parseName("  Ali   Raza "), "Ali Raza");
    assert.equal(parseName("Dr. Ahmed Uzair"), "Dr. Ahmed Uzair");
    assert.equal(parseName("علی رضا"), "علی رضا");
  });
  it("refuses numbers, one letter and links", () => {
    for (const t of ["", "A", "12345", "http://x.com", "x".repeat(70)]) assert.equal(parseName(t), null, t);
  });
});

describe("findBookingRef", () => {
  it("finds the ref the website puts in its WhatsApp message", () => {
    assert.equal(findBookingRef("📋 *Booking Ref:* HE-CAMHUD\nRoom: King"), "HE-CAMHUD");
    assert.equal(findBookingRef("my ref is he-4esssv ok"), "HE-4ESSSV");
    assert.equal(findBookingRef("hello"), null);
    assert.equal(findBookingRef(null), null);
  });
});

describe("roundUp100", () => {
  it("rounds up to a tidy advance", () => {
    assert.equal(roundUp100(2501), 2600);
    assert.equal(roundUp100(2500), 2500);
  });
});
