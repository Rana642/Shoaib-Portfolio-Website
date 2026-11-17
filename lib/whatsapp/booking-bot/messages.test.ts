import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotMessage } from "./engine";
import { plainText, toInteractive } from "./messages";

describe("toInteractive", () => {
  it("text is not interactive", () => {
    assert.equal(toInteractive({ type: "text", body: "hi" }), null);
  });

  it("buttons: at most 3, titles cut to 20, ids kept", () => {
    const m: BotMessage = {
      type: "buttons",
      body: "Choose",
      buttons: [{ id: "a", title: "A very long button title indeed" }, { id: "b", title: "B" }, { id: "c", title: "C" }, { id: "d", title: "D" }],
    };
    const p = toInteractive(m) as { type: string; action: { buttons: { reply: { id: string; title: string } }[] } };
    assert.equal(p.type, "button");
    assert.equal(p.action.buttons.length, 3);
    assert.equal(p.action.buttons[0].reply.id, "a");
    assert.ok(p.action.buttons[0].reply.title.length <= 20);
  });

  it("list: at most 10 rows, title 24, description 72, one section", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r_${i}`, title: `Room number ${i} with a long name`, description: "d".repeat(100) }));
    const p = toInteractive({ type: "list", body: "Pick", button: "Choose a room please now", rows }) as {
      type: string;
      action: { button: string; sections: { rows: { id: string; title: string; description: string }[] }[] };
    };
    assert.equal(p.type, "list");
    assert.equal(p.action.sections.length, 1);
    assert.equal(p.action.sections[0].rows.length, 10);
    assert.ok(p.action.sections[0].rows[0].title.length <= 24);
    assert.ok(p.action.sections[0].rows[0].description.length <= 72);
    assert.ok(p.action.button.length <= 20);
  });

  it("a body longer than 1024 is cut", () => {
    const p = toInteractive({ type: "buttons", body: "x".repeat(2000), buttons: [{ id: "a", title: "A" }] }) as { body: { text: string } };
    assert.ok(p.body.text.length <= 1024);
  });
});

describe("plainText", () => {
  it("lists the options so a guest can type one", () => {
    assert.match(plainText({ type: "buttons", body: "Hi", buttons: [{ id: "book", title: "Book a room" }, { id: "staff", title: "Talk to staff" }] }), /• Book a room\n• Talk to staff/);
    assert.match(plainText({ type: "list", body: "Pick", button: "Go", rows: [{ id: "r_0", title: "King Room", description: "Rs 17,000" }] }), /1\. King Room \(Rs 17,000\)/);
  });
});
