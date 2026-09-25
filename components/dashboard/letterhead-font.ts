import { Inter } from "next/font/google";

// The letterhead's typeface — matched against Shoaib's Canva export by
// overlaying candidates on the original (Inter lined up glyph-for-glyph).
// Kept in its own module so only the letterhead route ever loads it.
export const letterheadFont = Inter({ subsets: ["latin"], display: "swap" });
