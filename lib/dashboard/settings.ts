import { db } from "./db";
import type { Settings } from "./types";

const fallback: Settings = {
  id: 1,
  business_name: "Ads by Shoaib",
  business_email: "hello@adsbyshoaib.com",
  business_phone: "+92 301 7461642",
  business_address: "Multan, Punjab, Pakistan",
  default_currency: "PKR",
  tax_enabled: false,
  tax_name: "GST",
  tax_rate: 0,
  invoice_prefix: "INV",
  quote_prefix: "QUO",
  proposal_prefix: "PRO",
  payment_terms: "Payment due within 14 days of invoice date.",
  bank_details: null,
  updated_at: new Date().toISOString(),
};

/** Settings row is seeded by the schema; the fallback covers the window
 *  before the SQL has been run. */
export async function getSettings(): Promise<Settings> {
  const { data } = await db.from("settings").select("*").eq("id", 1).single();
  return (data as Settings) ?? fallback;
}
