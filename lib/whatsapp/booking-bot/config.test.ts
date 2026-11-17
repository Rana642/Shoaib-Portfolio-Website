import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBotSettings } from "./config";

const GOOD = { enabled: true, hotelName: "Hotel Elegant Executive Suites", advanceMode: "percent", advanceValue: 30, holdMinutes: 120, paymentText: "Easypaisa 0300 0000000 (Hotel Elegant)" };

describe("parseBotSettings", () => {
  it("accepts complete settings", () => {
    const r = parseBotSettings(GOOD);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.config, { hotelName: "Hotel Elegant Executive Suites", advance: { mode: "percent", value: 30 }, holdMinutes: 120, paymentText: "Easypaisa 0300 0000000 (Hotel Elegant)", info: [] });
  });

  it("numbers typed as text (from a form) are fine", () => {
    const r = parseBotSettings({ ...GOOD, advanceValue: "25", holdMinutes: "90" });
    assert.ok(r.ok && r.config.advance.value === 25 && r.config.holdMinutes === 90);
  });

  it("first night needs no percent", () => {
    const r = parseBotSettings({ ...GOOD, advanceMode: "first_night", advanceValue: undefined });
    assert.ok(r.ok && r.config.advance.mode === "first_night");
  });

  it("off, empty or missing settings never run", () => {
    for (const raw of [null, undefined, {}, "x", { ...GOOD, enabled: false }, { ...GOOD, enabled: "true" }]) assert.equal(parseBotSettings(raw).ok, false, JSON.stringify(raw));
  });

  it("each missing or silly part is named", () => {
    const cases: [object, RegExp][] = [
      [{ ...GOOD, hotelName: " " }, /hotel's name/],
      [{ ...GOOD, paymentText: "" }, /pay the advance/],
      [{ ...GOOD, paymentText: "x".repeat(700) }, /pay the advance/],
      [{ ...GOOD, advanceMode: "half" }, /Choose the advance/],
      [{ ...GOOD, advanceValue: 0 }, /percent must be/],
      [{ ...GOOD, advanceValue: 150 }, /percent must be/],
      [{ ...GOOD, holdMinutes: 5 }, /Hold the room/],
      [{ ...GOOD, holdMinutes: 5000 }, /Hold the room/],
    ];
    for (const [raw, re] of cases) {
      const r = parseBotSettings(raw);
      assert.ok(!r.ok && re.test(r.problem), JSON.stringify(raw));
    }
  });

  it("the settings form can be checked before switching on", () => {
    assert.ok(parseBotSettings({ ...GOOD, enabled: false }, { requireEnabled: false }).ok);
  });
});

describe("hotel info topics and no-advance hotels", () => {
  it("topics are trimmed, blank ones dropped, titles cut to 24 and at most 9 kept", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Topic ${i}`, body: "Answer" }));
    const r = parseBotSettings({ ...GOOD, info: [{ title: "  Location & contact  ", body: " 77A, A Block " }, { title: "", body: "x" }, { title: "No body", body: " " }, "junk", null, { title: "A very long topic title that overflows", body: "b" }, ...many] });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.config.info[0], { title: "Location & contact", body: "77A, A Block" });
      assert.equal(r.config.info[1].title.length, 24);
      assert.equal(r.config.info.length, 9);
    }
  });

  it("no topics means an empty list, not an error", () => {
    const r = parseBotSettings(GOOD);
    assert.ok(r.ok && r.config.info.length === 0);
  });

  it("'none' (pay at the hotel) needs no payment text, percent or hold time", () => {
    const r = parseBotSettings({ enabled: true, hotelName: "Hotel Silver Sand Multan", advanceMode: "none" });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.config.advance, { mode: "none", value: 0 });
  });

  it("every other mode still needs the payment text", () => {
    assert.equal(parseBotSettings({ ...GOOD, paymentText: "", advanceMode: "first_night" }).ok, false);
  });
});
