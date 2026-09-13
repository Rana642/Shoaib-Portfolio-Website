// Shared between the server-only insights loader (lib/social-insights.ts)
// and the client-side insights UI — deliberately free of "server-only" so
// both sides can import it.

export const INSIGHT_RANGES = [7, 28, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export function parseInsightRange(raw: string | undefined): InsightRange {
  const n = Number(raw);
  return (INSIGHT_RANGES as readonly number[]).includes(n) ? (n as InsightRange) : 28;
}

export type TrendPoint = { date: string; value: number };
