import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY || "";

export const isResendConfigured = Boolean(apiKey);

export const fromEmail = process.env.RESEND_FROM_EMAIL || "hello@adsbyshoaib.com";
export const toEmail = process.env.RESEND_TO_EMAIL || "shoaib.nabi.noor@gmail.com";

// Placeholder key keeps construction valid before Shoaib adds a real one;
// isResendConfigured gates every actual send.
export const resend = new Resend(apiKey || "placeholder-api-key");
