import { runPageSpeed } from "../lib/pagespeed";

// Usage: tsx --conditions=react-server --env-file=.env.local scripts/run-pagespeed.mts https://adsbyshoaib.com/ [mobile|desktop]
const url = process.argv[2] ?? "https://adsbyshoaib.com/";
const strategy = (process.argv[3] as "mobile" | "desktop" | undefined) ?? "mobile";
const out = await runPageSpeed({ url, strategy, categories: ["performance", "accessibility", "best-practices", "seo"] });
console.log(JSON.stringify(out, null, 2));
