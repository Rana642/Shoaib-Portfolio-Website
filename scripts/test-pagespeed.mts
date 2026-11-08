import assert from "node:assert/strict";
import { summarizePsi } from "../lib/pagespeed";

// A trimmed PSI-shaped response: checks the summary keeps scores, lab numbers, CrUX data and sorted opportunities.
const sample = {
  id: "https://example.com/",
  analysisUTCTimestamp: "2026-11-08T10:00:00Z",
  lighthouseResult: {
    finalUrl: "https://example.com/",
    categories: { performance: { score: 0.87 }, seo: { score: 1 } },
    audits: {
      "largest-contentful-paint": { displayValue: "2.1 s", numericValue: 2100 },
      "cumulative-layout-shift": { displayValue: "0.01", numericValue: 0.01 },
      "uses-optimized-images": { title: "Efficiently encode images", score: 0.4, displayValue: "Potential savings of 120 KiB", details: { type: "opportunity", overallSavingsMs: 600 } },
      "render-blocking-resources": { title: "Eliminate render-blocking resources", score: 0.5, details: { type: "opportunity", overallSavingsMs: 1200 } },
      "tiny-saving": { title: "Tiny", score: 0.2, details: { type: "opportunity", overallSavingsMs: 20 } },
      "already-good": { title: "Good", score: 1, details: { type: "opportunity", overallSavingsMs: 900 } },
    },
  },
  loadingExperience: { overall_category: "FAST", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1900, category: "FAST" } } },
};

const out = summarizePsi(sample, "mobile");
assert.deepEqual(out.scores, { performance: 87, seo: 100 });
assert.equal(out.lab["Largest Contentful Paint"], "2.1 s");
assert.deepEqual(out.topOpportunities.map((o) => o.title), ["Eliminate render-blocking resources", "Efficiently encode images"]);
assert.ok(typeof out.realUsers === "object" && "LCP" in out.realUsers.metrics);
assert.equal(summarizePsi({ lighthouseResult: { audits: {} } }, "desktop").topOpportunities.length, 0);
assert.ok(typeof summarizePsi({}, "mobile").realUsers === "string"); // no CrUX data → says so
console.log("pagespeed summary tests ok");
