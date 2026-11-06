import assert from "node:assert/strict";
import { checkCaption, checkSchedule, checkDuplicates, captionSimilarity, pktWeekday } from "../lib/post-preflight-checks";

const codes = (f: { code: string }[]) => f.map((x) => x.code).sort();
assert.deepEqual(codes(checkCaption("Fresh stock is here 🎉 for every dealer.")), ["emoji", "forbidden-word"]);
assert.deepEqual(codes(checkCaption("Clean caption about the new offer.")), []);
assert.deepEqual(codes(checkCaption("Visit the the showroom today!!!")), ["punctuation", "repeated-word"]);
assert.ok(codes(checkCaption("BUY NOW AND SAVE BIG ON EVERYTHING IN STORE TODAY")).includes("all-caps"));

const now = new Date("2026-11-07T10:00:00Z");
assert.deepEqual(codes(checkSchedule("2026-11-05T05:00:00Z", now)), ["in-the-past"]);
// 2026-11-13 is a Friday; 05:00Z = 10:00 PKT
assert.equal(pktWeekday("2026-11-13T05:00:00Z"), 5);
assert.deepEqual(codes(checkSchedule("2026-11-13T05:00:00Z", now)), ["friday"]);
// Thursday 20:00Z = Friday 01:00 PKT
assert.deepEqual(codes(checkSchedule("2026-11-12T20:00:00Z", now)), ["friday"]);
assert.deepEqual(codes(checkSchedule("2026-11-10T05:00:00Z", now)), []);

const self = { id: "a", original_filename: "Post-95.png", media_key: "k1", caption: "New arrivals this week at our showroom." };
const others = [
  { id: "b", original_filename: "post-95.PNG", media_key: "k9", caption: "x", scheduled_at: "2026-10-01T05:00:00Z" },
  { id: "c", original_filename: "other.png", media_key: "k2", caption: "New arrivals this week at our showroom!", scheduled_at: null },
  { id: "d", original_filename: "z.png", media_key: "k3", caption: "Totally different words here.", scheduled_at: null },
];
assert.deepEqual(codes(checkDuplicates(self, others)), ["duplicate-caption", "duplicate-image"]);
assert.ok(captionSimilarity("a b c", "x y z") === 0);
console.log("preflight tests ok");
