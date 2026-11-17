import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOptInYes, optInTextProblem } from "./words";

describe("isOptInYes", () => {
  it("takes the exact answers a guest would give, whatever the case or punctuation", () => {
    for (const a of ["YES", "yes", " Yes! ", "y", "Haan", "han ji", "Yes please.", "HAAN!!"]) assert.equal(isOptInYes(a), true, a);
  });

  it("does not take a yes inside another sentence, or an empty message, as consent", () => {
    for (const a of ["yes I want a room tomorrow", "no", "yesterday", "", "  ", null, undefined, "STOP", "ok"]) assert.equal(isOptInYes(a as string | null | undefined), false, String(a));
  });
});

describe("optInTextProblem", () => {
  it("wants both how to agree (YES) and how to stop (STOP)", () => {
    assert.equal(optInTextProblem("Want offers on WhatsApp? Reply YES to agree. Send STOP any time to stop."), null);
    assert.ok(optInTextProblem("Want offers on WhatsApp? Reply YES."));
    assert.ok(optInTextProblem("Send STOP to stop offers."));
    assert.ok(optInTextProblem("Hello there"));
  });
});

describe("isOptInPrompt", () => {
  it("recognises only the stored opt-in question", async () => {
    const { isOptInPrompt } = await import("./words");
    assert.equal(isOptInPrompt({ kind: "optin_prompt" }), true);
    assert.equal(isOptInPrompt({ kind: "other" }), false);
    assert.equal(isOptInPrompt({ template: "x" }), false);
    assert.equal(isOptInPrompt(null), false);
    assert.equal(isOptInPrompt("optin_prompt"), false);
  });
});

describe("STOP and START are matched as loosely as YES", async () => {
  const { isStopWord, isStartWord } = await import("./words");
  it("takes Stop., STOP! and unsubscribe, but not a sentence", () => {
    for (const a of ["STOP", "stop", "Stop.", "STOP!", " stop ", "Unsubscribe", "stop all", "opt out"]) assert.equal(isStopWord(a), true, a);
    for (const a of ["please don't stop", "stopping by tomorrow", "", null, "yes"]) assert.equal(isStopWord(a as string | null), false, String(a));
    assert.equal(isStartWord("Start!"), true);
    assert.equal(isStartWord("restart"), false);
  });
});
